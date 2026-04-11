// src/pages/Home.jsx
import { useState } from 'react';
// import FileUploader from '../components/FileUploader';
import TrackList from '../components/Tracklist';

export default function Home() {
  const [searchResult, setSearchResult] = useState(null);

  return (
    <div className="home">
      <h1>🎵 PyShazam</h1>
      
      {/* <FileUploader onResult={setSearchResult} /> */}
      
      {searchResult && (
        <div className="result">
          <h4>✅ Найдено:</h4>
          <p><strong>{searchResult.track_name}</strong> — {searchResult.track_author}</p>
          <p>Совпадений: {searchResult.matches}</p>
        </div>
      )}
      
      <hr />
      
      <TrackList />
    </div>
  );
}