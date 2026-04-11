from typing import Literal

from pydantic import BaseModel, ConfigDict


SearchMode = Literal["exact", "approximate"]


class TrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    track_id: int
    track_name: str
    track_author: str | None = None
    track_minio_key: str


class TrackListResponse(BaseModel):
    items: list[TrackResponse]
    total: int
    skip: int
    limit: int
    has_more: bool


class TrackSearchResult(BaseModel):
    track_id: int
    track_name: str
    track_author: str | None = None
    track_minio_key: str
    matches: int
    time_offset: int


class TrackSearchResponse(BaseModel):
    matched: bool
    mode: SearchMode
    is_exact: bool
    timed_out: bool = False
    message: str
    result: TrackSearchResult | None = None
