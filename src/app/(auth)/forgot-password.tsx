import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';

type Step = 'email' | 'otp' | 'password' | 'done';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Step 1: send OTP ────────────────────────────────────────────
  async function handleSendOtp() {
    if (!email.trim() || !email.includes('@')) {
      setError(t('auth.forgotPassword.invalidEmail'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordSend({ email: email.trim() });
      setStep('otp');
    } catch (e: any) {
      setError(e.message ?? t('auth.forgotPassword.sendOtpFailed'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: verify OTP ─────────────────────────────────────────
  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setError(t('auth.forgotPassword.enter6Digit'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordVerify({ email: email.trim(), code: otp.trim() });
      setStep('password');
    } catch (e: any) {
      setError(t('auth.forgotPassword.invalidOtp'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 3: set new password ────────────────────────────────────
  async function handleResetPassword() {
    if (newPassword.length < 8) {
      setError(t('auth.forgotPassword.passwordMinChars'));
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError(t('auth.forgotPassword.passwordNeedsNumber'));
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      setError(t('auth.forgotPassword.passwordNeedsSpecial'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.forgotPassword.passwordsMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordReset({ email: email.trim(), code: otp.trim(), newPassword });
      setStep('done');
    } catch (e: any) {
      setError(e.message ?? t('auth.forgotPassword.resetFailed'));
    } finally {
      setLoading(false);
    }
  }

  function maskEmail(e: string) {
    if (!e || !e.includes('@')) return e;
    const [local, domain] = e.split('@');
    if (local.length <= 2) return `${local[0] || ''}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('auth.forgotPassword.title'),
          headerStyle: { backgroundColor: '#FF6B35' },
          headerTintColor: '#fff',
          headerBackTitle: t('common.back'),
        }}
      />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── Step 1: Email ───────────────────────────────────── */}
            {step === 'email' && (
              <>
                <View style={styles.iconRow}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="lock-reset" size={40} color={KaaryaColors.brand[500]} />
                  </View>
                </View>
                <Text style={styles.title}>{t('auth.forgotPassword.resetTitle')}</Text>
                <Text style={styles.subtitle}>
                  {t('auth.forgotPassword.resetSubtitle')}
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label={t('auth.forgotPassword.emailAddress')}
                    placeholder={t('auth.forgotPassword.emailPlaceholder')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="email" size={20} color={KaaryaColors.muted} />}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title={t('auth.forgotPassword.sendOtp')}
                    onPress={handleSendOtp}
                    loading={loading}
                    disabled={!email.trim()}
                    fullWidth
                  />
                </View>
              </>
            )}

            {/* ── Step 2: OTP ────────────────────────────────────── */}
            {step === 'otp' && (
              <>
                <View style={styles.iconRow}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="shield-check" size={40} color={KaaryaColors.brand[500]} />
                  </View>
                </View>
                <Text style={styles.title}>{t('auth.forgotPassword.enterOtp')}</Text>
                <Text style={styles.subtitle}>
                  {t('auth.forgotPassword.otpSentTo')}{'\n'}
                  <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label={t('auth.forgotPassword.otpCode')}
                    placeholder="● ● ● ● ● ●"
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    style={{ textAlign: 'center', fontSize: FontSizes.xl, letterSpacing: 8 }}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title={t('auth.forgotPassword.verifyOtp')}
                    onPress={handleVerifyOtp}
                    loading={loading}
                    disabled={otp.length !== 6}
                    fullWidth
                  />
                </View>

                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>{t('auth.forgotPassword.noReceive')} </Text>
                  <Text style={styles.resendLink} onPress={handleSendOtp}>{t('auth.forgotPassword.resend')}</Text>
                </View>
              </>
            )}

            {/* ── Step 3: New Password ────────────────────────────── */}
            {step === 'password' && (
              <>
                <View style={styles.iconRow}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="check-circle" size={40} color={KaaryaColors.success} />
                  </View>
                </View>
                <Text style={styles.title}>{t('auth.forgotPassword.setNewPassword')}</Text>
                <Text style={styles.subtitle}>{t('auth.forgotPassword.otpVerified')}</Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label={t('auth.forgotPassword.newPassword')}
                    placeholder={t('auth.forgotPassword.passwordMinChars')}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="lock" size={20} color={KaaryaColors.muted} />}
                    rightIcon={
                      <MaterialCommunityIcons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={KaaryaColors.muted}
                        onPress={() => setShowPassword((v) => !v)}
                      />
                    }
                  />
                  <Text style={styles.passwordHint}>{t('auth.forgotPassword.passwordRequirements')}</Text>
                  <Input
                    label={t('auth.forgotPassword.confirmPassword')}
                    placeholder={t('auth.forgotPassword.reEnterPassword')}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="lock-check" size={20} color={KaaryaColors.muted} />}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title={t('auth.forgotPassword.resetPassword')}
                    onPress={handleResetPassword}
                    loading={loading}
                    disabled={!newPassword || !confirmPassword}
                    fullWidth
                  />
                </View>
              </>
            )}

            {/* ── Done ────────────────────────────────────────────── */}
            {step === 'done' && (
              <>
                <View style={styles.iconRow}>
                  <View style={[styles.iconCircle, { borderColor: KaaryaColors.success }]}>
                    <MaterialCommunityIcons name="check-circle" size={40} color={KaaryaColors.success} />
                  </View>
                </View>
                <Text style={styles.title}>{t('auth.forgotPassword.passwordReset')}</Text>
                <Text style={styles.subtitle}>
                  {t('auth.forgotPassword.passwordChanged')}{'\n\n'}
                  {t('auth.forgotPassword.signInWithNew')}
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title={t('auth.forgotPassword.goToSignIn')}
                    onPress={() => router.replace('/(auth)/login')}
                    fullWidth
                  />
                </View>
              </>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl },
  iconRow: { alignItems: 'center', marginBottom: Spacing.lg },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: KaaryaColors.brand[50],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: KaaryaColors.brand[200],
  },
  title: { fontSize: FontSizes['2xl'], fontWeight: '700', color: KaaryaColors.text, textAlign: 'center' },
  subtitle: { fontSize: FontSizes.base, color: KaaryaColors.muted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  emailHighlight: { color: KaaryaColors.brand[500], fontWeight: '600' },
  error: { color: KaaryaColors.danger, fontSize: FontSizes.sm, marginTop: Spacing.sm, textAlign: 'center' },
  passwordHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4, marginBottom: Spacing.md },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.md },
  resendText: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
  resendLink: { fontSize: FontSizes.sm, color: KaaryaColors.brand[500], fontWeight: '600' },
});
