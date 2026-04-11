// src/components/TrackList.jsx
import { useEffect, useState } from 'react';
import { trackAPI } from '../services/api';

export default function TrackList() {
  const [tracks, setTracks] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 10;

  useEffect(() => {
    loadTracks();
  }, [page]);

  const loadTracks = async () => {
    try {
      const skip = (page - 1) * limit;
      const response = await trackAPI.getTracks(skip, limit);
      setTracks(response.data.items || response.data);
    } catch (err) {
      console.error('Ошибка загрузки треков:', err);
    }
  };

  const handleDelete = async (trackId) => {
    if (!confirm('Удалить трек?')) return;
    try {
      await trackAPI.deleteTrack(trackId);
      loadTracks(); 
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  return (
    <div className="track-list">
      <h3>📚 Треки в базе</h3>
      
      {tracks.length === 0 ? (
        <p>Нет треков</p>
      ) : (
        <ul>
          {tracks.map(track => (
            <li key={track.track_id || track.id}>
              <strong>{track.track_name || track.title}</strong> — {track.track_author || track.artist}
              <button onClick={() => handleDelete(track.track_id || track.id)}>
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
      
      <div className="pagination">
        <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>
          ← Назад
        </button>
        <span> Страница {page} </span>
        <button onClick={() => setPage(p => p + 1)}>
          Вперёд →
        </button>
      </div>
    </div>
  );
}