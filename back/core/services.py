import numpy as np
import uuid, io, os
from minio import Minio

from back.db.database import SessionLocal
from back.db.models import Track_Fingerprint, Track
from Seeker import *

def load_song_to_minio(client: Minio, bucket_name: str, file_content: bytes, track_name: str) -> uuid.UUID:
    """Загружает трек из папки для настройки в MinIO"""
    file_key = str(uuid.uuid4()) 
    _, file_format = os.path.splitext(track_name)
    file_format = file_format or '.wav'
    minio_name = f"{file_key}{file_format}"

    try:
        client.fput_object(
            bucket_name,
            minio_name,
            io.BytesIO(file_content),
            length=len(file_content),
            content_type='audio/wav'
        )
        return file_key
    except Exception as e:
        print(f"Failed to load a file: {e}")
        raise e
    

def search_match(audio, matches_threshold = 5):
    """Загружает трек из папки для настройки в MinIO"""
    Fs, song = read(audio)
    arr = create_map(song, Fs)
    fingerprints = create_fingerprints(arr)
    matches = {}

    with SessionLocal() as pcl:
        arr = []
        for hash_code, anchor_time in fingerprints:
            db_fingerprints = pcl.query(Track_Fingerprint).filter(
                Track_Fingerprint.hash_code == hash_code
            ).all()

            for db_fpr in db_fingerprints:
                if db_fpr.track_id in matches.keys():
                    matches[db_fpr.track_id].append(
                        (db_fpr.anchor_time, anchor_time)
                    )
                else:
                    matches[db_fpr.track_id] = [(db_fpr.anchor_time, anchor_time)]

        best_track_id = None
        max_matches = 0
        best_delta = 0

        for track_id, points in matches.items():

            if len(points) < matches_threshold:
                continue

            deltas = np.array([db_time - q_time for db_time, q_time in points])
            unique_deltas, counts = np.unique(deltas, return_counts=True)
            max_idx = np.argmax(counts)
            common_delta = unique_deltas[max_idx]
            common_delta_count = counts[max_idx]
            common_delta_count = counts[max_idx]

            if common_delta_count > max_matches:
                max_matches = int(common_delta_count)
                best_delta = int(common_delta)
                best_track_id = track_id
            
        if best_track_id:
            best_track_matching = pcl.query(Track).filter(
                Track.track_id == best_track_id
            ).first()

            return {
                    "track_id": best_track_matching.track_id,
                    "track_name": best_track_matching.track_name,
                    "track_author": best_track_matching.track_author,
                    "track_minio_key": str(best_track_matching.track_minio_key),
                    "matches": max_matches,
                    "time_offset": best_delta
                }
        
    return None

if __name__ == '__main__':
    file = Path('output.wav')
    track = TRACKS_DIR / file
    print(search_match(track, 10))