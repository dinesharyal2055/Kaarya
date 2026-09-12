/**
 * API service — typed fetch wrapper for Kaarya backend.
 * BASE_URL resolution order:
 *   1. EXPO_PUBLIC_API_URL — Expo env var, inlined at bundle time (.env / .env.local / EAS)
 *   2. app.config.js extra.apiUrl — production default for production builds
 *   3. DEV_API_URL — local LAN fallback used by the Expo dev server
 */
import { getToken } from './storage';
import Constants from 'expo-constants';

// Configure your local server URL here (used in all API calls and avatar URLs)
// In development: set to your machine's LAN IP (e.g. 192.168.1.XX:5000)
// Production is configured in app.config.js (extra.apiUrl), not in this file.
const DEV_API_URL = 'http://192.168.1.79:5000/api';

const BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  DEV_API_URL;

// API_ROOT is BASE_URL without the /api suffix — use for serving static files (avatars, uploads)
const API_ROOT = BASE_URL.replace(/\/api$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers = await getAuthHeader();
  headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.error || data.message || 'Something went wrong',
      res.status,
      data.code,
      data.field
    );
  }

  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) =>
  request<T>('POST', path, body);
const put = <T>(path: string, body?: unknown) =>
  request<T>('PUT', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

/* ─── Profile ──────────────────────────────────────────────────────── */

export const profileApi = {
  /** Update name and/or bio */
  updateProfile: (data: { name?: string; bio?: string }) =>
    put<import('@/types').User>('/auth/profile', data),

  /** Switch between seeker and provider role */
  switchRole: (role: 'seeker' | 'provider') =>
    put<import('@/types').User>('/auth/role', { role }),

  /** Upload profile picture */
  uploadAvatar: async (image: {
    uri: string;
    base64?: string;
    mimeType?: string;
    fileName?: string;
  }): Promise<import('@/types').User> => {
    const token = await getToken();
    if (!token) throw new ApiError('Not authenticated', 401);

    if (!image.base64) throw new ApiError('Image must be provided as base64', 400);

    const mimeType = image.mimeType || 'image/jpeg';
    const filename = image.fileName || 'avatar.jpg';
    const body = {
      image: `data:${mimeType};base64,${image.base64}`,
      filename,
      mime: mimeType,
    };

    const res = await fetch(`${BASE_URL}/auth/avatar`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Avatar upload failed', res.status);
    return data as import('@/types').User;
  },
};

/* ─── Auth ────────────────────────────────────────────────────────── */

export { BASE_URL, API_ROOT };
export const authApi = {
  /** Step 1: Initiate registration — sends OTP */
  registerInitiate: (data: {
    phone: string;
    password: string;
    name: string;
    email: string;
    role: 'seeker' | 'provider';
  }) =>
    post<{ message: string; phone: string; expiresIn: number }>(
      '/auth/register',
      data
    ),

  /** Step 2: Verify OTP and create account — does NOT auto-login */
  registerVerify: (data: {
    phone: string;
    password: string;
    name: string;
    email: string;
    role: 'seeker' | 'provider';
    code: string;
  }) =>
    post<{ message: string; user: import('@/types').User }>(
      '/auth/register/verify',
      data
    ),

  /** Resend OTP for pending registration */
  registerResend: (data: { email: string }) =>
    post<{ message: string; email: string; expiresIn: number }>(
      '/auth/register/resend',
      data
    ),

  login: (data: { email: string; password: string }) =>
    post<{ token: string; user: import('@/types').User }>('/auth/login', data),

  me: () => get<import('@/types').User>('/auth/me'),

  logout: () => post('/auth/logout'),

  logoutAll: () => post('/auth/logout-all'),

  /** Step 1 of forgot password: send OTP */
  forgotPasswordSend: (data: { email: string }) =>
    post<{ message: string; identifier: string; expiresIn: number }>(
      '/auth/forgot-password',
      data
    ),

  /** Step 2 of forgot password: verify OTP only */
  forgotPasswordVerify: (data: { email: string; code: string }) =>
    post<{ message: string }>('/auth/forgot-password/verify', data),

  /** Step 3 of forgot password: reset with OTP */
  forgotPasswordReset: (data: {
    email: string;
    code: string;
    newPassword: string;
  }) => post<{ message: string }>('/auth/forgot-password/reset', data),
};

/* ─── Jobs ────────────────────────────────────────────────────────── */

export const jobsApi = {
  list: (params?: {
    category?: string;
    area?: string;
    status?: string;
    budgetMin?: number;
    budgetMax?: number;
    sortBy?: string;
    page?: number;
  }) => {
    // Map camelCase → server snake_case
    const serverParams: Record<string, string> = {};
    if (params?.category)   serverParams.category    = params.category;
    if (params?.area)       serverParams.location   = params.area;
    if (params?.status)     serverParams.status     = params.status;
    if (params?.budgetMin)  serverParams.budget_min  = String(params.budgetMin);
    if (params?.budgetMax)  serverParams.budget_max  = String(params.budgetMax);
    if (params?.sortBy)     serverParams.sort_by      = params.sortBy;
    if (params?.page)       serverParams.page         = String(params.page);
    const qs = new URLSearchParams(serverParams).toString();
    return get<{ jobs: import('@/types').Job[]; total: number }>(
      `/jobs${qs ? `?${qs}` : ''}`
    );
  },

  get: (id: string) => get<import('@/types').Job>(`/jobs/${id}`),

  create: (data: Partial<import('@/types').Job>) =>
    post<import('@/types').Job>('/jobs', data),

  update: (id: string, data: Partial<import('@/types').Job>) =>
    request<import('@/types').Job>('PATCH', `/jobs/${id}`, data),

  updateStatus: (id: string, status: string) =>
    put(`/jobs/${id}/status`, { status }),

  /** Get ongoing/active jobs for the current user (assigned + in_progress + completed) */
  ongoing: () => get<{ jobs: import('@/types').Job[] }>('/jobs/ongoing/list'),

  /** Provider marks job as in_progress */
  start: (id: string) => post<{ message: string; status: string }>(`/jobs/${id}/start`),

  /** Seeker marks job as completed */
  complete: (id: string) => post<{ message: string; status: string }>(`/jobs/${id}/complete`),

  /** Save or unsave a job (toggles) */
  toggleSave: (jobId: string) =>
    post<{ saved: boolean; message: string }>(`/jobs/${jobId}/save`),

  /** List saved jobs for current provider */
  savedList: () => get<{ jobs: import('@/types').Job[] }>('/jobs/saved/list'),

  /** List all jobs posted by current seeker (any status) */
  postedList: () => get<{ jobs: import('@/types').Job[] }>('/jobs/posted/list'),

  /** Check if a job is saved */
  isSaved: (jobId: string) =>
    get<{ saved: boolean }>(`/jobs/${jobId}/saved`),
};

/* ─── Reviews ──────────────────────────────────────────────────────── */

export const reviewsApi = {
  submit: (data: { jobId: string; revieweeId: string; rating: number; comment?: string }) =>
    post<import('@/types').Review>('/reviews', data),

  forUser: (userId: string) =>
    get<{ reviews: import('@/types').Review[]; rating: number | null; reviewCount: number }>(
      `/reviews/user/${userId}`
    ),

  forJob: (jobId: string) =>
    get<{ reviews: import('@/types').Review[] }>(`/reviews/job/${jobId}`),
};

/* ─── Offers ──────────────────────────────────────────────────────── */

export const offersApi = {
  submit: (data: {
    jobId: string;
    price: number;
    message?: string;
    estimatedArrival?: string;
  }) => post<import('@/types').Offer>('/offers', data),

  listForJob: (jobId: string) =>
    get<{ offers: import('@/types').Offer[] }>(`/offers/job/${jobId}`),

  listMine: () => get<{ offers: import('@/types').Offer[] }>('/offers/mine'),

  listReceived: () => get<{ offers: import('@/types').Offer[] }>('/offers/received'),

  get: (id: string) => get<import('@/types').Offer>(`/offers/${id}`),

  accept: (id: string) => post<import('@/types').Offer>(`/offers/${id}/accept`),

  reject: (id: string) => post(`/offers/${id}/reject`),

  withdraw: (id: string) => post(`/offers/${id}/withdraw`),

  counter: (id: string, data: { price: number; message?: string }) =>
    post<import('@/types').Offer>(`/offers/${id}/counter`, data),
};

/* ─── Conversations ────────────────────────────────────────────────── */

export const chatApi = {
  list: () =>
    get<{ data: import('@/types').Conversation[] }>(`/conversations`),

  get: (id: string) =>
    get<{ data: import('@/types').Conversation }>(`/conversations/${id}`),

  /** Get conversation for a specific job */
  getByJob: (jobId: string) =>
    get<{ data: import('@/types').Conversation | null }>(`/conversations?jobId=${jobId}`),

  messages: (id: string) =>
    get<{ data: import('@/types').Message[] }>(`/conversations/${id}/messages`),

  send: (id: string, text: string) =>
    post<{ data: import('@/types').Message }>(`/conversations/${id}/messages`, { text }),
};

/* ─── Notifications ────────────────────────────────────────────────── */

export const notifApi = {
  list: () =>
    get<{ notifications: import('@/types').Notification[]; unreadCount: number }>(
      '/notifications'
    ),

  markRead: (id: string) =>
    put<import('@/types').Notification>(`/notifications/${id}`, { read: true }),

  markAllRead: () => put('/notifications/read-all'),
};

/* ─── Push / FCM ────────────────────────────────────────────────────── */

export const pushApi = {
  /** Register the device FCM token with the backend */
  register: (token: string) =>
    post<{ message: string; fcmEnabled: boolean }>('/push/register', { token }),

  /** Unregister FCM token on logout */
  unregister: (token?: string) =>
    del<{ message: string }>('/push/unregister'),

  /** Check if FCM is configured on the server */
  status: () =>
    get<{ fcmEnabled: boolean }>('/push/status'),
};

/* ─── Verification ─────────────────────────────────────────────────── */

interface UploadResult {
  url: string;
  filename: string;
  size: number;
}

interface ImagePickerResult {
  uri: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
}

export const verificationApi = {
  /** Upload a single image and return the stored URL */
  uploadDocument: async (image: ImagePickerResult): Promise<UploadResult> => {
    const token = await getToken();
    if (!token) throw new ApiError('Not authenticated', 401);

    if (!image.base64) {
      throw new ApiError('Image must be provided as base64', 400);
    }

    const mimeType = image.mimeType || 'image/jpeg';
    const filename = image.fileName || 'image.jpg';
    const body = {
      image: `data:${mimeType};base64,${image.base64}`,
      filename,
      mime: mimeType,
    };

    const res = await fetch(`${BASE_URL}/verification/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Upload failed', res.status);
    return data as UploadResult;
  },

  /** Submit a verification request */
  submit: (data: {
    level: number;
    documentType: string;
    documents: string[];
    notes?: string;
  }) =>
    post<import('@/types').VerificationRequest>('/verification/submit', data),

  /** Get current verification status */
  getStatus: () =>
    get<import('@/types').VerificationStatusResponse>('/verification/status'),
};
