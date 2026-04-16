// src/components/TrackList.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { trackAPI } from '../services/api'; // ✅ уже импортировано
import '../App.css';

const ITEMS_PER_PAGE = 20;

export default function TrackList({ onTrackSelect, onPlayTrack, isPlaying, playingTrackId }) {
  const [tracks, setTracks] = useState([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * ITEMS_PER_PAGE;
      const response = await trackAPI.getTracks(skip, ITEMS_PER_PAGE, searchQuery);
      
      setTracks(response.items || []);
      setTotal(response.total || 0);
      setHasMore(response.has_more ?? false);
    } catch (err) {
      console.error('Ошибка загрузки треков:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => { 
    loadTracks(); 
  }, [loadTracks]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadTracks();
  };

  const handleDelete = async (trackId, e) => {
    e.stopPropagation();
    
    if (!confirm('🗑️ Удалить этот трек навсегда?')) return;
    try {
      await trackAPI.deleteTrack(trackId);
      loadTracks();
    } catch (err) {
      console.error(err.message || 'Ошибка удаления');
    }
  };

  // 📄 Пагинация
  const startItem = (page - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(page * ITEMS_PER_PAGE, total);
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div className="track-list-container">
      <div className="glass track-list-header">
        <h2 className="track-list-title">Библиотека треков</h2>
        <span className="track-list-stats">
          {total} треков • Стр. {page}{totalPages > 1 ? ` из ${totalPages}` : ''}
        </span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="track-list-search">
        <div className="track-list-search-form">
          <input
            type="text"
            className="input"
            placeholder="🔍 Поиск по названию или автору..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">Найти</button>
        </div>
      </form>

      {/* Tracks List */}
      <div className="glass track-list-items">
        {tracks.map(track => (
          <div
            key={track.track_id}
            className="track-item glass"
            onClick={() => onTrackSelect?.(track)}
          >
            {/* Left: Icon + Name + Author */}
            <div className="track-item-left">
              <div className="track-icon animate-float">🎧</div>
              
              <div className="track-info">
                <span className="track-name" title={track.track_name}>
                  {track.track_name}
                </span>
                
                {track.track_author && (
                  <>
                    <span className="track-separator">•</span>
                    <span className="track-author" title={track.track_author}>
                      {track.track_author}
                    </span>
                  </>
                )}
              </div>
            </div>
            
            {/* Right: Actions */}
            <div className="track-actions">
              <button 
                className="btn btn-ghost"
                onClick={(e) => onPlayTrack(track, e)}
                title={playingTrackId === track.track_id && isPlaying? 'Пауза' : 'Воспроизвести'}
              >
                {playingTrackId === track.track_id && isPlaying? '⏸️' : '▶️'}
              </button>
            </div>
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="track-list-loading">
            <div className="waveform">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="waveform-bar"></div>
              ))}
            </div>
            <p className="mt-4">Загрузка...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && tracks.length === 0 && (
          <div className="track-list-empty">
            <p className="track-list-empty-icon">🎭</p>
            <p>{searchQuery ? 'Ничего не найдено' : 'Треков пока нет. Загрузи первый!'}</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="track-pagination">
          <button
            className="btn btn-ghost"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            title="Предыдущая страница"
          >
            ← Назад
          </button>

          <span className="track-pagination-info">
            Страница <strong>{page}</strong> из {totalPages}
          </span>

          <button
            className="btn btn-ghost"
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore || loading}
            title={!hasMore ? 'Больше треков нет' : 'Следующая страница'}
          >
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}

// 🍞 Toast helper
const showToast = (message, type = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};