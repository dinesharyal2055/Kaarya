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
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';
import type { UserRole } from '@/types';

type Step = 'form' | 'otp';

export default function RegisterScreen() {
  const { t } = useTranslation();
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
    if (!name.trim()) { setError(t('auth.register.errors.fillAllFields')); return; }
    if (!email.trim() || !email.includes('@')) { setError(t('auth.register.errors.invalidEmail')); return; }
    if (!phone.trim() || phone.length < 8) { setError(t('auth.register.errors.fillAllFields')); return; }
    if (password.length < 8) { setError(t('auth.register.errors.passwordTooShort')); return; }
    if (!/\d/.test(password)) { setError(t('auth.register.errors.passwordNeedsNumber')); return; }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) { setError(t('auth.register.errors.passwordNeedsSpecial')); return; }
    if (password !== confirmPassword) { setError(t('auth.register.errors.passwordsDoNotMatch')); return; }

    setLoading(true);
    try {
      await authApi.registerInitiate({ phone: phone.trim(), password, name: name.trim(), email: email.trim(), role });
      setStep('otp');
    } catch (e: any) {
      setError(e.message ?? t('auth.register.errors.verificationFailed'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: verify OTP and create account ──────────────────────
  async function handleVerify() {
    if (otp.length !== 6) { setError(t('auth.register.errors.invalidOtp')); return; }
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
        setError(t('auth.register.errors.invalidOtp'));
      } else {
        setError(e.message ?? t('auth.register.errors.verificationFailed'));
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
      setError(t('common.success') + ' — ' + t('auth.register.didntReceive'));
      setTimeout(() => setError(''), 4000);
    } catch {
      setError(t('common.error'));
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
    { value: 'seeker', label: t('auth.register.iNeedHelp'), icon: 'account-search', desc: t('auth.register.iNeedHelpSub') },
    { value: 'provider', label: t('auth.register.iProvideServices'), icon: 'account-wrench', desc: t('auth.register.iProvideServicesSub') },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: step === 'otp' ? t('auth.register.verifyAccount') : t('auth.register.createAccount'),
          headerStyle: { backgroundColor: '#FF6B35' },
          headerTintColor: '#fff',
          headerBackTitle: step === 'otp' ? t('common.back') : undefined,
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
                <Text style={styles.title}>{t('auth.register.createAccount')}</Text>
                <Text style={styles.subtitle}>{t('auth.register.joinKaarya')}</Text>

                <View style={styles.form}>
                  <Input
                    label={t('auth.register.fullName')}
                    placeholder={t('auth.register.namePlaceholder')}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="account" size={20} color={KaaryaColors.muted} />}
                  />
                  <Input
                    label={t('auth.register.emailAddress')}
                    placeholder={t('auth.register.emailPlaceholder')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="email" size={20} color={KaaryaColors.muted} />}
                  />
                  <Input
                    label={t('auth.register.phoneNumber')}
                    placeholder={t('auth.register.phonePlaceholder')}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="phone" size={20} color={KaaryaColors.muted} />}
                  />
                  <Input
                    label={t('auth.register.password')}
                    placeholder={t('auth.register.passwordPlaceholder')}
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
                  <Text style={styles.passwordHint}>{t('auth.register.passwordRequirements')}</Text>
                  <Input
                    label={t('auth.register.confirmPassword')}
                    placeholder={t('auth.register.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<MaterialCommunityIcons name="lock-check" size={20} color={KaaryaColors.muted} />}
                  />

                  <Text style={styles.sectionLabel}>{t('profile.activeMode')}</Text>
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
                    <Button title={t('common.continue')} onPress={handleInitiate} loading={loading} fullWidth />
                  </View>
                </View>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    {t('auth.register.alreadyHaveAccount')}{' '}
                    <Text style={styles.footerLink} onPress={() => router.back()}>
                      {t('auth.register.signIn')}
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
                  <Text style={styles.title}>{t('auth.register.verifyAccount')}</Text>
                  <Text style={styles.subtitle}>
                    {t('auth.register.otpSentTo')}{'\n'}
                    <Text style={styles.phoneHighlight}>{email}</Text>
                  </Text>
                </View>

                <View style={styles.form}>
                  <Input
                    label={t('auth.register.enterOtp')}
                    placeholder={t('auth.register.otpPlaceholder')}
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
                      title={t('auth.register.verifyAndCreate')}
                      onPress={handleVerify}
                      loading={loading}
                      disabled={otp.length !== 6}
                      fullWidth
                    />
                  </View>

                  <View style={styles.resendRow}>
                    <Text style={styles.resendText}>{t('auth.register.didntReceive')} </Text>
                    <Text style={styles.resendLink} onPress={handleResend}>
                      {t('auth.register.resend')}
                    </Text>
                  </View>

                  <Pressable style={styles.backRow} onPress={handleBack}>
                    <MaterialCommunityIcons name="arrow-left" size={16} color={KaaryaColors.muted} />
                    <Text style={styles.backText}>{t('auth.register.editDetails')}</Text>
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
  passwordHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4, marginBottom: Spacing.md },
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
