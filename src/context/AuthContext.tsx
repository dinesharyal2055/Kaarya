/**
 * AuthContext — global authentication state for Kaarya
 * Handles login, logout, registration, and protected route guards
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, UserRole } from '@/types';
import { authApi, profileApi } from '@/lib/api';
import { saveToken, getToken, removeToken } from '@/lib/storage';
import {
  setupNotifications,
  unregisterPushToken,
  setupNotificationHandlers,
  _setRouter,
} from '@/services/notifications';
import { useRouter } from 'expo-router';

SplashScreen.preventAutoHideAsync();

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    phone: string;
    password: string;
    name: string;
    email: string;
    role: 'seeker' | 'provider';
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  updateProfile: (data: { name?: string; bio?: string }) => Promise<void>;
  uploadAvatar: (image: { uri: string; base64?: string; mimeType?: string; fileName?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  /** Restore session on app launch */
  useEffect(() => {
    async function restore() {
      try {
        const token = await getToken();
        if (!token) {
          setState((s) => ({ ...s, isLoading: false }));
          await SplashScreen.hideAsync();
          return;
        }
        const user = await authApi.me();
        setState({ user, token, isLoading: false, isAuthenticated: true });
        // Set up notification handlers and register token
        setupNotificationHandlers();
        _setRouter(router);
        setupNotifications().catch(() => {});
      } catch {
        // token invalid — clear it
        await removeToken();
        setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await authApi.login({ email, password });
    await saveToken(token);
    setState({ user, token, isLoading: false, isAuthenticated: true });
    // Register FCM push token after successful login
    setupNotifications().catch(() => {});
  }, []);

  const register = useCallback(
    async (data: { phone: string; password: string; name: string; email: string; role: 'seeker' | 'provider' }) => {
      // Step 1: initiate — sends OTP (handled by the screen; Context just throws)
      throw new Error('OTP flow is handled by the RegisterScreen — do not call directly');
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore network errors on logout
    }
    // Unregister FCM push token so device stops receiving notifications
    await unregisterPushToken();
    await removeToken();
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await authApi.me();
    setState((s) => ({ ...s, user }));
  }, []);

  const switchRole = useCallback(async (role: UserRole) => {
    const user = await profileApi.switchRole(role);
    setState((s) => ({ ...s, user }));
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; bio?: string }) => {
    const user = await profileApi.updateProfile(data);
    setState((s) => ({ ...s, user }));
  }, []);

  const uploadAvatar = useCallback(async (image: { uri: string; base64?: string; mimeType?: string; fileName?: string }) => {
    const user = await profileApi.uploadAvatar(image);
    setState((s) => ({ ...s, user }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
      refreshUser,
      switchRole,
      updateProfile,
      uploadAvatar,
    }),
    [state, login, register, logout, refreshUser, switchRole, updateProfile, uploadAvatar]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
