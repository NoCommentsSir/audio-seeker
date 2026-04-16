import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from minio import Minio
from minio.error import S3Error
from sqlalchemy.orm import Session

from ..core.services import (
    TrackPersistenceError,
    TrackServiceError,
    TrackStorageError,
    TrackValidationError,
    create_track,
    delete_track,
    list_tracks,
    search_track,
    get_track_by_id,
)
from ..core.admin_auth import (
    authenticate_admin,
    create_admin_token,
    verify_admin_token,
)
from ..db.database import MINIO_BUCKET_NAME, get_db, get_minio_client
from .schemas import (
    SearchMode,
    TrackListResponse,
    TrackResponse,
    TrackSearchResponse,
    TrackSearchResult,
    AdminLoginRequest,
    AdminTokenResponse,
)


load_dotenv()


def _load_cors_origins() -> list[str]:
    origins = os.getenv("CORS_ALLOWED_ORIGINS")
    if origins:
        return [origin.strip() for origin in origins.split(",") if origin.strip()]

    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


async def verify_admin_token_header(authorization: str | None = Header(None)) -> bool:
    """Extract and verify admin token from Authorization header."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Invalid authorization scheme")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
        )
    
    payload = verify_admin_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin token",
        )
    
    return True


api = FastAPI(title="Audioseeker API")
api.add_middleware(
    CORSMiddleware,
    allow_origins=_load_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_upload_bytes(file: UploadFile) -> bytes:
    try:
        file.file.seek(0)
        return file.file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read the uploaded file.",
        ) from exc


def _to_track_response(track) -> TrackResponse:
    return TrackResponse(
        track_id=track.track_id,
        track_name=track.track_name,
        track_author=track.track_author,
        track_minio_key=str(track.track_minio_key),
    )


def _build_search_response(outcome, mode: SearchMode) -> TrackSearchResponse:
    if outcome.match is None:
        message = "Search timed out. No result." if outcome.timed_out else "No result"
        if mode == "approximate" and outcome.timed_out:
            message = "Search timed out. No result."
        return TrackSearchResponse(
            matched=False,
            mode=mode,
            is_exact=False,
            timed_out=outcome.timed_out,
            message=message,
            result=None,
        )

    if outcome.timed_out:
        message = "Search timed out. Returning the best match found so far."
    elif outcome.is_exact:
        message = "Track matched"
    else:
        message = "No exact match. Here is the closest match in our database"

    result = TrackSearchResult(
        track_id=outcome.match.track_id,
        track_name=outcome.match.track_name,
        track_author=outcome.match.track_author,
        track_minio_key=outcome.match.track_minio_key,
        matches=outcome.match.matches,
        time_offset=outcome.match.time_offset,
    )

    return TrackSearchResponse(
        matched=True,
        mode=mode,
        is_exact=outcome.is_exact,
        timed_out=outcome.timed_out,
        message=message,
        result=result,
    )

@api.post("/api/admin/login", response_model=AdminTokenResponse)
def admin_login(request: AdminLoginRequest):
    """Authenticate admin with password and return JWT token."""
    if not authenticate_admin(request.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin password",
        )
    
    access_token = create_admin_token()
    return AdminTokenResponse(
        access_token=access_token,
        token_type="bearer",
    )

@api.get("/")
def read_root():
    return HTMLResponse(content="<h2>Hello!</h2>")


@api.get("/api/tracks", response_model=TrackListResponse)
def get_tracks(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    query: str | None = Query(None),
    db: Session = Depends(get_db),
):
    try:
        tracks, total = list_tracks(db, skip=skip, limit=limit, query=query)
    except (TrackStorageError, TrackPersistenceError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except TrackServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return TrackListResponse(
        items=[_to_track_response(track) for track in tracks],
        total=total,
        skip=skip,
        limit=limit,
        has_more=skip + limit < total,
    )


@api.delete("/api/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_track(
    track_id: int,
    db: Session = Depends(get_db),
    minio: Minio = Depends(get_minio_client),
    _: bool = Depends(verify_admin_token_header),
):
    try:
        deleted = delete_track(db, minio, MINIO_BUCKET_NAME, track_id)
    except TrackStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except TrackPersistenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found.",
        )

    return None


@api.post(
    "/api/tracks",
    response_model=TrackResponse,
    status_code=status.HTTP_201_CREATED,
)
def insert_track(
    file: Annotated[UploadFile, File(...)],
    name: Annotated[str, Form(...)],
    author: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
    minio: Minio = Depends(get_minio_client),
    _: bool = Depends(verify_admin_token_header),
):
    file_bytes = _read_upload_bytes(file)

    try:
        track = create_track(
            db,
            minio,
            MINIO_BUCKET_NAME,
            file_bytes=file_bytes,
            filename=file.filename,
            name=name,
            author=author,
        )
    except TrackValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except (TrackStorageError, TrackPersistenceError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except TrackServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return _to_track_response(track)


@api.post("/api/tracks/search", response_model=TrackSearchResponse)
def find_track_by_audio(
    file: Annotated[UploadFile, File(...)],
    mode: Annotated[SearchMode, Form(...)],
    db: Session = Depends(get_db),
):
    file_bytes = _read_upload_bytes(file)

    try:
        outcome = search_track(
            db,
            file_bytes=file_bytes,
            filename=file.filename,
            mode=mode,
        )
    except TrackValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except TrackServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return _build_search_response(outcome, mode)

@api.get("/api/tracks/{track_id}/stream")
def stream_track(
    track_id: int,
    db: Session = Depends(get_db),
    minio: Minio = Depends(get_minio_client),
):
    """Отдаёт аудиофайл из MinIO с поддержкой range-запросов (для перемотки)"""
    
    track = get_track_by_id(db, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Получаем объект из MinIO
    try:
        obj = minio.get_object(
            bucket_name=MINIO_BUCKET_NAME,
            object_name=str(track.track_minio_key) + '.wav',
        )
        
        # Определяем content-type по расширению
        content_type = "audio/wav"
        
        return StreamingResponse(
            obj,
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Disposition": f"inline; filename={track.track_name}.wav",
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"MinIO error: {str(e)}"
            ) from e