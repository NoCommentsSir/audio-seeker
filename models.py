from sqlalchemy import Column, UUID, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Track(Base):
    __tablename__ = "sounds.tracks"
    track_name = Column(String)
    track_author = Column(String)
    minio_key = Column(UUID)