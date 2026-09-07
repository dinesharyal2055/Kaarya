import { useRouter, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import type { ApiError } from '@/lib/api';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
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
    if (!email.trim() || !password.trim()) {
      setError(t('auth.login.errors.fillAllFields'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      const apiErr = e as ApiError;
      if (apiErr.status === 401) {
        setError(t('auth.login.errors.incorrectCredentials'));
      } else {
        setError(e.message ?? t('auth.login.errors.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
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
              <Text style={styles.appName}>{t('app.name')}</Text>
              <Text style={styles.tagline}>{t('app.tagline')}</Text>
            </View>
            <View style={styles.form}>
              <Text style={styles.welcome}>{t('auth.login.welcomeBack')}</Text>
              <Text style={styles.subtitle}>{t('auth.login.signInContinue')}</Text>
              <View style={{ marginTop: Spacing.xl }}>
                <Input
                  label={t('auth.login.email')}
                  placeholder={t('auth.login.emailPlaceholder')}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ letterSpacing: 0 }}
                  leftIcon={<MaterialCommunityIcons name="email" size={20} color={KaaryaColors.muted} />}
                />
                <Input
                  label={t('auth.login.password')}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  leftIcon={<MaterialCommunityIcons name="lock" size={20} color={KaaryaColors.muted} />}
                  rightIcon={<MaterialCommunityIcons name={showPassword ? 'eye-off' : 'eye'} size={20} color={KaaryaColors.muted} onPress={() => setShowPassword((v) => !v)} />}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={{ marginTop: Spacing.md }}>
                  <Button title={t('auth.login.signIn')} onPress={handleLogin} loading={loading} fullWidth />
                </View>
                <View style={{ alignItems: 'flex-end', marginTop: Spacing.sm }}>
                  <Text
                    style={styles.forgotLink}
                    onPress={() =>
                      router.push({
                        pathname: '/(auth)/forgot-password',
                        params: { email: email.trim() },
                      })
                    }
                  >
                    {t('auth.login.forgotPassword')}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {t('auth.login.noAccount')}{' '}
                <Text style={styles.footerLink} onPress={() => router.push('/(auth)/register')}>
                  {t('auth.login.signUp')}
                </Text>
              </Text>
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
