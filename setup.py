from minio import Minio
from minio.error import S3Error
from sqlalchemy.orm import Session
import os, io, uuid
from scipy.io.wavfile import read
from dotenv import load_dotenv
from models import Track, Track_Fingerprint
from back.Seeker import create_map, create_fingerprints
from database import minio_client, SessionLocal

load_dotenv()
MINIO_BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "localhost")

def init_startbucket(client:Minio, name:str):
    """Создает стартовый бакет в MinIO"""
    try:
        client.make_bucket(name)
    except ValueError:
        print("Invalid bucket name")
    except S3Error:
        print("This bucket already exists")
    except:
        print("Failed to create bucket")

def load_song_to_minio(client:Minio, bucket_name:str, track_name:str, path:str) -> uuid.UUID:
    """Загружает трек из папки для настройки в MinIO"""
    file_key = str(uuid.uuid4()) 
    _, file_format = os.path.splitext(track_name)
    minio_name = file_key + file_format
    try:
        client.fput_object(
            bucket_name,
            minio_name,
            path + '/' + track_name,
            content_type='audio/wav'
        )
    except Exception as e:
        print(f"Failed to load a file: {e}")
    return file_key

def load_song_to_postgres(client:Session, track_name:str, file_key:str) -> int:
    """Загружает трек из папки для настройки в Postgres"""
    track_name = os.path.splitext(track_name)[0]
    name, author = track_name.split(' - ')
    track = Track(track_name=name, track_author=author, track_minio_key=file_key)
    client.add(track)
    client.commit()
    return track.track_id

def get_track_minio_key(client: Session, track_id: int) -> str | None:
    """Получает ключ файла из MinIO по ID трека"""
    track = client.query(Track).filter(Track.track_id == track_id).first()
    if track:
        return str(track.track_minio_key)
    return None

def get_audio_from_minio(mcl: Minio, bucket_name: str, track_key: str) -> io.BytesIO:
    """
    Скачивание файла из MinIO в буфер
    """
    file_name = f"{track_key}.wav"
    try:
        with mcl.get_object(bucket_name, file_name) as resp:
            buff = io.BytesIO(resp.read())
            buff.seek(0)
            return buff
    except S3Error as e:
        print(f"MinIO error for {file_name}: {e}")
        return None


def load_fingerprints_to_postgres(mcl:Minio, pgcl:Session, track_id:int, bucket_name:str):
    """Загружает отпечатки трека в Postgres"""
    track_key = get_track_minio_key(pgcl, track_id)
    track = get_audio_from_minio(mcl, bucket_name, track_key)
    Fs, song = read(track)
    arr = create_map(song, Fs)
    fprs = create_fingerprints(arr)
    for i in range(len(fprs)):
        fpr = Track_Fingerprint(track_id=track_id, hash_code=fprs[i][0], anchor_time=fprs[i][1])
        pgcl.add(fpr)
    pgcl.commit()

def load_test_songs_to_db(minio_client:Minio, postgres_client:Session, path:str, bucket_name:str):
    arr = os.listdir(path)
    for track_name in arr:
        try:
            key = load_song_to_minio(minio_client, bucket_name, track_name, path)
            track_id = load_song_to_postgres(postgres_client, track_name, key)
            load_fingerprints_to_postgres(minio_client, postgres_client, track_id, bucket_name)
        except Exception as e:
            print(f"Failed to load a file: {e}")

if __name__ == "__main__":
    mcl = minio_client
    bucket_name = MINIO_BUCKET_NAME
    with SessionLocal() as pcl:
        init_startbucket(mcl, bucket_name)
        load_test_songs_to_db(mcl, pcl, 'tracks', bucket_name)
    
    