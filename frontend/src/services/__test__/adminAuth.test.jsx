import { adminAuth } from '../adminAuth.js';

describe('adminAuth service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('сохраняет и возвращает токен', () => {
    adminAuth.setToken('secret-token');

    expect(adminAuth.getToken()).toBe('secret-token');
    expect(adminAuth.isLoggedIn()).toBe(true);
  });

  test('удаляет токен и возвращает false для isLoggedIn', () => {
    adminAuth.setToken('secret-token');
    adminAuth.clearToken();

    expect(adminAuth.getToken()).toBeNull();
    expect(adminAuth.isLoggedIn()).toBe(false);
  });

  test('возвращает заголовок авторизации, если токен задан', () => {
    adminAuth.setToken('secret-token');

    expect(adminAuth.getAuthHeader()).toEqual({
      Authorization: 'Bearer secret-token',
    });
  });

  test('возвращает null, если токен не задан', () => {
    expect(adminAuth.getAuthHeader()).toBeNull();
  });

  test('авторизует и сохраняет токен при успешном логине', async () => {
    const fakeResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ access_token: 'admin-token' }),
    };

    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

    const result = await adminAuth.login('password123');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });
    expect(result).toEqual({ access_token: 'admin-token' });
    expect(adminAuth.getToken()).toBe('admin-token');
  });

  test('кидает ошибку с детализацией при неуспешном логине', async () => {
    const fakeResponse = {
      ok: false,
      json: vi.fn().mockResolvedValue({ detail: 'Bad password' }),
    };

    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

    await expect(adminAuth.login('wrong')).rejects.toThrow('Bad password');
  });

  test('кидает стандартную ошибку при неуспешном логине без detail', async () => {
    const fakeResponse = {
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    };

    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

    await expect(adminAuth.login('wrong')).rejects.toThrow('Failed to login');
  });
});
