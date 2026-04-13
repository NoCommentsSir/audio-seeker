# Audioseeker Admin Authentication

## Overview

Простая система аутентификации для администратора:
- Только один админ может загружать и удалять треки
- Обычные пользователи заходят на Home страницу и ищут треки без аутентификации
- Админ защищен паролем (JWT токен с 30-дневным сроком действия)

## Setup

### 1. Генерация пароля админа

```bash
cd scripts
python generate_admin_password.py
```

Введите пароль и подтвердите. Скрипт выдаст хеш пароля.

### 2. Добавление хеша в .env

Откройте `.env` и добавьте хеш:

```env
ADMIN_PASSWORD_HASH=<paste-hash-from-step-1>
SECRET_KEY=your-secret-key
```

Или оставьте `ADMIN_PASSWORD_HASH` пустым для режима разработки (любой пароль).

## API Endpoints

### Login Admin
```
POST /api/admin/login
Content-Type: application/json

{
  "password": "admin_password"
}

Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Upload Track (Admin only)
```
POST /api/tracks
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

file: [audio file]
name: "Track Name"
author: "Artist Name" (optional)
```

### Delete Track (Admin only)
```
DELETE /api/tracks/{track_id}
Authorization: Bearer <access_token>
```

### Get Tracks (Public)
```
GET /api/tracks?skip=0&limit=10&query=search_text
```

### Search Track (Public)
```
POST /api/tracks/search
Content-Type: multipart/form-data

file: [audio file]
mode: "exact" | "approximate"
```

## Frontend Pages

### Home Page (`/`)
- Поиск треков по аудиофайлу
- Просмотр списка всех треков
- Кнопка "Admin" в верхнем правом углу для входа в админ панель

### Admin Login (`/admin/login`)
- Вход админа с паролем
- Перенаправление на админ панель при успешном входе

### Admin Panel (`/admin/upload`)
- Загрузка новых треков (название, исполнитель, файл)
- Просмотр всех текущих треков
- Удаление треков
- Кнопка Logout для выхода

## Token Management

Админ токен хранится в `localStorage` под ключом `admin_token`.

Токен автоматически включается в заголовок `Authorization` при upload/delete запросах.

Токен действует 30 дней, затем требуется повторный вход.

## Security Notes

- Пароль хешируется с использованием `bcrypt`
- JWT токены подписывают с использованием `SECRET_KEY` из `.env`
- Для production обязательно установите обе переменные в `.env`
- Upload/delete операции требуют валидный токен админа
- Публичные операции (get tracks, search) доступны без аутентификации

## Development Mode

Если `ADMIN_PASSWORD_HASH` не установлен в `.env`, система работает в режиме разработки:
- Любой пароль принимается при логине
- Используется для тестирования без генерации реального хеша

Это НЕ рекомендуется для production!
