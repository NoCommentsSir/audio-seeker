vi.mock('../adminAuth.js', () => ({
  adminAuth: {
    getAuthHeader: vi.fn(),
  },
}));

import { adminAuth } from '../adminAuth.js';
import { trackAPI } from '../api.js';

describe('trackAPI service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  test('getTracks делает запрос с параметрами и возвращает данные', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ items: [{ id: 1 }], total: 1, has_more: false }),
    });

    const result = await trackAPI.getTracks(5, 50, 'query');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tracks?skip=5&limit=50&query=query'));
    expect(result).toEqual({ items: [{ id: 1 }], total: 1, has_more: false });
  });

  test('getTracks выбрасывает ошибку при неудачном ответе', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });

    await expect(trackAPI.getTracks()).rejects.toThrow('Failed to fetch tracks');
  });

  test('deleteTrack отправляет заголовок авторизации и возвращает true', async () => {
    adminAuth.getAuthHeader.mockReturnValue({ Authorization: 'Bearer token' });
    globalThis.fetch.mockResolvedValue({ ok: true });

    const result = await trackAPI.deleteTrack(7);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tracks/7'), expect.objectContaining({
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    }));
    expect(result).toBe(true);
  });

  test('deleteTrack выбрасывает ошибку Unauthorized при 401', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(trackAPI.deleteTrack(7)).rejects.toThrow('Unauthorized: Admin token required');
  });

  test('deleteTrack выбрасывает ошибку Track not found при 404', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(trackAPI.deleteTrack(8)).rejects.toThrow('Track not found');
  });

  test('uploadTrack отправляет форму и возвращает данные', async () => {
    adminAuth.getAuthHeader.mockReturnValue({ Authorization: 'Bearer token' });
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 123, name: 'Test' }),
    });

    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' });
    const result = await trackAPI.uploadTrack(file, 'Title', 'Author');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tracks'), expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: expect.any(FormData),
    }));
    expect(result).toEqual({ id: 123, name: 'Test' });
  });

  test('uploadTrack выбрасывает Unauthorized при 401', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 401, json: vi.fn().mockResolvedValue({}) });

    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' });
    await expect(trackAPI.uploadTrack(file, 'Title')).rejects.toThrow('Unauthorized: Admin token required');
  });

  test('uploadTrack выбрасывает ошибку из detail при неудаче', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 400, json: vi.fn().mockResolvedValue({ detail: 'Upload error' }) });

    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' });
    await expect(trackAPI.uploadTrack(file, 'Title')).rejects.toThrow('Upload error');
  });

  test('searchTrack возвращает результат поиска', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ matched: true }),
    });

    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' });
    const result = await trackAPI.searchTrack(file, 'fingerprint');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tracks/search'), expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
    expect(result).toEqual({ matched: true });
  });

  test('searchTrack выбрасывает ошибку из detail при неудаче', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({ detail: 'Search failed' }) });

    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' });
    await expect(trackAPI.searchTrack(file)).rejects.toThrow('Search failed');
  });

  test('getTrackStreamUrl формирует корректный URL', () => {
    expect(trackAPI.getTrackStreamUrl(42)).toContain('/api/tracks/42/stream');
  });
});
