import io, os, sys
import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from uuid import uuid4
from back.app.api import api, get_minio_client, get_track_by_id, get_db
from back.core.services import TrackValidationError
from back.core.services import TrackStorageError
from fastapi import HTTPException

TRACK_PATH = 'tracks'
@pytest.fixture
def client():
    # Создаем тестовый клиент
    return TestClient(api)

@pytest.fixture
def mock_admin_token():
    # Мок функции для токена администратора
    return "test-admin-token-12345"


@pytest.fixture
def wav_file_bytes():
    # Тестовый трек для тестов
    # Путь к тестовому треку в репозитории
    track = os.listdir(TRACK_PATH)[0]
    
    with open(os.path.join(TRACK_PATH, track), "rb") as f:
        return f.read()

def test_admin_login_invalid_credentials(client):
    """Тестирует неуспешный вход администратора с неверным паролем"""
    
    with patch('back.app.api.authenticate_admin', return_value=False) as mock_verify:
            response = client.post(
                "/api/admin/login",
                json={"password": "wrong-password"}
            )

            assert response.status_code == 401
            data = response.json()
            assert data["detail"] == "Invalid admin password"

def test_admin_login_success(client):
    """Тестирует успешный вход администратора и получение токена"""
    
    with patch('back.app.api.authenticate_admin', return_value=True) as mock_verify, \
         patch('back.app.api.create_admin_token', return_value="test-token-12345") as mock_create_token:
            response = client.post(
                "/api/admin/login",
                json={"password": "correct-password"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["access_token"] == "test-token-12345"
            assert data["token_type"] == "bearer"

def test_insert_track_success(client, mock_admin_token, wav_file_bytes):
    """Тестирует успешное создание трека"""
    
    mock_db = Mock()
    mock_track_id = 42
    mock_track_uuid = uuid4()
    
    # Мокируем функцию create_track из services
    with patch('back.app.api.create_track') as mock_create_track, \
         patch('back.app.api.get_db', return_value=mock_db), \
         patch('back.app.api.verify_admin_token_header', return_value=True), \
         patch('back.app.api.verify_admin_token', return_value={'sub': 'admin'}):
        
        # Мокируем возвращаемый трек
        mock_track = Mock()
        mock_track.track_id = mock_track_id
        mock_track.track_name = "Test Song"
        mock_track.track_author = "Test Artist"
        mock_track.track_minio_key = str(mock_track_uuid)
        
        mock_create_track.return_value = mock_track
        
        # 2. Подготавливаем данные для запроса
        response = client.post(
            "/api/tracks",
            files={"file": ("test.wav", io.BytesIO(wav_file_bytes), "audio/wav")},
            data={
                "name": "Test Song",
                "author": "Test Artist"
            },
            headers={"Authorization": f"Bearer {mock_admin_token}"}
        )
        
        # 3. Проверяем результат
        assert response.status_code == 201
        data = response.json()
        assert data["track_id"] == mock_track_id
        assert data["track_name"] == "Test Song"
        assert data["track_author"] == "Test Artist"
        
        # 4. Проверяем, что create_track был вызван с правильными параметрами
        mock_create_track.assert_called_once()
        call_args = mock_create_track.call_args
        assert call_args.kwargs["name"] == "Test Song"
        assert call_args.kwargs["author"] == "Test Artist"
        assert call_args.kwargs["filename"] == "test.wav"


def test_insert_track_invalid_wav_format(client, mock_admin_token):
    """Тестирует отклонение невалидного WAV файла"""
    
    with patch('back.app.api.create_track') as mock_create_track, \
         patch('back.app.api.verify_admin_token_header', return_value=True), \
         patch('back.app.api.verify_admin_token', return_value={'sub': 'admin'}):
        
        # Мокируем исключение валидации
        mock_create_track.side_effect = TrackValidationError("Only .wav files are supported.")
        
        response = client.post(
            "/api/tracks",
            files={"file": ("test.mp3", io.BytesIO(b"fake audio data"), "audio/mp3")},
            data={"name": "Test Song"},
            headers={"Authorization": f"Bearer {mock_admin_token}"}
        )
        
        assert response.status_code == 400
        assert "wav files are supported" in response.json()["detail"]


def test_insert_track_missing_auth(client, wav_file_bytes):
    """Тестирует отклонение запроса без авторизации"""
    
    with patch('back.app.api.verify_admin_token_header') as mock_verify:
        mock_verify.side_effect = HTTPException(
            status_code=401,
            detail="Authorization header missing"
        )
        
        response = client.post(
            "/api/tracks",
            files={"file": ("test.wav", io.BytesIO(wav_file_bytes), "audio/wav")},
            data={"name": "Test Song"},
        )
        
        assert response.status_code == 401


def test_insert_track_storage_error(client, mock_admin_token, wav_file_bytes):
    """Тестирует обработку ошибок хранилища"""
    
    with patch('back.app.api.create_track') as mock_create_track, \
         patch('back.app.api.verify_admin_token_header', return_value=True), \
         patch('back.app.api.verify_admin_token', return_value={'sub': 'admin'}):
        
        mock_create_track.side_effect = TrackStorageError("Failed to upload to MinIO")
        
        response = client.post(
            "/api/tracks",
            files={"file": ("test.wav", io.BytesIO(wav_file_bytes), "audio/wav")},
            data={"name": "Test Song"},
            headers={"Authorization": f"Bearer {mock_admin_token}"}
        )
        
        assert response.status_code == 500
        assert "Failed to upload" in response.json()["detail"]

def test_delete_track_success(client, mock_admin_token):
    """Тестирует успешное удаление трека"""
    
    mock_db = Mock()
    mock_track_id = 42
    
    # Мокируем функцию delete_track из services
    with patch('back.app.api.delete_track') as mock_delete_track, \
         patch('back.app.api.get_db', return_value=mock_db), \
         patch('back.app.api.verify_admin_token_header', return_value=True), \
         patch('back.app.api.verify_admin_token', return_value={'sub': 'admin'}):
        
        mock_delete_track.return_value = True
        
        # 2. Подготавливаем данные для запроса
        response = client.delete(
            f"/api/tracks/{mock_track_id}",
            headers={"Authorization": f"Bearer {mock_admin_token}"}
        )
        
        # 3. Проверяем результат
        assert response.status_code == 204
        
        # 4. Проверяем, что delete_track был вызван
        mock_delete_track.assert_called_once()
        # track_id это 4-й аргумент (индекс 3): db, minio, bucket, track_id
        call_args = mock_delete_track.call_args
        assert call_args.args[3] == mock_track_id

def test_delete_track_invalid_id(client, mock_admin_token):
    """Тестирует отклонение запроса на удаление несуществующего трека"""
    
    mock_track_id = 4200

    with patch('back.app.api.delete_track') as mock_delete_track, \
         patch('back.app.api.verify_admin_token_header', return_value=True), \
         patch('back.app.api.verify_admin_token', return_value={'sub': 'admin'}):
        
        # delete_track возвращает False когда трека нет
        mock_delete_track.return_value = False
        
        response = client.delete(
            f"/api/tracks/{mock_track_id}",
            headers={"Authorization": f"Bearer {mock_admin_token}"}
        )
        
        assert response.status_code == 404
        assert "Track not found" in response.json()["detail"]

def test_delete_track_missing_auth(client):
    """Тестирует отклонение запроса без авторизации"""
    
    mock_track_id = 42

    with patch('back.app.api.verify_admin_token_header') as mock_verify:
        mock_verify.side_effect = HTTPException(
            status_code=401,
            detail="Authorization header missing"
        )
        
        response = client.delete(
            f"/api/tracks/{mock_track_id}"
        )
        
        assert response.status_code == 401

def test_delete_track_storage_error(client, mock_admin_token):
    """Тестирует обработку ошибок хранилища"""
    
    mock_track_id = 42

    with patch('back.app.api.delete_track') as mock_delete_track, \
         patch('back.app.api.verify_admin_token_header', return_value=True), \
         patch('back.app.api.verify_admin_token', return_value={'sub': 'admin'}):
        
        mock_delete_track.side_effect = TrackStorageError("Failed to delete from MinIO")
        
        response = client.delete(
            f"/api/tracks/{mock_track_id}",
            headers={"Authorization": f"Bearer {mock_admin_token}"}
        )
        
        assert response.status_code == 500
        assert "Failed to delete" in response.json()["detail"]

def test_get_tracks_success(client):
    """Тестирует успешный вывод списка треков"""
    
    mock_db = Mock()
    mock_track_id = 42
    mock_track_uuid = uuid4()
    mock_skip = 0
    mock_limit = 10
    mock_query = "Test Artist"
    mock_total = 25  # Всего треков в БД
    
    # Мокируем функцию list_tracks из services
    with patch('back.app.api.list_tracks') as mock_list_tracks, \
         patch('back.app.api.get_db', return_value=mock_db):
        
        # Мокируем возвращаемый трек
        mock_track = Mock()
        mock_track.track_id = mock_track_id
        mock_track.track_name = "Test Song"
        mock_track.track_author = "Test Artist"
        mock_track.track_minio_key = str(mock_track_uuid)

        # list_tracks возвращает (tracks, total) кортеж!
        mock_list_tracks.return_value = ([mock_track], mock_total)
        
        # 2. Делаем GET запрос с параметрами
        response = client.get(
            "/api/tracks",
            params={"skip": mock_skip, "limit": mock_limit, "query": mock_query},
        )
        
        # 3. Проверяем результат
        assert response.status_code == 200
        data = response.json()
        
        # Проверяем структуру ответа TrackListResponse
        assert data["total"] == mock_total
        assert data["skip"] == mock_skip
        assert data["limit"] == mock_limit
        assert data["has_more"] is True  # 0 + 10 < 25
        
        # Проверяем первый трек в items
        assert len(data["items"]) == 1
        first_track = data["items"][0]
        assert first_track["track_id"] == mock_track_id
        assert first_track["track_name"] == "Test Song"
        assert first_track["track_author"] == "Test Artist"
        assert first_track["track_minio_key"] == str(mock_track_uuid)
        
        # 4. Проверяем, что list_tracks был вызван с правильными параметрами
        mock_list_tracks.assert_called_once()
        call_args = mock_list_tracks.call_args
        assert call_args.kwargs["skip"] == mock_skip
        assert call_args.kwargs["limit"] == mock_limit
        assert call_args.kwargs["query"] == mock_query

def test_list_tracks_storage_error(client):
    """Тестирует обработку ошибок хранилища при получении списка"""

    mock_db = Mock()
    mock_skip = 0
    mock_limit = 10
    mock_query = "Test Artist"

    with patch('back.app.api.list_tracks') as mock_list_tracks, \
         patch('back.app.api.get_db', return_value=mock_db):
        
        mock_list_tracks.side_effect = TrackStorageError("Failed to retrieve tracks from storage")
        
        response = client.get(
            "/api/tracks",
            params={"skip": mock_skip, "limit": mock_limit, "query": mock_query},
        )
        
        assert response.status_code == 500
        assert "Failed to retrieve tracks" in response.json()["detail"]

def test_search_track_by_fingerprint_success(client, wav_file_bytes):
    """Тестирует успешный поиск трека по отпечатку пальца"""
    
    mock_db = Mock()
    mock_mode = "exact"
    mock_track_id = 42
    mock_track_uuid = uuid4()
    
    # Мокируем функцию search_track из services
    with patch('back.app.api.search_track') as mock_search_track, \
         patch('back.app.api.get_db', return_value=mock_db):
        
        # Мокируем SearchMatch объект
        mock_match = Mock()
        mock_match.track_id = mock_track_id
        mock_match.track_name = "Test Song"
        mock_match.track_author = "Test Artist"
        mock_match.track_minio_key = str(mock_track_uuid)
        mock_match.matches = 700
        mock_match.time_offset = 15
        
        # Мокируем SearchOutcome объект
        mock_outcome = Mock()
        mock_outcome.match = mock_match
        mock_outcome.is_exact = True
        mock_outcome.timed_out = False
        
        mock_search_track.return_value = mock_outcome
        
        # 2. Делаем POST запрос с файлом и режимом поиска
        response = client.post(
            "/api/tracks/search",
            files={"file": ("test.wav", io.BytesIO(wav_file_bytes), "audio/wav")},
            data={"mode": mock_mode},
        )
        
        # 3. Проверяем результат
        assert response.status_code == 200
        data = response.json()
        
        # Проверяем структуру ответа TrackSearchResponse
        assert data["matched"] is True
        assert data["mode"] == mock_mode
        assert data["is_exact"] is True
        assert data["timed_out"] is False
        assert "message" in data
        
        # Проверяем результат (SearchResult)
        assert data["result"] is not None
        result = data["result"]
        assert result["track_id"] == mock_track_id
        assert result["track_name"] == "Test Song"
        assert result["track_author"] == "Test Artist"
        assert result["track_minio_key"] == str(mock_track_uuid)
        assert result["matches"] == 700
        assert result["time_offset"] == 15
        
        # 4. Проверяем, что search_track был вызван с правильными параметрами
        mock_search_track.assert_called_once()
        call_args = mock_search_track.call_args
        assert call_args.kwargs["mode"] == mock_mode
        assert call_args.kwargs["filename"] == "test.wav"


def test_search_track_not_found(client, wav_file_bytes):
    """Тестирует поиск когда трек не найден (возвращает лучший результат в approximate режиме)"""
    
    mock_db = Mock()
    mock_mode = "approximate"
    
    # Мокируем функцию search_track из services
    with patch('back.app.api.search_track') as mock_search_track, \
         patch('back.app.api.get_db', return_value=mock_db):
        
        # Мокируем SearchOutcome когда трека нет
        mock_outcome = Mock()
        mock_outcome.match = None  # Трека не найдено
        mock_outcome.is_exact = False
        mock_outcome.timed_out = False
        
        mock_search_track.return_value = mock_outcome
        
        response = client.post(
            "/api/tracks/search",
            files={"file": ("test.wav", io.BytesIO(wav_file_bytes), "audio/wav")},
            data={"mode": mock_mode},
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["matched"] is False
        assert data["mode"] == mock_mode
        assert data["is_exact"] is False
        assert data["result"] is None
        assert "No result" in data["message"]


def test_search_track_invalid_file(client):
    """Тестирует отклонение невалидного файла при поиске"""
    
    with patch('back.app.api.search_track') as mock_search_track:
        
        mock_search_track.side_effect = TrackValidationError("Uploaded file is not a valid WAV audio file.")
        
        response = client.post(
            "/api/tracks/search",
            files={"file": ("test.mp3", io.BytesIO(b"fake audio"), "audio/mp3")},
            data={"mode": "exact"},
        )
        
        assert response.status_code == 400
        assert "valid WAV" in response.json()["detail"]


def test_search_track_storage_error(client):
    """Тестирует обработку ошибок хранилища при поиске треков"""

    mock_db = Mock()
    mock_mode = "exact"

    with patch('back.app.api.search_track') as mock_search_track, \
         patch('back.app.api.get_db', return_value=mock_db):
        
        mock_search_track.side_effect = TrackStorageError("Failed to search tracks from storage")
        
        response = client.post(
            "/api/tracks/search",
            files={"file": ("test.wav", io.BytesIO(b"fake audio"), "audio/wav")},
            data={"mode": mock_mode},
        )
        
        assert response.status_code == 500
        assert "Failed to search tracks" in response.json()["detail"]

def test_stream_track_success(client):
    """Тестирует успешное стриминг аудиофайла"""

    mock_minio_client = Mock()
    mock_response = io.BytesIO(b"WAV audio data...")
    
    mock_track = Mock()
    mock_track.track_id = 42
    mock_track.track_name = "Test Song"
    mock_track.track_minio_key = "uuid-12345"

    api.dependency_overrides[get_minio_client] = lambda: mock_minio_client
    api.dependency_overrides[get_track_by_id] = lambda db, track_id: mock_track
    api.dependency_overrides[get_db] = lambda: Mock() 

    try:
        mock_minio_client.get_object.return_value = mock_response
        
        response = client.get("/api/tracks/42/stream")
        
        assert response.status_code == 200
        assert "audio/wav" in response.headers["content-type"]
        assert response.content == b"WAV audio data..."
    finally:
        api.dependency_overrides.clear()
        
def test_stream_track_not_found(client):
    """Тестирует ошибку 404 при стриминге несуществующего трека"""
    
    with patch('back.app.api.get_track_by_id') as mock_get_track, \
         patch('back.app.api.get_db') as mock_db:
        
        # Мокируем отсутствие трека
        mock_get_track.return_value = None
        
        response = client.get("/api/tracks/999/stream")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

def test_stream_track_minio_error(client):
    """Тестирует ошибку при получении файла из MinIO (500)"""

    mock_minio_client = Mock()
    mock_minio_client.get_object.side_effect = Exception("MinIO error: Connection refused")

    mock_track = Mock()
    mock_track.track_id = 42
    mock_track.track_name = "Test Song"
    mock_track.track_minio_key = "uuid-12345"
    
    api.dependency_overrides[get_minio_client] = lambda: mock_minio_client
    api.dependency_overrides[get_track_by_id] = lambda db, track_id: mock_track
    api.dependency_overrides[get_db] = lambda: Mock() 

    try:
        response = client.get("/api/tracks/42/stream")
        assert response.status_code == 500
        assert "MinIO error: Connection refused" in response.json()["detail"]
    finally:
        api.dependency_overrides.clear()
        
if __name__ == '__main__':
    arr = os.listdir('tracks')
    print(arr)
    exit_code = pytest.main([__file__, "-v"])
    sys.exit(exit_code)