/**
 * Storage service — typed wrapper over AsyncStorage and SecureStore.
 *
 * JWT token is stored in SecureStore (encrypted, not world-readable).
 * All other data (user profile, preferences) uses AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  AUTH_TOKEN: 'kaarya_token',
  USER: 'kaarya_user',
  ONBOARDING_COMPLETE: 'kaarya_onboarding',
  LANGUAGE: 'kaarya_language',
} as const;

/* ─── Auth (SecureStore) ────────────────────────────────────────────── */

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.AUTH_TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.AUTH_TOKEN);
  } catch {
    // Fallback to AsyncStorage if SecureStore fails (e.g. on web)
    return AsyncStorage.getItem(KEYS.AUTH_TOKEN);
  }
}

export async function removeToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN);
  } catch {
    // ignore
  }
  // Also clear AsyncStorage fallback (for safety on upgrade)
  await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
}

/* ─── User ─────────────────────────────────────────────────────────── */

export async function saveUser(user: object): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
}

export async function getUser<T = object>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function removeUser(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.USER);
}

/* ─── Onboarding ───────────────────────────────────────────────────── */

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
}

export async function isOnboardingComplete(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return val === 'true';
}

/* ─── Language ──────────────────────────────────────────────────────── */

export async function saveLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LANGUAGE, lang);
}

export async function getLanguage(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.LANGUAGE)) ?? 'en';
}

/* ─── Clear all ────────────────────────────────────────────────────── */

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
