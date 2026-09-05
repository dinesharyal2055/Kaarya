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
import { KaaryaColors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';

type Step = 'phone' | 'otp' | 'password' | 'done';

export default function ForgotPasswordScreen() {
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
      setError('Please enter a valid phone number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordSend({ phone: phone.trim() });
      setStep('otp');
    } catch (e: any) {
      setError(e.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: verify OTP ─────────────────────────────────────────
  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordVerify({ phone: phone.trim(), code: otp.trim() });
      setStep('password');
    } catch (e: any) {
      setError('Invalid or expired OTP. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 3: set new password ────────────────────────────────────
  async function handleResetPassword() {
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPasswordReset({ phone: phone.trim(), code: otp.trim(), newPassword });
      setStep('done');
    } catch (e: any) {
      setError(e.message ?? 'Failed to reset password');
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
          title: 'Forgot Password',
          headerStyle: { backgroundColor: '#FF6B35' },
          headerTintColor: '#fff',
          headerBackTitle: 'Back',
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
                <Text style={styles.title}>Reset Your Password</Text>
                <Text style={styles.subtitle}>
                  Enter your registered phone number and we'll send you an OTP.
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label="Phone Number"
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
                    title="Send OTP"
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
                <Text style={styles.title}>Enter OTP</Text>
                <Text style={styles.subtitle}>
                  6-digit code sent to{'\n'}
                  <Text style={styles.phoneHighlight}>{maskPhoneNum(phone)}</Text>
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label="6-digit code"
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
                    title="Verify OTP"
                    onPress={handleVerifyOtp}
                    loading={loading}
                    disabled={otp.length !== 6}
                    fullWidth
                  />
                </View>

                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>Didn't receive it? </Text>
                  <Text style={styles.resendLink} onPress={handleSendOtp}>Resend</Text>
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
                <Text style={styles.title}>Set New Password</Text>
                <Text style={styles.subtitle}>OTP verified! Now set your new password.</Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Input
                    label="New Password"
                    placeholder="At least 6 characters"
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
                    label="Confirm New Password"
                    placeholder="Re-enter new password"
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
                    title="Reset Password"
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
                <Text style={styles.title}>Password Reset!</Text>
                <Text style={styles.subtitle}>
                  Your password has been changed successfully.{'\n\n'}
                  Sign in with your new password.
                </Text>

                <View style={{ marginTop: Spacing.xl }}>
                  <Button
                    title="Go to Sign In"
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
