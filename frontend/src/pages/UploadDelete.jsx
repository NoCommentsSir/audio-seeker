import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackAPI } from '../services/api.js';
import { adminAuth } from '../services/adminAuth.js';
import '../App.css';

export default function UploadDelete() {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const navigate = useNavigate();

  useEffect(() => {
    // Check if admin is logged in
    if (!adminAuth.isLoggedIn()) {
      navigate('/admin/login');
      return;
    }
    loadTracks();
  }, [navigate]);

  const loadTracks = async () => {
    try {
      const data = await trackAPI.getTracks(0, 100);
      setTracks(data.items);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!file || !name.trim()) {
      setMessage('Please select a file and enter track name');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await trackAPI.uploadTrack(file, name, author || null);
      setMessage('Track uploaded successfully!');
      setMessageType('success');
      setFile(null);
      setName('');
      setAuthor('');
      loadTracks();
    } catch (err) {
      setMessage(`Upload failed: ${err.message}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (trackId) => {
    if (!confirm('Are you sure you want to delete this track?')) {
      return;
    }

    try {
      await trackAPI.deleteTrack(trackId);
      setMessage('Track deleted successfully!');
      setMessageType('success');
      loadTracks();
    } catch (err) {
      setMessage(`Delete failed: ${err.message}`);
      setMessageType('error');
    }
  };

  const handleLogout = () => {
    adminAuth.clearToken();
    navigate('/');
  };

  return (
    <div className="upload-delete-container">
      <div className="admin-header">
        <h1>Admin Panel - Upload & Delete Tracks</h1>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {message && (
        <div className={`notification ${messageType}`}>
          {message}
        </div>
      )}

      <div className="content">
        <div className="upload-section">
          <h2>Upload New Track</h2>
          <form onSubmit={handleUpload} className="upload-form">
            <div className="form-group">
              <label htmlFor="file">Audio File:</label>
              <input
                id="file"
                type="file"
                accept=".wav,.mp3,.flac"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="name">Track Name:</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter track name"
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="author">Artist (optional):</label>
              <input
                id="author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Enter artist name"
                disabled={loading}
              />
            </div>

            <button type="submit" className="upload-btn" disabled={loading}>
              {loading ? 'Uploading...' : 'Upload Track'}
            </button>
          </form>
        </div>

        <div className="tracks-section">
          <h2>Current Tracks ({tracks.length})</h2>
          {tracks.length === 0 ? (
            <p className="no-tracks">No tracks yet</p>
          ) : (
            <div className="track-list-items">
              {tracks.map((track) => (
                <div key={track.track_id} className="track-item glass">
                  <div className="track-info">
                    <span className="track-name" title={track.track_name}>
                      {track.track_name}
                    </span>
                    <span className="track-separator">•</span>
                    {track.track_author && (
                      <>
                        <span className="track-author" title={track.track_author}>
                          {track.track_author}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(track.track_id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
