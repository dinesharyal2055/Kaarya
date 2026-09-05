import { useRouter, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import type { ApiError } from '@/lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Navigate to tabs after successful login
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  async function handleLogin() {
    if (!phone.trim() || !password.trim()) { setError('Please fill in all fields'); return; }
    setError(''); setLoading(true);
    try { await login(phone.trim(), password); }
    catch (e: any) {
      const apiErr = e as ApiError;
      if (apiErr.code === 'UNVERIFIED') {
        setError('Please verify your account first. Check your phone for the OTP.');
      } else if (apiErr.status === 401) {
        setError('Incorrect phone number or password.');
      } else {
        setError(e.message ?? 'Login failed. Please try again.');
      }
    }
    finally { setLoading(false); }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.logoCircle}>
                <MaterialCommunityIcons name="wrench" size={48} color={KaaryaColors.brand[500]} />
              </View>
              <Text style={styles.appName}>Kaarya</Text>
              <Text style={styles.tagline}>Find help. Get it done.</Text>
            </View>
            <View style={styles.form}>
              <Text style={styles.welcome}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
              <View style={{ marginTop: Spacing.xl }}>
                <Input label="Phone Number" placeholder="98XXXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false} leftIcon={<MaterialCommunityIcons name="phone" size={20} color={KaaryaColors.muted} />} />
                <Input label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} leftIcon={<MaterialCommunityIcons name="lock" size={20} color={KaaryaColors.muted} />} rightIcon={<MaterialCommunityIcons name={showPassword ? 'eye-off' : 'eye'} size={20} color={KaaryaColors.muted} onPress={() => setShowPassword((v) => !v)} />} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={{ marginTop: Spacing.md }}><Button title="Sign In" onPress={handleLogin} loading={loading} fullWidth /></View>
              <View style={{ alignItems: 'flex-end', marginTop: Spacing.sm }}>
                <Text style={styles.forgotLink} onPress={() => router.push('/(auth)/forgot-password')}>Forgot Password?</Text>
              </View>
              </View>
            </View>
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don&apos;t have an account? <Text style={styles.footerLink} onPress={() => router.push('/(auth)/register')}>Sign Up</Text></Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg },
  header: { alignItems: 'center', paddingTop: Spacing['2xl'], paddingBottom: Spacing.xl },
  logoCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: KaaryaColors.brand[50], alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: KaaryaColors.brand[200] },
  appName: { fontSize: 32, fontWeight: '800', color: KaaryaColors.brand[500], marginTop: Spacing.md },
  tagline: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4 },
  form: { flex: 1, paddingTop: Spacing.lg },
  welcome: { fontSize: FontSizes['2xl'], fontWeight: '700', color: KaaryaColors.text },
  subtitle: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary, marginTop: 4 },
  error: { color: KaaryaColors.danger, fontSize: FontSizes.sm, marginTop: 8, textAlign: 'center' },
  footer: { alignItems: 'center', paddingVertical: Spacing.xl },
  forgotLink: { fontSize: FontSizes.sm, color: KaaryaColors.brand[500], fontWeight: '500' },
  footerText: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary },
  footerLink: { color: KaaryaColors.brand[500], fontWeight: '600' },
});
