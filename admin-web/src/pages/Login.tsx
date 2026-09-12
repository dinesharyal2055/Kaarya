import React, { useState } from 'react';
import axios from 'axios';
import api from '../services/api';

// Use a bare axios instance for login so a failed authentication (401/403) does not
// trigger the shared client's global redirect-to-login interceptor and reload the page.
const loginClient = axios.create({ baseURL: api.defaults.baseURL });

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await loginClient.post('/api/admin/login', { email, password });
      const { token, user } = response.data;
      localStorage.setItem('kaarya_admin_token', token);
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      const status = (err as any)?.response?.status;
      setError(status === 401 ? 'Incorrect email or password' : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="neu-login-wrap">
      <div className="neu-login-card">
        <div className="neu-login-brand">
          <span className="neu-brand-mark" aria-hidden="true">K</span>
          <h2 className="neu-login-title">Kaarya Admin</h2>
          <p className="neu-login-sub">Sign in to continue</p>
        </div>
        <div className="neu-card">
          <form onSubmit={handleSubmit} className="neu-login-form">
            <div>
              <label htmlFor="email" className="neu-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="neu-input"
              />
            </div>
            <div>
              <label htmlFor="password" className="neu-label">
                Password
              </label>
              <div className="neu-password-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="neu-input"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="neu-password-toggle"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p className="neu-error neu-login-error" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="neu-btn neu-btn-primary neu-btn-block"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <div className="neu-login-foot">
          &copy; {new Date().getFullYear()} Kaarya. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default Login;
