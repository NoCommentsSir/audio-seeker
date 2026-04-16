const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_TOKEN_KEY = 'admin_token';

export const adminAuth = {
  // Store token in localStorage
  setToken: (token) => {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },

  // Get token from localStorage
  getToken: () => {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  // Clear token (logout)
  clearToken: () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  },

  // Check if admin is logged in
  isLoggedIn: () => {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  // Login with password
  login: async (password) => {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to login');
    }

    const data = await res.json();
    adminAuth.setToken(data.access_token);
    return data;
  },

  // Get authorization header for admin requests
  getAuthHeader: () => {
    const token = adminAuth.getToken();
    if (!token) return null;
    return {
      'Authorization': `Bearer ${token}`,
    };
  },
};
