
# Audioseeker

---

## Project overview

This project is part of a university course project for the *DevOps* course.

**Audioseeker** is a service, similar in it's core to Shazam for music search. It's main goal is to replicate main Shazam functionality -- to recognise and find audio tracks in the database by a short audio sample given as input. The system uses audio fingerprinting algorithm, similarly to Shazam, to indentify tracks even with noisy input or low audio quality input.  

The expected resulting functionality of the app:
- Search for the most similar music track among presented in the app database to the audio sample, provided by the user. On the prototype stage only `.wav` files are expected as input. Later the list of audio file extensions may be extended to include more popular extensions, or even an audio sample coming from the user's mic may be used as input for search, like in Shazam;
- Browse the tracks list, presented in the database of the app using. Additionally a simple search system by the track name, author or other meta-data may be added;
- Add new track into the app's database to extend the music library;
- Delete existing tracks from the database.
Some of these features should be admin-only, while the others should be allowed for any user.

## Tech Stack

Main tools presumably required for use
- **Inftrastructure**: Docker, Docker Compose
- **Data Storage**: MinIO (S3-compatible)
- **Database**: PostgreSQL
- **Backend**: Python
- **Frontend**: React, TypeScript
- **API**: FastAPI
- **Other Tools**: TO BE DESIDED
This is a minimal list of tools required on the current stage of the project, according to the overall requirements of the course. This list may be extended in the future.

## Architecture Components

1. **Infrastracture**:
Deployed using docker-compose.
- **MinIO**: An object storage system for the physical storage of audio files. It ensures the reliability and availability of media content.
- **PostgreSQL**: A relational database for storing track metadata and their audio fingerprints. Optimized for fast search of similar vectors.      
Upon first launch, the script `db/create_schema.sql` runs automatically to create the necessary tables and schemas.

2. **Backend**:
Responsible for processing requests, data handling, and search algorithms.
- `db/`: Data model descriptions and connection configurations. Sessions are configured to work correctly with both PostgreSQL and MinIO.
- `scripts/`: Utilities for importing and initially populating the track database.
- `core/`: The project core. Contains the implementation of fingerprint generation algorithms and the logic for comparing audio streams.
- `app/`: The API layer. Processes HTTP requests, validates data, and returns search results.
- `test/`: A set of automated tests for verifying the API logic.

3. **Frontend**:
User interface for interacting with the service.
- `src/`: Client-side source code (components, styles, request logic).
- `test/`: Tests for the interface and user scenarios.

## Project Structure

This is the structure of the project on the current stage of development.
```
audio-seeker/
├── AGENTS.md
├── README.md
├── back
│   ├── __init__.py
│   ├── app
│   │   └── api.py
│   ├── core
│   │   ├── Seeker.py
│   │   ├── __init__.py
│   │   └── services.py
│   ├── db
│   │   ├── __init__.py
│   │   ├── database.py
│   │   └── models.py
│   └── scripts
│       └── seed.py
├── db
│   └── create_schema.sql
├── docker-compose.yml
├── requirements.txt
└── tracks
    ├── AIZO - King Gnu.wav
    ├── Eve - Kaikai_Kitan.wav
    └── output.wav
```
All future changes and additions to the project should follow the existing strucutre and extend it in the same structured and organized manner.


## Development Guidelines

### Setup Requirements

For the application to work properly, you must create a `.env` file in the project root directory with the following contents:
```
PG_USER=seeker
PG_PASSWORD=secret_pass
PG_DB=tracks
PG_HOST=localhost
POSTGRES_PORT=5432
MINIO_API_PORT=9000
MINIO_PORT=9001
MINIO_USER=saver
MINIO_PASSWORD=saverpass
MINIO_HOST=localhost
```

### TODO

#### REST API

Implement a REST API with the following 4 CRUD operations:
   - [ ] C: Insert a track into the database
   - [x] R: View the list of tracks
   - [ ] R: Search for a track by audio clip
   - [x] D: Delete a track from the database

Two of the four operations are implemented, so they needed to be checked for correctness and fixed if needed.
A *CORS* header should be written in the API.
For the insertion operation the implementation logic from `scripts/seed.py` code may be borrowed as a source of inspiration, or a genuine new logic may be written if implements operation in a more optimal way.

#### Front-End

Implement Front-End part of the app with user-interface. The UI should provide interaction with each API method.

A draft list of pages:
1. **Sing-up page**: expects to have a standard set of input fields -- login and password -- for registration of the new users. Currently may be made as a placeholder page redirecting to the home page of the app, or just available only to admins.
Structure:
   - login: text field
   - password: text field
   - register button
2. **Login page**: same, as sign-up, but for users with created accounts. Currently also a placeholder page redirecting to the home page, or available only to admins. Similar structure to the *sign-up* page, but with login button instead.
3. **Home page**: main page with core Shazam-like functionality. Currently here should be a window to load audio-file of `.wav` extension only with audio with an audio sample, for which the most similar music track needs to be found in the database, or a message returned indicating that no track was found. A toggle option should also be presented to switch between exact search (return result if system found something, or return nothing) and approximate search (return the most similar find, even if system couldn't find exact similarity).
Structure:
   - *Choose file* button in the middle of the page, opens file system window to choose file from.
   - Toggle buttong under the button to switch between exect and loose search modes.
   - The *Search* button to the right of the toggle button.

Another field for the result output should be above the `Search` button. Here on success should appear track info, and on fail -- simple text "No result" for exact mode only, and "No exact match. Here is the most close match in our database" text and track info for the approximate search mode.

This page uses search API functionality.

4. **Browse page**: a list view with tracks currently presented in the database of the app. List view should include such columns:
   - *#* - number of the track in the list
   - *Title* - title of the track
   - *Author* - optional field, may be empty.
   - *Date added* - date of the track being added to the database. Currently empty, since database doesn't have this info yet.
   - *Duration* - duration in the format `m:ss`. Currently empty, since database doesn't have this info yet.
A search bar should be added above the list to search for specific track using text input. The input is search among `Title` and `Author` columns.
For the future, additional search options may be added, such as search by the duration limits or search by the date added.
5. **Upload/Delete page**: admin-only available page, allowing admins to manually load new tracks as audio files into the database. Must include a form for entering track information specific to the database structure, like title and author. Duration should be evaluated automatically via audio track duration. The `Upload` button should be at the bottom of the form. If uploading was successfull, green notification bar of success should appear in the upper-left corner of the page. If uploading was unsuccessful, red notification bar should appear in the same place.
API-functionality of insertion and deletion should be used on this page.

For the navigation between pages, a toggle drop-down menu with available pages should be in the upper right corner of each page. Again, the `Upload/Delete` page should be visible only to admin accounts, but on the current stage of the project it may be visible to anyone.

#### Authorization Functionality

An authorization mechanism should be implemented for the app. It should include such functions:
- Sign-up to create new accounts and write their login and password into the database of users for subsequent logins.
- Login to verify the users credentials and provide him access to his account functionality.

For this mechanism a separate new implementation is required, as well as API extension, as well as a new database to store info about users.

A separation between Admins and common users should be implemented to provide admins with extra functionality, while restricting common users to certain features. The difference between these two types of users was already explained above.

#### Tests

Unit-Tests covering both backend and frontend should be implemented.
For backend test `pytest` library should be used to write unit tests. Generally most tests should use mocks for tests as inputs.
For frontend use TypeScript test tools, probably `Vitest`.  

#### Docker

After completing backend and frontend and making it working stable, after both frontend and backend passes all unit tests, they should be wrapped into Docker files for future deployment, and the docker-compose file should be updated respectively.

#### GitHub Actions

TODO

---