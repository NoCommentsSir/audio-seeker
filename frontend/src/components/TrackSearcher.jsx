import React, { useState, useRef, useEffect } from 'react';
import { trackAPI } from '../services/api.js'; 
import '../App.css';

export default function TrackSearcher({ onResult, onError, onPlayTrack, isPlaying, playingTrackId }) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Очистка ресурсов при размонтировании
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Запись аудио через Web Audio API
  const startListening = async () => {
    try {
      setError(null);
      setResult(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus' 
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleSearch(audioBlob);
        
        // Очистка
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      setIsListening(true);

      // Авто-остановка через 15 секунд
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

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
    }
  };

  // Единая функция поиска — использует api.searchTrack
  const handleSearch = async (audioFile) => {
    try {
      setIsProcessing(true);
      setError(null);
      
      // Вызываем ваш существующий метод из api.js
      // mode: 'fingerprint' для поиска по отпечатку, 'exact' для точного совпадения
      const data = await trackAPI.searchTrack(audioFile, 'exact');
      
      setResult(data);
      onResult?.(data);
    } catch (err) {
      // Надёжный парсинг ошибки (учитывает формат FastAPI)
      const message = parseApiError(err);
      console.error('❌ Search failed:', message);
      setError(message);
      onError?.(err);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Загрузка файла как альтернатива
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleSearch(file);
    }
  };

  // Хелпер для красивых сообщений об ошибках
  const parseApiError = (err) => {
    if (typeof err === 'string') return err;
    
    // FastAPI 422: detail — массив объектов
    if (err?.detail && Array.isArray(err.detail)) {
      const first = err.detail[0];
      return `${first.loc?.join(' → ') || 'Поле'}: ${first.msg}`;
    }
    
    // FastAPI 400/500: detail — строка
    if (typeof err?.detail === 'string') return err.detail;
    
    // Стандартные поля
    if (err?.message) return err.message;
    if (err?.error) return err.error;
    
    // Фолбэк
    try {
      const json = JSON.stringify(err);
      return json.length > 150 ? json.slice(0, 150) + '...' : json;
    } catch {
      return 'Неизвестная ошибка при поиске';
    }
  };

  // Анимация пульсации кнопки
  const renderPulseRing = () => (
    <div className="pulse-ring">
      {[...Array(3)].map((_, i) => (
        <span key={i} className={`pulse-circle pulse-${i + 1}`} />
      ))}
    </div>
  );

  return (
    <div className="track-searcher">
      {/* Кнопка Shazam-style */}
      <div className="shazam-button-wrapper">
        <button
          className={`shazam-button ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          aria-label={isListening ? 'Остановить запись' : 'Нажать для поиска трека'}
        >
          {isProcessing ? (
            <div className="spinner" />
          ) : isListening ? (
            <div className="mic-icon active">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
          ) : (
            <div className="mic-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
          )}
          
          {isListening && renderPulseRing()}
        </button>
        
        <p className="hint-text">
          {isProcessing ? '🔍 Ищем совпадение...' : 
           isListening ? '🎤 Слушаем... (15 сек)' : 
           '🎵 Нажмите, чтобы найти трек'}
        </p>
      </div>

      {/* Альтернатива: загрузка файла */}
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

      {/* Ошибка */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️</span> {error}
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}

      {/* Результат */}
        {result && (
          <div className="track-result">
            {/* 🚫 Случай: трек не найден */}
            {result.message === "No result" ? (
              <div className="no-result-card">
                <div className="no-result-icon">🔍</div>
                <h3>Треки не найдены</h3>
                <p className="no-result-hint">
                  Попробуйте записать фрагмент тише, без шумов, или загрузите другой файл
                </p>
              </div>
            ) : (
              /* ✅ Случай: трек найден */
              <div className="track-card">
                <div className="track-info">
                  <h3 className="track-title">
                    <span className="track-name" title={result.result?.track_name || 'Неизвестный трек'}>
                      {result.result?.track_name || 'Неизвестный трек'}
                    </span>
                  </h3>
                  <span className="track-separator">•</span>
                  <p className="track-artist">
                    <span className="track-artist" title={result.result?.track_author || 'Неизвестный исполнитель'}>
                      {result.result?.track_author || 'Неизвестный исполнитель'}
                    </span>
                  </p>
                </div>
                
                {/* Right: Actions */}
                <div className="track-actions">
                  <button 
                    className="btn btn-ghost"
                    onClick={(e) => onPlayTrack(result.result, e)}
                    title={playingTrackId === result.result.track_id && isPlaying? 'Пауза' : 'Воспроизвести'}
                  >
                    {playingTrackId === result.result.track_id && isPlaying? '⏸️' : '▶️'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}