from sqlalchemy import Column, UUID, String, Integer, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Track(Base):
    __tablename__ = "tracks"
    __table_args__ = {"schema": "sounds"}
    track_id = Column(Integer, primary_key=True, autoincrement=True) 
    track_name = Column(String)
    track_author = Column(String)
    track_minio_key = Column(UUID)

    fingerprints = relationship("Track_Fingerprint", back_populates="track", passive_deletes=True)

class Track_Fingerprint(Base):
    __tablename__ = "track_fingerprints"
    __table_args__ = {"schema": "sounds"}
    fingerprint_id = Column(Integer, primary_key=True, autoincrement=True) 
    track_id = Column(Integer, ForeignKey("sounds.tracks.track_id")) 
    hash_code = Column(Integer)
    anchor_time = Column(Integer)

    track = relationship("Track", back_populates="fingerprints")