CREATE SCHEMA IF NOT EXISTS sounds;

CREATE TABLE IF NOT EXISTS  sounds.tracks(
    track_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    track_name VARCHAR(256),
    track_author VARCHAR(256),
    track_minio_key UUID
);

CREATE TABLE IF NOT EXISTS  sounds.track_fingerprints(
    track_id int,
    hash_code int,
    anchor_time int,
    FOREIGN KEY (track_id) REFERENCES sounds.tracks(track_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS  idx_ncl_track_fingerprints_hash_code ON sounds.track_fingerprints(hash_code);

CREATE INDEX IF NOT EXISTS  idx_ncl_fingerprints_track_id ON sounds.track_fingerprints(track_id);