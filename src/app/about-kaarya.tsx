/**
 * About Kaarya screen
 */
import { useRouter, Stack } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';

const APP_VERSION = '1.0.0';

const HOW_IT_WORKS_STEPS = [
  { icon: 'post', key: 'about.step1' },
  { icon: 'handshake', key: 'about.step2' },
  { icon: 'check-circle', key: 'about.step3' },
];

export default function AboutKaaryaScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('about.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {/* Logo + tagline */}
          <View style={styles.logoSection}>
            <View style={[styles.logoWrap, Shadows.md]}>
              <MaterialCommunityIcons name="briefcase-outline" size={48} color={KaaryaColors.brand[500]} />
            </View>
            <Text style={styles.appName}>Kaarya</Text>
            <Text style={styles.version}>v{APP_VERSION}</Text>
          </View>

          {/* What is Kaarya */}
          <View style={[styles.section, Shadows.sm]}>
            <Text style={styles.sectionTitle}>{t('about.whatIsKaarya')}</Text>
            <Text style={styles.sectionText}>{t('about.whatIsKaaryaDesc')}</Text>
          </View>

          {/* How it works */}
          <View style={[styles.section, Shadows.sm]}>
            <Text style={styles.sectionTitle}>{t('about.howItWorks')}</Text>
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <MaterialCommunityIcons
                  name={step.icon as any}
                  size={22}
                  color={KaaryaColors.brand[500]}
                  style={{ marginHorizontal: Spacing.sm }}
                />
                <Text style={styles.stepText}>{t(step.key)}</Text>
              </View>
            ))}
          </View>

          {/* Legal links */}
          <View style={[styles.section, Shadows.sm]}>
            <Text style={styles.sectionTitle}>{t('about.legal')}</Text>
            <LinkRow
              label={t('about.privacyPolicy')}
              onPress={() => {}}
            />
            <View style={styles.linkDivider} />
            <LinkRow
              label={t('about.termsOfService')}
              onPress={() => {}}
            />
          </View>

          {/* Contact Support */}
          <View style={[styles.section, Shadows.sm]}>
            <Text style={styles.sectionTitle}>{t('about.contactSupport')}</Text>
            <Text style={styles.sectionText}>{t('about.contactSupportSub')}</Text>
            <Pressable
              style={styles.emailRow}
              onPress={() => Linking.openURL('mailto:karyaapp.support@gmail.com')}
            >
              <MaterialCommunityIcons name="email-outline" size={18} color={KaaryaColors.brand[500]} />
              <Text style={styles.emailText}>karyaapp.support@gmail.com</Text>
              <MaterialCommunityIcons name="open-in-new" size={14} color={KaaryaColors.muted} />
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <Text style={styles.linkText}>{label}</Text>
      <MaterialCommunityIcons name="open-in-new" size={16} color={KaaryaColors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: KaaryaColors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  content: { flex: 1 },
  contentInner: { padding: Spacing.lg, gap: Spacing.md },

  /* Logo section */
  logoSection: { alignItems: 'center', paddingVertical: Spacing.xl },
  logoWrap: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: KaaryaColors.brand[50],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  appName: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  version: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 2 },

  /* Section */
  section: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text, marginBottom: Spacing.sm },
  sectionText: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, lineHeight: 22 },

  /* How it works */
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: KaaryaColors.brand[500],
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumberText: { fontSize: FontSizes.xs, fontWeight: '800', color: '#fff' },
  stepText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, lineHeight: 20 },

  /* Links */
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  linkText: { fontSize: FontSizes.sm, color: KaaryaColors.brand[500], fontWeight: '500' },
  linkDivider: { height: 1, backgroundColor: KaaryaColors.border },

  /* Email */
  emailRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.md, gap: Spacing.sm,
    backgroundColor: KaaryaColors.brand[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  emailText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.brand[600], fontWeight: '600' },
});
