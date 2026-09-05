/**
 * Async storage service — thin wrapper over @react-native-async-storage/async-storage
 * Handles JSON serialization/deserialization and provides typed get/set methods
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  AUTH_TOKEN: 'kaarya_token',
  USER: 'kaarya_user',
  ONBOARDING_COMPLETE: 'kaarya_onboarding',
} as const;

/* ─── Auth ─────────────────────────────────────────────────────────── */

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.AUTH_TOKEN);
}

export async function removeToken(): Promise<void> {
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

/* ─── Clear all ────────────────────────────────────────────────────── */

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
