/**
 * Notification Service — handles FCM push token registration,
 * foreground notification display, and notification tap navigation.
 *
 * Flow:
 * 1. Call `setupNotifications()` after user logs in
 * 2. Permission is requested; if granted, FCM token is fetched and sent to server
 * 3. `setNotificationHandlers()` registers handlers for foreground + tap events
 * 4. On logout, call `unregisterPushToken()` to clean up
 */

import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import { Platform, Alert } from 'react-native';
import { pushApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────

export interface NotificationData {
  type: string;
  jobId?: string;
  offerId?: string;
  conversationId?: string;
  reviewId?: string;
  [key: string]: string | undefined;
}

// ─── Configure how notifications behave ───────────────────────────────

/**
 * Notifications should be displayed as an alert + banner + sound.
 * When the app is in the foreground, we handle them via our own handler.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Storage key for persisted FCM token ─────────────────────────────

const FCM_TOKEN_KEY = 'kaarya_fcm_token';

// ─── Setup ────────────────────────────────────────────────────────────

/**
 * Call this once after the user logs in.
 * 1. Requests notification permission
 * 2. Gets the Expo push token
 * 3. Registers it with the backend
 *
 * Safe to call multiple times — registers token on every call so it stays fresh.
 */
export async function setupNotifications(): Promise<boolean> {
  try {
    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[notifications] Permission not granted — push notifications disabled');
      return false;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: _getProjectId(),
    });
    const token = tokenData.data;

    // Persist locally so we can unregister on logout
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);

    // Register with backend
    await pushApi.register(token);
    console.log('[notifications] FCM token registered with backend');

    return true;
  } catch (err) {
    console.error('[notifications] Setup failed:', err);
    return false;
  }
}

/**
 * Unregister the FCM token on logout.
 * Prevents notifications going to a logged-out device.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (token) {
      await pushApi.unregister(token);
      await AsyncStorage.removeItem(FCM_TOKEN_KEY);
      console.log('[notifications] FCM token unregistered');
    }
  } catch (err) {
    console.error('[notifications] Unregister failed:', err);
  }
}

/**
 * Re-register token (e.g., on app foreground — token may have refreshed).
 * Call in AppState change handler or on app focus.
 */
export async function refreshToken(): Promise<void> {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: _getProjectId(),
    });
    const token = tokenData.data;
    const stored = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (token && token !== stored) {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
      await pushApi.register(token);
      console.log('[notifications] FCM token refreshed');
    }
  } catch (err) {
    console.error('[notifications] Token refresh failed:', err);
  }
}

// ─── Notification Handlers ──────────────────────────────────────────────

/**
 * Set up handlers for foreground notifications and notification taps.
 * Call this once at app startup (e.g., in the root layout).
 */
export function setupNotificationHandlers(): void {
  // Foreground: called when a notification is received while app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as NotificationData;
      console.log('[notifications] Foreground notification received:', data);

      // Return the default behavior (alert + sound)
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });

  // Notification tap (background or quit): called when user taps the notification
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as NotificationData;
    console.log('[notifications] Notification tapped:', data);
    handleNotificationTap(data);
  });
}

// ─── Handle notification tap navigation ────────────────────────────────

/**
 * Navigate to the appropriate screen based on notification data payload.
 * Import and use the router from expo-router.
 *
 * @param data — the `data` object from the notification payload
 */
export function handleNotificationTap(data: NotificationData): void {
  const router = _getRouter();
  if (!router) return;

  switch (data.type) {
    case 'new_offer':
    case 'offer_accepted':
    case 'offer_rejected':
      if (data.jobId) {
        router.push(`/job/${data.jobId}`);
      }
      break;

    case 'job_started':
    case 'job_completed':
      if (data.jobId) {
        router.push(`/job/${data.jobId}`);
      }
      break;

    case 'new_message':
      if (data.conversationId) {
        router.push(`/chat/${data.conversationId}`);
      }
      break;

    case 'review_received':
      if (data.jobId) {
        router.push(`/job/${data.jobId}`);
      }
      break;

    default:
      // Default: navigate to notifications screen
      router.push('/notifications');
      break;
  }
}

// ─── Badge management ─────────────────────────────────────────────────

/**
 * Clear the app badge (iOS/dAndroid).
 * Call this after user views their notifications.
 */
export async function clearBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Platform may not support badges
  }
}

/**
 * Increment the badge count by 1.
 * Call this when a new notification arrives.
 */
export async function incrementBadge(): Promise<void> {
  try {
    const current = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync(current + 1);
  } catch {
    // Platform may not support badges
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

/** Get the Expo project ID for push token generation */
function _getProjectId(): string | undefined {
  if (Platform.OS === 'android') {
    return Application.getAndroidId();
  }
  // iOS uses the Expo project ID from app.json
  return undefined;
}

/** Lazy-import router to avoid circular dependency */
let _routerInstance: ReturnType<typeof useRouter> | null = null;
export function _setRouter(router: ReturnType<typeof useRouter>): void {
  _routerInstance = router;
}
function _getRouter(): ReturnType<typeof useRouter> | null {
  return _routerInstance;
}
