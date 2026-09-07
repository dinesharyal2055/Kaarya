/**
 * Help & Support — FAQ screen
 */
import { useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { LayoutAnimation, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';

type FAQ = {
  questionKey: string;
  answerKey: string;
  icon: string;
};

const FAQS: FAQ[] = [
  {
    questionKey: 'help.postTask',
    answerKey: 'help.postTaskAnswer',
    icon: 'plus-circle-outline',
  },
  {
    questionKey: 'help.acceptOffer',
    answerKey: 'help.acceptOfferAnswer',
    icon: 'handshake-outline',
  },
  {
    questionKey: 'help.getPaid',
    answerKey: 'help.getPaidAnswer',
    icon: 'cash-multiple',
  },
  {
    questionKey: 'help.verification',
    answerKey: 'help.verificationAnswer',
    icon: 'shield-check-outline',
  },
  {
    questionKey: 'help.switchRole',
    answerKey: 'help.switchRoleAnswer',
    icon: 'swap-horizontal',
  },
  {
    questionKey: 'help.deleteAccount',
    answerKey: 'help.deleteAccountAnswer',
    icon: 'account-off-outline',
  },
];

export default function HelpSupportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex(openIndex === index ? null : index);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('help.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.subtitle}>{t('help.subtitle')}</Text>

          {FAQS.map((faq, index) => (
            <View key={index} style={[styles.faqCard, Shadows.sm]}>
              <Pressable style={styles.faqQuestion} onPress={() => toggle(index)}>
                <View style={styles.faqIcon}>
                  <MaterialCommunityIcons name={faq.icon as any} size={20} color={KaaryaColors.brand[500]} />
                </View>
                <Text style={styles.faqQuestionText}>{t(faq.questionKey)}</Text>
                <MaterialCommunityIcons
                  name={openIndex === index ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={KaaryaColors.muted}
                />
              </Pressable>

              {openIndex === index && (
                <View style={styles.faqAnswer}>
                  <Text style={styles.faqAnswerText}>{t(faq.answerKey)}</Text>
                </View>
              )}
            </View>
          ))}

          <View style={[styles.noteCard, Shadows.sm]}>
            <MaterialCommunityIcons name="lightbulb-outline" size={18} color={KaaryaColors.warning} />
            <Text style={styles.noteText}>{t('help.note')}</Text>
          </View>

          {/* Contact email */}
          <View style={[styles.contactCard, Shadows.sm]}>
            <Text style={styles.contactTitle}>{t('help.cantFindAnswer')}</Text>
            <Text style={styles.contactSub}>{t('help.cantFindAnswerSub')}</Text>
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
  contentInner: { padding: Spacing.lg, gap: Spacing.sm },
  subtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginBottom: Spacing.sm, lineHeight: 20 },

  /* FAQ */
  faqCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  faqQuestion: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, gap: Spacing.sm,
  },
  faqIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: KaaryaColors.brand[50],
    alignItems: 'center', justifyContent: 'center',
  },
  faqQuestionText: { flex: 1, fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, lineHeight: 20 },
  faqAnswer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: KaaryaColors.border,
    marginTop: 0,
  },
  faqAnswerText: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, lineHeight: 22, paddingTop: Spacing.sm },

  /* Note */
  noteCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.md, gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  noteText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, lineHeight: 20 },

  /* Contact */
  contactCard: {
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginTop: Spacing.sm,
  },
  contactTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text, marginBottom: 4 },
  contactSub: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
  emailRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: KaaryaColors.brand[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  emailText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.brand[600], fontWeight: '600' },
});
