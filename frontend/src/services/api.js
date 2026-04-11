// src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000', // Адрес твоего FastAPI
  headers: {
    'Content-Type': 'application/json',
  },
});

// Методы для работы с треками
export const trackAPI = {
  // Загрузить трек (админка)
//   uploadTrack: (formData) => 
//     api.post('/api/tracks', formData, {
//       headers: { 'Content-Type': 'multipart/form-data' },
//     }),
  
  // Получить список треков с пагинацией
  getTracks: (skip = 0, limit = 10) => 
    api.get(`/api/tracks?skip=${skip}&limit=${limit}`),
  
  // Удалить трек
  deleteTrack: (trackId) => 
    api.delete(`/api/tracks/${trackId}`),
  
  // Распознать аудио (основная фича!)
//   recognize: (formData) => 
//     api.post('/api/recognize', formData, {
//       headers: { 'Content-Type': 'multipart/form-data' },
//     }),
};

export default api;