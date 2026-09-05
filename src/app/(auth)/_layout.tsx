/**
 * Auth layout — Stack navigator for login, register, role-select screens
 * Redirects already-authenticated users to home
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Redirect } from 'expo-router';
import { KaaryaColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: KaaryaColors.background },
          animation: 'fade',
        }}
      />
    </>
  );
}
