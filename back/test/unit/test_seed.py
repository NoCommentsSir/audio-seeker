import io
import os
import uuid
from unittest.mock import Mock

import numpy as np
import pytest
from minio.error import S3Error

from back.scripts import seed


def test_init_startbucket_handles_invalid_name(capsys):
    client = Mock()
    client.make_bucket.side_effect = ValueError("bad name")

    seed.init_startbucket(client, "bad-bucket")

    captured = capsys.readouterr()
    assert "Invalid bucket name" in captured.out
    client.make_bucket.assert_called_once_with("bad-bucket")


def test_init_startbucket_handles_existing_bucket(capsys):
    client = Mock()
    client.make_bucket.side_effect = S3Error(None, "NoSuchBucket", "ignored", "unused", "reqid", "hostid")

    seed.init_startbucket(client, "existing-bucket")

    captured = capsys.readouterr()
    assert "This bucket already exists" in captured.out
    client.make_bucket.assert_called_once_with("existing-bucket")


def test_init_startbucket_handles_other_errors(capsys):
    client = Mock()
    client.make_bucket.side_effect = RuntimeError("boom")

    seed.init_startbucket(client, "bucket")

    captured = capsys.readouterr()
    assert "Failed to create bucket" in captured.out
    client.make_bucket.assert_called_once_with("bucket")


def test_load_song_to_minio_uploads_file(tmp_path):
    client = Mock()
    track_name = "song.wav"
    file_path = tmp_path / track_name
    file_path.write_bytes(b"RIFF....")

    file_key = seed.load_song_to_minio(client, "bucket", track_name, str(tmp_path))

    assert uuid.UUID(file_key)
    assert client.fput_object.call_count == 1
    bucket_arg, minio_name_arg, path_arg = client.fput_object.call_args[0]
    assert bucket_arg == "bucket"
    assert minio_name_arg.endswith(".wav")
    assert path_arg.endswith(os.path.join(str(tmp_path), track_name)) or path_arg.endswith(str(tmp_path) + "/" + track_name)
    assert client.fput_object.call_args.kwargs["content_type"] == "audio/wav"


def test_load_song_to_minio_handles_upload_failure():
    client = Mock()
    client.fput_object.side_effect = Exception("failed upload")

    file_key = seed.load_song_to_minio(client, "bucket", "song.wav", "./nonexistent")

    assert uuid.UUID(file_key)
    client.fput_object.assert_called_once()


def test_load_song_to_postgres_inserts_track(monkeypatch):
    fake_track = Mock(track_id=42)
    track_ctor = Mock(return_value=fake_track)
    monkeypatch.setattr(seed, "Track", track_ctor)

    session = Mock()
    result = seed.load_song_to_postgres(session, "Name - Author.wav", "filekey")

    assert result == 42
    track_ctor.assert_called_once_with(track_name="Name", track_author="Author", track_minio_key="filekey")
    session.add.assert_called_once_with(fake_track)
    session.commit.assert_called_once()


def test_get_track_minio_key_returns_key():
    track = Mock(track_minio_key="uuid-key")
    query = Mock()
    query.filter.return_value.first.return_value = track
    session = Mock()
    session.query.return_value = query

    assert seed.get_track_minio_key(session, 123) == "uuid-key"
    session.query.assert_called_once_with(seed.Track)
    query.filter.assert_called_once()


def test_get_track_minio_key_returns_none_when_missing():
    query = Mock()
    query.filter.return_value.first.return_value = None
    session = Mock()
    session.query.return_value = query

    assert seed.get_track_minio_key(session, 123) is None


class DummyObject:
    def __init__(self, data: bytes):
        self._data = data

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_get_audio_from_minio_returns_buffer():
    data = b"hello"
    client = Mock()
    client.get_object.return_value = DummyObject(data)

    buff = seed.get_audio_from_minio(client, "bucket", "trackkey")

    assert isinstance(buff, io.BytesIO)
    assert buff.getvalue() == data


def test_get_audio_from_minio_handles_s3_error(capsys):
    client = Mock()
    client.get_object.side_effect = S3Error(None, "NoSuchKey", "ignored", "unused", "reqid", "hostid")

    result = seed.get_audio_from_minio(client, "bucket", "trackkey")

    assert result is None
    captured = capsys.readouterr()
    assert "MinIO error for trackkey.wav" in captured.out


def test_load_fingerprints_to_postgres_adds_fingerprints(monkeypatch):
    monkeypatch.setattr(seed, "get_track_minio_key", Mock(return_value="trackkey"))
    monkeypatch.setattr(seed, "get_audio_from_minio", Mock(return_value=io.BytesIO(b"data")))
    monkeypatch.setattr(seed, "read", Mock(return_value=(44100, np.array([0, 1, 2], dtype=np.int16))))
    monkeypatch.setattr(seed, "create_map", Mock(return_value=np.array([[0, 1000.0], [5, 2000.0]])))
    monkeypatch.setattr(seed, "create_fingerprints", Mock(return_value=[[123456, 0], [234567, 5]]))

    fpr_instances = [Mock(), Mock()]
    fpr_ctor = Mock(side_effect=fpr_instances)
    monkeypatch.setattr(seed, "Track_Fingerprint", fpr_ctor)

    session = Mock()
    seed.load_fingerprints_to_postgres(Mock(), session, 3, "bucket")

    assert fpr_ctor.call_count == 2
    assert session.add.call_count == 2
    session.add.assert_any_call(fpr_instances[0])
    session.add.assert_any_call(fpr_instances[1])
    session.commit.assert_called_once()


def test_load_test_songs_to_db_skips_when_data_exists(monkeypatch, capsys):
    minio_client = Mock()
    postgres_client = Mock()
    postgres_client.query.return_value.count.return_value = 1
    minio_client.list_objects.return_value = [1]
    monkeypatch.setattr(seed.os, "listdir", lambda path: (_ for _ in ()).throw(AssertionError("should not call listdir")))

    seed.load_test_songs_to_db(minio_client, postgres_client, "tracks", "bucket")

    captured = capsys.readouterr()
    assert "Skipping load" in captured.out


def test_load_test_songs_to_db_loads_all_files(monkeypatch):
    minio_client = Mock()
    postgres_client = Mock()
    postgres_client.query.return_value.count.return_value = 0
    minio_client.list_objects.return_value = []
    monkeypatch.setattr(seed.os, "listdir", Mock(return_value=["Song - Artist.wav"]))

    monkeypatch.setattr(seed, "load_song_to_minio", Mock(return_value="key123"))
    monkeypatch.setattr(seed, "load_song_to_postgres", Mock(return_value=7))
    monkeypatch.setattr(seed, "load_fingerprints_to_postgres", Mock())

    seed.load_test_songs_to_db(minio_client, postgres_client, "tracks", "bucket")

    seed.load_song_to_minio.assert_called_once_with(minio_client, "bucket", "Song - Artist.wav", "tracks")
    seed.load_song_to_postgres.assert_called_once_with(postgres_client, "Song - Artist.wav", "key123")
    seed.load_fingerprints_to_postgres.assert_called_once_with(minio_client, postgres_client, 7, "bucket")
