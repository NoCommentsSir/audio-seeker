from fastapi import FastAPI, Depends, Query, HTTPException, status, UploadFile, File
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, delete
from minio import Minio
from dotenv import load_dotenv

from ..db.database import *
from ..db.models import Track


load_dotenv()
MINIO_BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "localhost")
api = FastAPI()

@api.get("/")
def read_root():
    html_content = "<h2>Hello!</h2>"
    return HTMLResponse(content=html_content)

@api.get("/api/tracks")
def get_tracks(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    tracks = db.query(Track).offset(skip).limit(limit).all()
    total = db.query(func.count(Track.track_id)).scalar()

    return {
        "items": tracks,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": skip + limit < total
    }

@api.delete("/api/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(
    id: int,
    db: Session = Depends(get_db),
    minio: Minio = Depends(get_minio_client)
):
    track = db.query(Track).filter(Track.track_id == id).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Трек не найден"
        )
    
    try:
        obj_name = f'{track.track_minio_key}.wav'
        minio.remove_object(MINIO_BUCKET_NAME, obj_name)
        db.delete(track)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении: {str(e)}"
        )
    
@api.post("/api/tracks", status_code=status.HTTP_202_ACCEPTED)
def insert_track(
    file: UploadFile,
    author: str,
    name: str,
    db: Session = Depends(get_db),
    minio: Minio = Depends(get_minio_client)
):
    pass