/**
 * Root layout — wraps the entire app with providers
 * Sets up AuthProvider, LanguageProvider, fonts, and splash screen
 */

import 'nativewind';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#FAFAFA' },
                animation: 'slide_from_right',
              }}
            >
              {/* Auth stack — login/register */}
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />

              {/* Main app — tabs */}
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

              {/* Job detail, chat, profile — pushed on top of tabs */}
              <Stack.Screen name="job/[id]" options={{ headerShown: false, presentation: 'card' }} />
              <Stack.Screen name="post-job" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="chat/[id]" options={{ headerShown: false, presentation: 'card' }} />
              <Stack.Screen name="make-offer" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="offers" options={{ headerShown: false, presentation: 'card' }} />
              <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'card' }} />
              <Stack.Screen
                name="verification"
                options={{
                  headerShown: true,
                  title: 'Verify Your Account',
                  presentation: 'card',
                  headerStyle: { backgroundColor: '#FF6B35' },
                  headerTintColor: '#fff',
                }}
              />
              <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="payment-methods" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="notification-settings" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="review" options={{ headerShown: false, presentation: 'modal' }} />
            </Stack>
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
