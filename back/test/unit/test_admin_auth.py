import base64
import hashlib
import secrets
from datetime import datetime, timedelta

import jwt
import pytest

from back.core import admin_auth


def _make_password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256', password.encode('utf-8'), salt, 100000
    )
    return f"{salt.hex()}:{base64.b64encode(pwd_hash).decode()}"


def test_verify_password_returns_true_for_matching_password():
    password = 'correct-horse-battery-staple'
    hashed = _make_password_hash(password)

    assert admin_auth.verify_password(password, hashed) is True


def test_verify_password_returns_false_for_wrong_password():
    hashed = _make_password_hash('correct-password')

    assert admin_auth.verify_password('incorrect-password', hashed) is False


def test_verify_password_returns_false_for_invalid_hash_format():
    assert admin_auth.verify_password('password', 'invalid-hash-format') is False


def test_verify_password_returns_false_when_hash_is_none():
    assert admin_auth.verify_password('password', None) is False


def test_create_admin_token_encodes_valid_payload():
    token = admin_auth.create_admin_token('admin')
    payload = jwt.decode(
        token,
        admin_auth.SECRET_KEY,
        algorithms=[admin_auth.ALGORITHM],
    )

    assert payload['sub'] == 'admin'
    assert payload['is_admin'] is True
    assert 'exp' in payload


def test_verify_admin_token_accepts_valid_admin_token():
    token = admin_auth.create_admin_token('admin')
    payload = admin_auth.verify_admin_token(token)

    assert payload is not None
    assert payload['sub'] == 'admin'
    assert payload['is_admin'] is True


def test_verify_admin_token_rejects_invalid_token():
    assert admin_auth.verify_admin_token('not.a.real.token') is None


def test_verify_admin_token_rejects_non_admin_payload():
    payload = {
        'sub': 'admin',
        'is_admin': False,
        'exp': datetime.now() + timedelta(hours=1),
    }
    token = jwt.encode(payload, admin_auth.SECRET_KEY, algorithm=admin_auth.ALGORITHM)

    assert admin_auth.verify_admin_token(token) is None


def test_verify_admin_token_rejects_wrong_subject():
    payload = {
        'sub': 'not-admin',
        'is_admin': True,
        'exp': datetime.now() + timedelta(hours=1),
    }
    token = jwt.encode(payload, admin_auth.SECRET_KEY, algorithm=admin_auth.ALGORITHM)

    assert admin_auth.verify_admin_token(token) is None


def test_authenticate_admin_allows_any_password_when_hash_missing(monkeypatch):
    monkeypatch.setattr(admin_auth, 'ADMIN_PASSWORD_HASH', None)

    assert admin_auth.authenticate_admin('anything') is True
    assert admin_auth.authenticate_admin('') is True


def test_authenticate_admin_verifies_password_when_hash_present(monkeypatch):
    hashed = _make_password_hash('secret-password')
    monkeypatch.setattr(admin_auth, 'ADMIN_PASSWORD_HASH', hashed)

    assert admin_auth.authenticate_admin('secret-password') is True
    assert admin_auth.authenticate_admin('wrong-password') is False
