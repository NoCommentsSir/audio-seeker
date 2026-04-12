// src/pages/Home.jsx
import { useState, useCallback, useRef, useEffect} from 'react';
import TrackSearcher from '../components/TrackSearcher';
import TrackList from '../components/Tracklist';
import { trackAPI } from '../services/api';

export default function Home() {
  const [searchResult, setSearchResult] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);

  const handleResult = (track) => {
    console.log('Найден трек:', track);
  };

  const handleError = (err) => {
    console.error('Ошибка поиска:', err);
  };

  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Аудио-элемент храним в рефе, чтобы не перерисовывать его
  const audioRef = useRef(null);

  // 🎵 Очистка ресурсов при размонтировании (чтобы аудио не играло в фоне)
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 🎵 Единая функция управления воспроизведением
  const handleGlobalPlay = useCallback(async (track) => {
    
    // 1. Если кликнули на ТОТ ЖЕ трек, который сейчас играет/стоит
    if (playingTrackId === track.track_id) {
      if (isPlaying) {
        // Ставим на паузу
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        // Продолжаем играть
        try {
          await audioRef.current?.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("Resume failed", err);
        }
      }
      return;
    }

    // 2. Если кликнули на НОВЫЙ трек
    
    // Останавливаем текущий, если есть
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      // Получаем URL через API
      const streamUrl = await trackAPI.getTrackStreamUrl(track.track_id);
      
      const audio = new Audio(streamUrl);
      audioRef.current = audio;

      // События аудио
      audio.onended = () => {
        setPlayingTrackId(null);
        setIsPlaying(false);
      };
      audio.onerror = () => {
        console.error("Audio load error");
        setPlayingTrackId(null);
        setIsPlaying(false);
      };

      // Запускаем
      await audio.play();
      setPlayingTrackId(track.track_id);
      setIsPlaying(true);

    } catch (err) {
      console.error("Global play failed", err);
      setPlayingTrackId(null);
      setIsPlaying(false);
    }
  }, [playingTrackId, isPlaying]);

  return (
    <div className="home">
      <h1 className="logo-header"><span className="logo-block"><img src="/logo.svg" alt="PyShazam logo" className="logo-icon"/></span> PyShazam</h1>
      
      {/* <FileUploader onResult={setSearchResult} /> */}
      
      {searchResult && (
        <div className="result">
          <h4>✅ Найдено:</h4>
          <p><strong>{searchResult.track_name}</strong> — {searchResult.track_author}</p>
          <p>Совпадений: {searchResult.matches}</p>
        </div>
      )}
      
      <hr />
      
      <TrackSearcher 
        onResult={handleResult} 
        onError={handleError} 
        onPlayTrack={handleGlobalPlay}
        isPlaying={isPlaying}
        playingTrackId={playingTrackId}
      />
      <TrackList 
        onTrackSelect={(track) => console.log('Selected:', track)}
        onPlayTrack={handleGlobalPlay}
        isPlaying={isPlaying}
        playingTrackId={playingTrackId}
      />
    </div>
  );
}