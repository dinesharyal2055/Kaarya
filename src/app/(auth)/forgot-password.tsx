import { useState } from 'react';
import { useRouter } from 'expo-router';
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

type Step = 'phone' | 'otp' | 'password' | 'done';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Step 1: send OTP ────────────────────────────────────────────
  async function handleSendOtp() {
    if (!phone.trim() || phone.length < 8) {
      setError(t('forgotPassword.invalidPhone'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordSend({ phone: phone.trim() });
      setStep('otp');
    } catch (e: any) {
      setError(e.message ?? t('forgotPassword.sendOtpFailed'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: verify OTP ─────────────────────────────────────────
  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setError(t('forgotPassword.enter6Digit'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordVerify({ phone: phone.trim(), code: otp.trim() });
      setStep('password');
    } catch (e: any) {
      setError(t('forgotPassword.invalidOtp'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 3: set new password ────────────────────────────────────
  async function handleResetPassword() {
    if (newPassword.length < 6) {
      setError(t('forgotPassword.passwordMinChars'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('forgotPassword.passwordsMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordReset({ phone: phone.trim(), code: otp.trim(), newPassword });
      setStep('done');
    } catch (e: any) {
      setError(e.message ?? t('forgotPassword.resetFailed'));
    } finally {
      setLoading(false);
    }
  }

  function maskPhoneNum(p: string) {
    if (!p || p.length < 4) return p;
    return p.slice(0, 3) + '****' + p.slice(-3);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('forgotPassword.title'),
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

            {/* ── Step 1: Phone ───────────────────────────────────── */}
            {step === 'phone' && (
              <>
                <View style={styles.iconRow}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="lock-reset" size={40} color={KaaryaColors.brand[500]} />
                  </View>
                </View>
                <Text style={styles.title}>{t('forgotPassword.resetTitle')}</Text>
                <Text style={styles.subtitle}>
                  {t('forgotPassword.resetSubtitle')}
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label={t('forgotPassword.phoneNumber')}
                    placeholder="98XXXXXXXX"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="phone" size={20} color={KaaryaColors.muted} />}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title={t('forgotPassword.sendOtp')}
                    onPress={handleSendOtp}
                    loading={loading}
                    disabled={!phone.trim()}
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
                <Text style={styles.title}>{t('forgotPassword.enterOtp')}</Text>
                <Text style={styles.subtitle}>
                  {t('forgotPassword.otpSentTo')}{'\n'}
                  <Text style={styles.phoneHighlight}>{maskPhoneNum(phone)}</Text>
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label={t('forgotPassword.otpCode')}
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
                    title={t('forgotPassword.verifyOtp')}
                    onPress={handleVerifyOtp}
                    loading={loading}
                    disabled={otp.length !== 6}
                    fullWidth
                  />
                </View>

                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>{t('forgotPassword.noReceive')} </Text>
                  <Text style={styles.resendLink} onPress={handleSendOtp}>{t('forgotPassword.resend')}</Text>
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
                <Text style={styles.title}>{t('forgotPassword.setNewPassword')}</Text>
                <Text style={styles.subtitle}>{t('forgotPassword.otpVerified')}</Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label={t('forgotPassword.newPassword')}
                    placeholder={t('forgotPassword.passwordMinChars')}
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
                  <Input
                    label={t('forgotPassword.confirmPassword')}
                    placeholder={t('forgotPassword.reEnterPassword')}
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
                    title={t('forgotPassword.resetPassword')}
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
                <Text style={styles.title}>{t('forgotPassword.passwordReset')}</Text>
                <Text style={styles.subtitle}>
                  {t('forgotPassword.passwordChanged')}{'\n\n'}
                  {t('forgotPassword.signInWithNew')}
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title={t('forgotPassword.goToSignIn')}
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
  phoneHighlight: { color: KaaryaColors.brand[500], fontWeight: '600' },
  error: { color: KaaryaColors.danger, fontSize: FontSizes.sm, marginTop: Spacing.sm, textAlign: 'center' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.md },
  resendText: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
  resendLink: { fontSize: FontSizes.sm, color: KaaryaColors.brand[500], fontWeight: '600' },
});
