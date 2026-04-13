const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Import admin auth
import { adminAuth } from './adminAuth.js';

export const trackAPI = {
  getTracks: async (skip = 0, limit = 10, query = '') => {
    const params = new URLSearchParams({ skip, limit });
    if (query) params.append('query', query);
    const res = await fetch(`${API_BASE}/api/tracks?${params}`);
    if (!res.ok) throw new Error('Failed to fetch tracks');
    return res.json();
  },

  deleteTrack: async (trackId) => {
    const headers = adminAuth.getAuthHeader() || {};
    const res = await fetch(`${API_BASE}/api/tracks/${trackId}`, { 
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized: Admin token required');
      if (res.status === 404) throw new Error('Track not found');
      throw new Error('Failed to delete track');
    }
    return true;
  },

  uploadTrack: async (file, name, author = null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    if (author) formData.append('author', author);
    
    const headers = adminAuth.getAuthHeader() || {};
    const res = await fetch(`${API_BASE}/api/tracks`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized: Admin token required');
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to upload track');
    }
    return res.json();
  },

  searchTrack: async (file, mode = 'exact') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    
    const res = await fetch(`${API_BASE}/api/tracks/search`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Search failed');
    }
    return res.json();
  },

  getTrackStreamUrl: (trackId) => {
    return `${API_BASE}/api/tracks/${trackId}/stream`;
  },

};