import io
import wave
from unittest.mock import Mock, patch

import numpy as np
import pytest

from back.core import services
from back.core.services import (
    TrackPersistenceError,
    TrackStorageError,
    TrackValidationError,
    SearchOutcome,
)


def _make_wav_bytes(duration_seconds: float = 0.01, sample_rate: int = 44100) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        n_frames = int(duration_seconds * sample_rate)
        wf.writeframes(np.zeros(n_frames, dtype=np.int16).tobytes())
    return buf.getvalue()


def test_validate_wav_filename_accepts_wav():
    services._validate_wav_filename("track.WAV")


def test_validate_wav_filename_rejects_non_wav():
    with pytest.raises(TrackValidationError, match=r"Only \.wav files are supported"):
        services._validate_wav_filename("track.mp3")


def test_parse_wav_bytes_rejects_empty_file():
    with pytest.raises(TrackValidationError, match="Uploaded file is empty"):
        services._parse_wav_bytes(b"")


def test_parse_wav_bytes_rejects_invalid_audio():
    with pytest.raises(TrackValidationError, match="Uploaded file is not a valid WAV audio file"):
        services._parse_wav_bytes(b"not a wav")


def test_parse_wav_bytes_reads_valid_wav():
    valid_wav = _make_wav_bytes(duration_seconds=0.01)
    parsed = services._parse_wav_bytes(valid_wav)

    assert parsed.sample_rate == 44100
    assert parsed.duration_seconds > 0
    assert parsed.samples.size > 0


def test_validate_track_metadata_normalizes_values():
    name, author = services._validate_track_metadata("  My Track  ", "  Artist  ")
    assert name == "My Track"
    assert author == "Artist"


def test_validate_track_metadata_requires_name():
    with pytest.raises(TrackValidationError, match="Track name is required"):
        services._validate_track_metadata(" ", "Artist")


def test_build_object_name_appends_wav_extension():
    assert services._build_object_name("abc123") == "abc123.wav"


def test_remove_object_quietly_ignores_exceptions():
    minio_mock = Mock()
    minio_mock.remove_object.side_effect = Exception("storage failure")

    services._remove_object_quietly(minio_mock, "bucket", "object.wav")
    minio_mock.remove_object.assert_called_once_with("bucket", "object.wav")


def test_ensure_bucket_exists_makes_bucket_when_missing():
    minio_mock = Mock()
    minio_mock.bucket_exists.return_value = False

    services.ensure_bucket_exists(minio_mock, "bucket")

    minio_mock.make_bucket.assert_called_once_with("bucket")


def test_ensure_bucket_exists_raises_on_error():
    minio_mock = Mock()
    minio_mock.bucket_exists.side_effect = Exception("failed")

    with pytest.raises(TrackStorageError, match="Failed to prepare the object storage bucket"):
        services.ensure_bucket_exists(minio_mock, "bucket")


def test_list_tracks_applies_query_filter():
    stmt = Mock()
    stmt.filter.return_value = stmt
    stmt.count.return_value = 2
    stmt.order_by.return_value = stmt
    stmt.offset.return_value = stmt
    stmt.limit.return_value = stmt
    stmt.all.return_value = ["track1", "track2"]

    db = Mock()
    db.query.return_value = stmt

    tracks, total = services.list_tracks(db, skip=0, limit=10, query=" artist ")

    assert total == 2
    assert tracks == ["track1", "track2"]
    stmt.filter.assert_called_once()


def test_get_track_by_id_returns_track():
    track = Mock()
    query = Mock()
    query.filter.return_value.first.return_value = track
    db = Mock()
    db.query.return_value = query

    assert services.get_track_by_id(db, 1) is track


def test_load_search_match_returns_none_if_no_best_state():
    db = Mock()
    assert services._load_search_match(db, None) is None


def test_load_search_match_returns_none_if_track_missing():
    best_state = services._BestMatchState(track_id=1, matches=1, time_offset=0)
    query = Mock()
    query.filter.return_value.first.return_value = None
    db = Mock()
    db.query.return_value = query

    assert services._load_search_match(db, best_state) is None


def test_load_search_match_builds_search_result():
    best_state = services._BestMatchState(track_id=1, matches=3, time_offset=5)
    track = Mock(track_id=1, track_name="Song", track_author="Author", track_minio_key="uuid")
    query = Mock()
    query.filter.return_value.first.return_value = track
    db = Mock()
    db.query.return_value = query

    result = services._load_search_match(db, best_state)

    assert result.track_id == 1
    assert result.track_name == "Song"
    assert result.track_author == "Author"
    assert result.track_minio_key == "uuid"
    assert result.matches == 3
    assert result.time_offset == 5


def test_delete_track_returns_false_when_missing():
    db = Mock()
    query = Mock()
    query.filter.return_value.first.return_value = None
    db.query.return_value = query
    minio_mock = Mock()

    assert services.delete_track(db, minio_mock, "bucket", 123) is False


def test_delete_track_ignores_known_s3_errors_and_deletes_metadata():
    db = Mock()
    track = Mock(track_id=1, track_minio_key="uuid")
    query = Mock()
    query.filter.return_value.first.return_value = track
    db.query.return_value = query
    db.delete = Mock()
    db.commit = Mock()

    error = services.S3Error(None, "NoSuchKey", "ignored", "unused", "reqid", "hostid")
    minio_mock = Mock()
    minio_mock.remove_object.side_effect = error

    assert services.delete_track(db, minio_mock, "bucket", 123) is True
    db.delete.assert_called_once_with(track)
    db.commit.assert_called_once()


def test_delete_track_raises_for_unexpected_s3_error():
    db = Mock()
    track = Mock(track_id=1, track_minio_key="uuid")
    query = Mock()
    query.filter.return_value.first.return_value = track
    db.query.return_value = query
    minio_mock = Mock()
    unexpected_error = services.S3Error(None, "SomeOtherError", "boom", "unused", "reqid", "hostid")
    minio_mock.remove_object.side_effect = unexpected_error

    with pytest.raises(TrackStorageError, match="Failed to delete the track audio from object storage"):
        services.delete_track(db, minio_mock, "bucket", 123)


def test_delete_track_raises_persistence_error_when_db_commit_fails():
    db = Mock()
    track = Mock(track_id=1, track_minio_key="uuid")
    query = Mock()
    query.filter.return_value.first.return_value = track
    db.query.return_value = query
    minio_mock = Mock()
    db.delete = Mock()
    db.commit.side_effect = Exception("commit failed")
    db.rollback = Mock()

    with pytest.raises(TrackPersistenceError, match="Failed to delete the track metadata"):
        services.delete_track(db, minio_mock, "bucket", 123)

    db.rollback.assert_called_once()


def test_search_track_returns_no_match_when_no_fingerprints():
    db = Mock()
    db.query.return_value.filter.return_value.all.return_value = []
    parsed_audio = services.ParsedAudio(sample_rate=44100, samples=np.array([1, 2, 3]), duration_seconds=1.0)

    with patch.object(services, "_parse_wav_bytes", return_value=parsed_audio), \
         patch.object(services, "_build_fingerprint_rows", return_value=[]), \
         patch.object(services, "_deadline_reached", return_value=False):
        outcome = services.search_track(db, file_bytes=b"data", filename="test.wav", mode="exact")

    assert outcome.match is None
    assert outcome.is_exact is False
    assert outcome.timed_out is False


def test_search_track_times_out_when_building_fingerprints():
    db = Mock()
    parsed_audio = services.ParsedAudio(sample_rate=44100, samples=np.array([1, 2, 3]), duration_seconds=1.0)

    with patch.object(services, "_parse_wav_bytes", return_value=parsed_audio), \
         patch.object(services, "_build_fingerprint_rows", side_effect=services.ProcessingDeadlineExceeded):
        outcome = services.search_track(db, file_bytes=b"data", filename="test.wav", mode="exact")

    assert outcome.match is None
    assert outcome.is_exact is False
    assert outcome.timed_out is True


def test_search_track_returns_exact_match():
    parsed_audio = services.ParsedAudio(sample_rate=44100, samples=np.array([1, 2, 3]), duration_seconds=1.0)
    fingerprint = Mock(hash_code=10, anchor_time=0)

    fp_query = Mock()
    fp_query.filter.return_value.all.return_value = [(1, 10, 0)]

    track = Mock(track_id=1, track_name="Matched Song", track_author="Singer", track_minio_key="uuid")
    track_query = Mock()
    track_query.filter.return_value.first.return_value = track

    def query_side_effect(*args):
        if (
            len(args) == 3
            and args[0] is services.Track_Fingerprint.track_id
            and args[1] is services.Track_Fingerprint.hash_code
            and args[2] is services.Track_Fingerprint.anchor_time
        ):
            return fp_query
        if len(args) == 1 and args[0] is services.Track:
            return track_query
        raise AssertionError("Unexpected query args: %r" % (args,))

    db = Mock()
    db.query.side_effect = query_side_effect

    with patch.object(services, "_parse_wav_bytes", return_value=parsed_audio), \
         patch.object(services, "_build_fingerprint_rows", return_value=[fingerprint]), \
         patch.object(services, "_deadline_reached", return_value=False):
        outcome = services.search_track(db, file_bytes=b"data", filename="test.wav", mode="exact", matches_threshold=1)

    assert outcome.match is not None
    assert isinstance(outcome.match, services.SearchMatch)
    assert outcome.match.track_id == 1
    assert outcome.match.track_name == "Matched Song"
    assert outcome.is_exact is True
    assert outcome.timed_out is False
