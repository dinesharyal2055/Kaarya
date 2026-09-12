import axios from 'axios';

const RAW_API_URL = import.meta.env.VITE_API_URL || 'https://kaarya-4qft.onrender.com';
// Request paths already include the `/api` prefix, so normalize away a trailing `/api`
// (e.g. VITE_API_URL=".../api") to avoid a doubled `/api/api/...`.
const API_URL = RAW_API_URL.replace(/\/+$/, '').replace(/\/api$/i, '');

const api = axios.create({
  baseURL: API_URL,
});

// Request interceptor to add JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('kaarya_admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 (unauthorized) and 403 (forbidden)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        // Clear token and redirect to login
        localStorage.removeItem('kaarya_admin_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;