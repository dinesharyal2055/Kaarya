import { useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KaaryaColors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';
import type { UserRole } from '@/types';

type Step = 'form' | 'otp';

export default function RegisterScreen() {
  const router = useRouter();

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('seeker');
  const [showPassword, setShowPassword] = useState(false);

  // OTP step
  const [step, setStep] = useState<Step>('form');
  const [otp, setOtp] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ─── Step 1: initiate registration ───────────────────────────────
  async function handleInitiate() {
    setError('');
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address'); return; }
    if (!phone.trim() || phone.length < 8) { setError('Please enter a valid phone number'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      await authApi.registerInitiate({ phone: phone.trim(), password, name: name.trim(), email: email.trim(), role });
      setStep('otp');
    } catch (e: any) {
      setError(e.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: verify OTP and create account ──────────────────────
  async function handleVerify() {
    if (otp.length !== 6) { setError('Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      await authApi.registerVerify({
        phone: phone.trim(),
        password,
        name: name.trim(),
        email: email.trim(),
        role,
        code: otp.trim(),
      });
      // User is NOT auto-logged in — redirect to login
      router.replace('/(auth)/login');
    } catch (e: any) {
      if (e.status === 401) {
        setError('Invalid or expired OTP. Please check the code and try again.');
      } else {
        setError(e.message ?? 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Resend OTP ──────────────────────────────────────────────────
  async function handleResend() {
    setLoading(true);
    setOtp('');
    setError('');
    try {
      await authApi.registerResend({ email: email.trim() });
      // Show success briefly then clear
      setError('New OTP sent! Check your email.');
      setTimeout(() => setError(''), 4000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  }

  // ─── Back to form ────────────────────────────────────────────────
  function handleBack() {
    setStep('form');
    setOtp('');
    setError('');
  }

  const roles: { value: UserRole; label: string; icon: string; desc: string }[] = [
    { value: 'seeker', label: 'I need help', icon: 'account-search', desc: 'Post tasks and hire providers' },
    { value: 'provider', label: 'I provide services', icon: 'account-wrench', desc: 'Bid on tasks and earn money' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: step === 'otp' ? 'Verify Phone' : 'Create Account',
          headerStyle: { backgroundColor: '#FF6B35' },
          headerTintColor: '#fff',
          headerBackTitle: step === 'otp' ? 'Back' : undefined,
          headerBackVisible: step === 'otp',
        }}
      />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── Step 1: Registration form ─────────────────────────── */}
            {step === 'form' && (
              <>
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join Kaarya today</Text>

                <View style={styles.form}>
                  <Input
                    label="Full Name"
                    placeholder="e.g. Ram Prasad"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="account" size={20} color={KaaryaColors.muted} />}
                  />
                  <Input
                    label="Email Address"
                    placeholder="e.g. ram@gmail.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="email" size={20} color={KaaryaColors.muted} />}
                  />
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
                  <Input
                    label="Password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChangeText={setPassword}
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
                    label="Confirm Password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="lock-check" size={20} color={KaaryaColors.muted} />}
                  />

                  <Text style={styles.sectionLabel}>I am a...</Text>
                  <View style={styles.roleRow}>
                    {roles.map((r) => (
                      <Pressable
                        key={r.value}
                        onPress={() => setRole(r.value)}
                        style={[styles.roleCard, role === r.value && styles.roleCardSelected]}
                      >
                        <MaterialCommunityIcons
                          name={r.icon as any}
                          size={28}
                          color={role === r.value ? KaaryaColors.brand[500] : KaaryaColors.muted}
                        />
                        <Text style={[styles.roleLabel, role === r.value && styles.roleLabelSelected]}>
                          {r.label}
                        </Text>
                        <Text style={styles.roleDesc}>{r.desc}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <View style={{ marginTop: Spacing.lg }}>
                    <Button title="Continue" onPress={handleInitiate} loading={loading} fullWidth />
                  </View>
                </View>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    Already have an account?{' '}
                    <Text style={styles.footerLink} onPress={() => router.back()}>
                      Sign In
                    </Text>
                  </Text>
                </View>
              </>
            )}

            {/* ── Step 2: OTP verification ──────────────────────────── */}
            {step === 'otp' && (
              <>
                <View style={styles.otpHeader}>
                  <View style={styles.otpIconCircle}>
                    <MaterialCommunityIcons name="shield-check" size={48} color={KaaryaColors.brand[500]} />
                  </View>
                  <Text style={styles.title}>Verify Your Email</Text>
                  <Text style={styles.subtitle}>
                    We've sent a 6-digit code to{'\n'}
                    <Text style={styles.phoneHighlight}>{email}</Text>
                  </Text>
                </View>

                <View style={styles.form}>
                  <Input
                    label="Enter 6-digit code"
                    placeholder="● ● ● ● ● ●"
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    style={{ textAlign: 'center', fontSize: FontSizes.xl, letterSpacing: 8 }}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <View style={{ marginTop: Spacing.lg }}>
                    <Button
                      title="Verify & Create Account"
                      onPress={handleVerify}
                      loading={loading}
                      disabled={otp.length !== 6}
                      fullWidth
                    />
                  </View>

                  <View style={styles.resendRow}>
                    <Text style={styles.resendText}>Didn't receive it? </Text>
                    <Text style={styles.resendLink} onPress={handleResend}>
                      Resend
                    </Text>
                  </View>

                  <Pressable style={styles.backRow} onPress={handleBack}>
                    <MaterialCommunityIcons name="arrow-left" size={16} color={KaaryaColors.muted} />
                    <Text style={styles.backText}> Edit details</Text>
                  </Pressable>
                </View>
              </>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

function maskPhone(phone: string) {
  if (!phone || phone.length < 4) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-3);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text, paddingTop: Spacing.lg },
  subtitle: { fontSize: FontSizes.base, color: KaaryaColors.muted, marginTop: 4, lineHeight: 22 },
  form: { flex: 1, paddingTop: Spacing.lg },
  sectionLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, marginBottom: Spacing.sm, marginTop: Spacing.md },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  roleCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: KaaryaColors.border,
    backgroundColor: KaaryaColors.card,
    alignItems: 'center',
  },
  roleCardSelected: { borderColor: KaaryaColors.brand[500], backgroundColor: KaaryaColors.brand[50] },
  roleLabel: { fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.text, marginTop: 8 },
  roleLabelSelected: { color: KaaryaColors.brand[600] },
  roleDesc: { fontSize: FontSizes.xs, color: KaaryaColors.muted, textAlign: 'center', marginTop: 4 },
  error: { color: KaaryaColors.danger, fontSize: FontSizes.sm, marginTop: Spacing.sm, textAlign: 'center' },
  footer: { alignItems: 'center', paddingVertical: Spacing.xl },
  footerText: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary },
  footerLink: { color: KaaryaColors.brand[500], fontWeight: '600' },

  // OTP styles
  otpHeader: { alignItems: 'center', paddingTop: Spacing.lg },
  otpIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: KaaryaColors.brand[50],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2, borderColor: KaaryaColors.brand[200],
  },
  phoneHighlight: { color: KaaryaColors.brand[500], fontWeight: '600' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.md },
  resendText: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
  resendLink: { fontSize: FontSizes.sm, color: KaaryaColors.brand[500], fontWeight: '600' },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  backText: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
});
