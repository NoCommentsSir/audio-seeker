from __future__ import annotations

import io
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from minio import Minio
from minio.error import S3Error
from scipy.io.wavfile import read as read_wav
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..db.models import Track, Track_Fingerprint
from .Seeker import ProcessingDeadlineExceeded, create_fingerprints, create_map


DEFAULT_MATCH_THRESHOLD = 5
SEARCH_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
SEARCH_MAX_DURATION_SECONDS = 10 * 60
SEARCH_TIMEOUT_SECONDS = 30
SUPPORTED_AUDIO_EXTENSIONS = {".wav"}
IGNORED_STORAGE_DELETE_ERRORS = {"NoSuchBucket", "NoSuchKey", "NoSuchObject", "NoSuchVersion"}


class TrackServiceError(Exception):
    """Base exception for track service failures."""


class TrackValidationError(TrackServiceError):
    """Raised when incoming user data is invalid."""


class TrackStorageError(TrackServiceError):
    """Raised when MinIO operations fail."""


class TrackPersistenceError(TrackServiceError):
    """Raised when database operations fail."""


@dataclass(slots=True)
class ParsedAudio:
    sample_rate: int
    samples: np.ndarray
    duration_seconds: float


@dataclass(slots=True)
class SearchMatch:
    track_id: int
    track_name: str
    track_author: str | None
    track_minio_key: str
    matches: int
    time_offset: int


@dataclass(slots=True)
class SearchOutcome:
    match: SearchMatch | None
    is_exact: bool
    timed_out: bool


@dataclass(slots=True)
class _BestMatchState:
    track_id: int
    matches: int
    time_offset: int


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _validate_wav_filename(filename: str | None) -> None:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in SUPPORTED_AUDIO_EXTENSIONS:
        raise TrackValidationError("Only .wav files are supported.")


def _parse_wav_bytes(file_bytes: bytes) -> ParsedAudio:
    if not file_bytes:
        raise TrackValidationError("Uploaded file is empty.")

    try:
        sample_rate, samples = read_wav(io.BytesIO(file_bytes))
    except Exception as exc:
        raise TrackValidationError("Uploaded file is not a valid WAV audio file.") from exc

    if not sample_rate or sample_rate <= 0:
        raise TrackValidationError("Uploaded file has an invalid sample rate.")

    if samples.ndim > 1:
        samples = samples.mean(axis=1)

    if samples.size == 0:
        raise TrackValidationError("Uploaded audio has no samples.")

    duration_seconds = float(samples.shape[0]) / float(sample_rate)
    return ParsedAudio(sample_rate=sample_rate, samples=samples, duration_seconds=duration_seconds)


def _validate_track_metadata(name: str, author: str | None) -> tuple[str, str | None]:
    normalized_name = _normalize_text(name)
    normalized_author = _normalize_text(author)

    if not normalized_name:
        raise TrackValidationError("Track name is required.")

    return normalized_name, normalized_author


def _validate_search_limits(file_bytes: bytes, parsed_audio: ParsedAudio) -> None:
    if len(file_bytes) > SEARCH_MAX_FILE_SIZE_BYTES:
        raise TrackValidationError("Search file must not be larger than 50 MB.")

    if parsed_audio.duration_seconds > SEARCH_MAX_DURATION_SECONDS:
        raise TrackValidationError("Search audio must not be longer than 10 minutes.")


def _build_object_name(track_minio_key: uuid.UUID | str) -> str:
    return f"{track_minio_key}.wav"


def _remove_object_quietly(minio: Minio, bucket_name: str, object_name: str) -> None:
    try:
        minio.remove_object(bucket_name, object_name)
    except Exception:
        return


def ensure_bucket_exists(minio: Minio, bucket_name: str) -> None:
    try:
        if not minio.bucket_exists(bucket_name):
            minio.make_bucket(bucket_name)
    except Exception as exc:
        raise TrackStorageError("Failed to prepare the object storage bucket.") from exc


def list_tracks(
    db: Session,
    skip: int,
    limit: int,
    query: str | None = None,
) -> tuple[list[Track], int]:
    stmt = db.query(Track)
    normalized_query = _normalize_text(query)

    if normalized_query:
        pattern = f"%{normalized_query}%"
        stmt = stmt.filter(
            or_(
                Track.track_name.ilike(pattern),
                Track.track_author.ilike(pattern),
            )
        )

    total = stmt.count()
    tracks = stmt.order_by(Track.track_id.asc()).offset(skip).limit(limit).all()
    return tracks, total


def _build_fingerprint_rows(
    track_id: int,
    parsed_audio: ParsedAudio,
    deadline: float | None = None,
) -> list[Track_Fingerprint]:
    fingerprint_map = create_map(parsed_audio.samples, parsed_audio.sample_rate, deadline=deadline)
    fingerprints = create_fingerprints(fingerprint_map, deadline=deadline)
    return [
        Track_Fingerprint(
            track_id=track_id,
            hash_code=int(hash_code),
            anchor_time=int(anchor_time),
        )
        for hash_code, anchor_time in fingerprints
    ]


def create_track(
    db: Session,
    minio: Minio,
    bucket_name: str,
    *,
    file_bytes: bytes,
    filename: str | None,
    name: str,
    author: str | None,
) -> Track:
    _validate_wav_filename(filename)
    normalized_name, normalized_author = _validate_track_metadata(name, author)
    parsed_audio = _parse_wav_bytes(file_bytes)
    fingerprint_rows = _build_fingerprint_rows(track_id=0, parsed_audio=parsed_audio)

    if not fingerprint_rows:
        raise TrackValidationError("Unable to extract fingerprints from the uploaded audio.")

    ensure_bucket_exists(minio, bucket_name)
    track_minio_key = uuid.uuid4()
    object_name = _build_object_name(track_minio_key)

    try:
        minio.put_object(
            bucket_name=bucket_name,
            object_name=object_name,
            data=io.BytesIO(file_bytes),
            length=len(file_bytes),
            content_type="audio/wav",
        )
    except Exception as exc:
        raise TrackStorageError("Failed to upload the track audio.") from exc

    try:
        track = Track(
            track_name=normalized_name,
            track_author=normalized_author,
            track_minio_key=track_minio_key,
        )
        db.add(track)
        db.flush()

        for fingerprint_row in fingerprint_rows:
            fingerprint_row.track_id = track.track_id

        db.add_all(fingerprint_rows)
        db.commit()
        db.refresh(track)
        return track
    except Exception as exc:
        db.rollback()
        _remove_object_quietly(minio, bucket_name, object_name)
        raise TrackPersistenceError("Failed to save the track metadata or fingerprints.") from exc


def delete_track(db: Session, minio: Minio, bucket_name: str, track_id: int) -> bool:
    track = db.query(Track).filter(Track.track_id == track_id).first()
    if track is None:
        return False

    object_name = _build_object_name(track.track_minio_key)

    try:
        minio.remove_object(bucket_name, object_name)
    except S3Error as exc:
        if exc.code not in IGNORED_STORAGE_DELETE_ERRORS:
            raise TrackStorageError("Failed to delete the track audio from object storage.") from exc
    except Exception as exc:
        raise TrackStorageError("Failed to delete the track audio from object storage.") from exc

    try:
        db.delete(track)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise TrackPersistenceError("Failed to delete the track metadata.") from exc

    return True


def _deadline_reached(deadline: float) -> bool:
    return time.monotonic() >= deadline


def _load_search_match(db: Session, best_state: _BestMatchState | None) -> SearchMatch | None:
    if best_state is None:
        return None

    track = db.query(Track).filter(Track.track_id == best_state.track_id).first()
    if track is None:
        return None

    return SearchMatch(
        track_id=track.track_id,
        track_name=track.track_name,
        track_author=track.track_author,
        track_minio_key=str(track.track_minio_key),
        matches=best_state.matches,
        time_offset=best_state.time_offset,
    )


def search_track(
    db: Session,
    *,
    file_bytes: bytes,
    filename: str | None,
    mode: str,
    matches_threshold: int = DEFAULT_MATCH_THRESHOLD,
    timeout_seconds: int = SEARCH_TIMEOUT_SECONDS,
) -> SearchOutcome:
    _validate_wav_filename(filename)
    parsed_audio = _parse_wav_bytes(file_bytes)
    _validate_search_limits(file_bytes, parsed_audio)

    deadline = time.monotonic() + timeout_seconds
    try:
        fingerprint_rows = _build_fingerprint_rows(track_id=0, parsed_audio=parsed_audio, deadline=deadline)
    except ProcessingDeadlineExceeded:
        return SearchOutcome(match=None, is_exact=False, timed_out=True)

    if not fingerprint_rows:
        return SearchOutcome(match=None, is_exact=False, timed_out=False)

    query_anchor_times: dict[int, list[int]] = defaultdict(list)
    for fingerprint in fingerprint_rows:
        query_anchor_times[int(fingerprint.hash_code)].append(int(fingerprint.anchor_time))

    if _deadline_reached(deadline):
        return SearchOutcome(match=None, is_exact=False, timed_out=True)

    db_fingerprints = (
        db.query(
            Track_Fingerprint.track_id,
            Track_Fingerprint.hash_code,
            Track_Fingerprint.anchor_time,
        )
        .filter(Track_Fingerprint.hash_code.in_(list(query_anchor_times.keys())))
        .all()
    )

    if _deadline_reached(deadline):
        return SearchOutcome(match=None, is_exact=False, timed_out=True)

    delta_counts: dict[int, dict[int, int]] = defaultdict(dict)
    best_state: _BestMatchState | None = None
    timed_out = False

    for db_track_id, hash_code, anchor_time in db_fingerprints:
        if _deadline_reached(deadline):
            timed_out = True
            break

        for query_anchor_time in query_anchor_times[int(hash_code)]:
            delta = int(anchor_time) - int(query_anchor_time)
            track_deltas = delta_counts[int(db_track_id)]
            count = track_deltas.get(delta, 0) + 1
            track_deltas[delta] = count

            if best_state is None or count > best_state.matches:
                best_state = _BestMatchState(
                    track_id=int(db_track_id),
                    matches=count,
                    time_offset=delta,
                )

    if timed_out and mode == "exact":
        return SearchOutcome(match=None, is_exact=False, timed_out=True)

    match = _load_search_match(db, best_state)
    if match is None:
        return SearchOutcome(match=None, is_exact=False, timed_out=timed_out)

    is_exact = match.matches >= matches_threshold

    if mode == "exact" and not is_exact:
        return SearchOutcome(match=None, is_exact=False, timed_out=timed_out)

    return SearchOutcome(match=match, is_exact=is_exact, timed_out=timed_out)
