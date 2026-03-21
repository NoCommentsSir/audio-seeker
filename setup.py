from database import minio_client
from minio import Minio
from minio.error import S3Error
from sqlalchemy.orm import Session
import os

def init_startbucket(client:Minio, name:str):
    try:
        client.make_bucket(name)
    except ValueError:
        print("Invalid bucket name")
    except S3Error:
        print("This bucket already exists")
    except:
        print("Failed to create bucket")

def load_test_songs_to_minio(client:Minio, path:str, bucket_name:str):
    arr = os.listdir(path)
    for name in arr:
        try:
            client.fput_object(
                bucket_name,
                name,
                path + '/' + name,
                content_type='audio/wav'
            )
        except:
            print("Failed to load a file")

def load_test_songs_to_postgres(client:Session, path:str, minio_bucket_name:str):
    arr = os.listdir(path)
    
    for name in arr:
        try:
            client.fput_object(
                bucket_name,
                name,
                path + '/' + name,
                content_type='audio/wav'
            )
        except:
            print("Failed to load a file")

if __name__ == "__main__":
    client = minio_client
    bucket_name = "track-list"
    init_startbucket(client, bucket_name)
    load_test_songs_to_minio(client, 'tracks', bucket_name)
    
    