import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { trackAPI } from '../services/api.js';
import '../App.css';

function MicIcon({ active = false }) {
  return (
    <div className={active ? 'mic-icon active' : 'mic-icon'}>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>
    </div>
  );
}

MicIcon.propTypes = {
  active: PropTypes.bool,
};

function PulseRing() {
  return (
    <div className="pulse-ring">
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={`pulse-circle pulse-${i + 1}`} />
      ))}
    </div>
  );
}

function SearchButtonContent({ isProcessing, isListening }) {
  if (isProcessing) {
    return <div className="spinner" />;
  }

  return <MicIcon active={isListening} />;
}

SearchButtonContent.propTypes = {
  isProcessing: PropTypes.bool.isRequired,
  isListening: PropTypes.bool.isRequired,
};

function NoResultCard({ timedOut }) {
  const title = timedOut ? '⏱️ Поиск превысил время ожидания' : 'Треки не найдены';
  const hint = timedOut
    ? 'Попробуйте записать более чёткий фрагмент или проверить соединение'
    : 'Попробуйте записать фрагмент тише, без шумов, или загрузите другой файл';

  return (
    <div className="no-result-card" data-testid="no-result">
      <div className="no-result-icon">🔍</div>
      <h3>{title}</h3>
      <p className="no-result-hint">{hint}</p>
    </div>
  );
}

NoResultCard.propTypes = {
  timedOut: PropTypes.bool,
};

function TrackFoundCard({
  track,
  timedOut,
  onPlayTrack,
  isPlaying,
  playingTrackId,
}) {
  const isCurrentTrackPlaying = playingTrackId === track?.track_id && isPlaying;
  const trackName = track?.track_name || 'Неизвестный трек';
  const trackAuthor = track?.track_author || 'Неизвестный исполнитель';

  return (
    <div className="track-card" data-testid="track-found">
      <div className="track-info">
        <h3 className="track-title">
          <span className="track-name" title={trackName}>
            {trackName}
          </span>
        </h3>

        <span className="track-separator">•</span>

        <p className="track-artist">
          <span className="track-artist" title={trackAuthor}>
            {trackAuthor}
          </span>
        </p>

        {timedOut && (
          <p className="timeout-hint" data-testid="timeout-hint">
            ⚠️ Найдено лучшее совпадение за отведённое время
          </p>
        )}
      </div>

      <div className="track-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={(e) => track && onPlayTrack(track, e)}
          title={isCurrentTrackPlaying ? 'Пауза' : 'Воспроизвести'}
          disabled={!track}
        >
          {isCurrentTrackPlaying ? '⏸️' : '▶️'}
        </button>
      </div>
    </div>
  );
}

TrackFoundCard.propTypes = {
  track: PropTypes.shape({
    track_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    track_name: PropTypes.string,
    track_author: PropTypes.string,
  }),
  timedOut: PropTypes.bool,
  onPlayTrack: PropTypes.func.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  playingTrackId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

function SearchResult({
  result,
  onPlayTrack,
  isPlaying,
  playingTrackId,
}) {
  if (!result) {
    return null;
  }

  return (
    <div className="track-result" data-testid="search-result">
      {!result.matched ? (
        <NoResultCard timedOut={result.timed_out} />
      ) : (
        <TrackFoundCard
          track={result.result}
          timedOut={result.timed_out}
          onPlayTrack={onPlayTrack}
          isPlaying={isPlaying}
          playingTrackId={playingTrackId}
        />
      )}
    </div>
  );
}

SearchResult.propTypes = {
  result: PropTypes.shape({
    matched: PropTypes.bool,
    timed_out: PropTypes.bool,
    result: PropTypes.shape({
      track_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      track_name: PropTypes.string,
      track_author: PropTypes.string,
    }),
  }),
  onPlayTrack: PropTypes.func.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  playingTrackId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

function getHintText(isProcessing, isListening) {
  if (isProcessing) {
    return '🔍 Ищем совпадение...';
  }

  if (isListening) {
    return '🎤 Слушаем... (15 сек)';
  }

  return '🎵 Нажмите, чтобы найти трек';
}

function parseApiError(err) {
  if (typeof err === 'string') {
    return err;
  }

  if (err?.detail && Array.isArray(err.detail)) {
    const first = err.detail[0];
    return `${first.loc?.join(' → ') || 'Поле'}: ${first.msg}`;
  }

  if (typeof err?.detail === 'string') {
    return err.detail;
  }

  if (err?.message) {
    return err.message;
  }

  if (err?.error) {
    return err.error;
  }

  try {
    const json = JSON.stringify(err);
    return json.length > 150 ? `${json.slice(0, 150)}...` : json;
  } catch {
    return 'Неизвестная ошибка при поиске';
  }
}

export default function TrackSearcher({
  onResult,
  onError,
  onPlayTrack,
  isPlaying = false,
  playingTrackId = null,
}) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleSearch = async (audioFile) => {
    try {
      setIsProcessing(true);
      setError(null);

      const data = await trackAPI.searchTrack(audioFile, 'exact');

      setResult(data);
      onResult?.(data);
    } catch (err) {
      const message = parseApiError(err);

      console.error('❌ Search failed:', message);
      setError(message);
      onError?.(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
  };

  const handleRecordingStop = async (stream) => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

    await handleSearch(audioBlob);

    stream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const configureMediaRecorder = (stream) => {
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => handleRecordingStop(stream);

    return mediaRecorder;
  };

  const startListening = async () => {
    try {
      setError(null);
      setResult(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      mediaRecorderRef.current = configureMediaRecorder(stream);
      mediaRecorderRef.current.start();

      setIsListening(true);

      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopListening();
        }
      }, 15000);
    } catch (err) {
      console.error('Microphone error:', err);
      setError('Не удалось получить доступ к микрофону. Проверьте разрешения.');
      onError?.(err);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];

    if (file) {
      await handleSearch(file);
    }
  };

  const buttonClassName = [
    'shazam-button',
    isListening ? 'listening' : '',
    isProcessing ? 'processing' : '',
  ].filter(Boolean).join(' ');

  const buttonLabel = isListening
    ? 'Остановить запись'
    : 'Нажать для поиска трека';

  const hintText = getHintText(isProcessing, isListening);

  return (
    <div className="track-searcher">
      <div className="shazam-button-wrapper">
        <button
          type="button"
          className={buttonClassName}
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          aria-label={buttonLabel}
        >
          <SearchButtonContent
            isProcessing={isProcessing}
            isListening={isListening}
          />

          {isListening && <PulseRing />}
        </button>

        <p className="hint-text">{hintText}</p>
      </div>

      <label className="file-upload-label">
        <input
          type="file"
          accept="audio/wav"
          onChange={handleFileUpload}
          disabled={isProcessing || isListening}
          hidden
        />
        <span className="file-upload-btn">
          📁 Загрузить аудиофайл
        </span>
      </label>

      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️</span> {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="error-close"
          >
            ×
          </button>
        </div>
      )}

      <SearchResult
        result={result}
        onPlayTrack={onPlayTrack}
        isPlaying={isPlaying}
        playingTrackId={playingTrackId}
      />
    </div>
  );
}

TrackSearcher.propTypes = {
  onResult: PropTypes.func,
  onError: PropTypes.func,
  onPlayTrack: PropTypes.func.isRequired,
  isPlaying: PropTypes.bool,
  playingTrackId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
};