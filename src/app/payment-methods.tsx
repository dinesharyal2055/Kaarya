/**
 * Payment Methods screen
 * Shows existing methods + add flow (coming soon: eSewa / Khalti)
 */
import { useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';
import { Button, Badge } from '@/components/ui';

type PaymentTier = {
  id: string;
  labelKey: string;
  subtitleKey: string;
  descriptionKey: string;
  icon: string;
  badgeKey: string;
  active: boolean;
};

const PAYMENT_TIERS = (t: (k: string) => string): PaymentTier[] => [
  {
    id: 'esewa',
    labelKey: 'paymentMethods.esewa',
    subtitleKey: 'paymentMethods.esewaSub',
    descriptionKey: 'paymentMethods.esewaDesc',
    icon: 'wallet',
    badgeKey: 'paymentMethods.comingSoon',
    active: false,
  },
  {
    id: 'khalti',
    labelKey: 'paymentMethods.khalti',
    subtitleKey: 'paymentMethods.khaltiSub',
    descriptionKey: 'paymentMethods.khaltiDesc',
    icon: 'cellphone',
    badgeKey: 'paymentMethods.comingSoon',
    active: false,
  },
];

export default function PaymentMethodsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const tiers = PAYMENT_TIERS(t);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('paymentMethods.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <View style={[styles.emptyCard, Shadows.sm]}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="credit-card-off-outline" size={40} color={KaaryaColors.muted} />
            </View>
            <Text style={styles.emptyTitle}>{t('paymentMethods.noPaymentMethods')}</Text>
            <Text style={styles.emptyText}>
              {t('paymentMethods.addPaymentMethodHint')}
            </Text>
            <Button
              title={t('paymentMethods.addPaymentMethod')}
              onPress={() => setShowModal(true)}
              style={{ marginTop: Spacing.lg }}
            />
          </View>

          <View style={[styles.infoCard, Shadows.sm]}>
            <MaterialCommunityIcons name="shield-check" size={20} color={KaaryaColors.success[500]} />
            <Text style={styles.infoText}>
              {t('paymentMethods.encryptionNote')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Coming Soon Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('paymentMethods.addPaymentMethod')}</Text>
            <Pressable onPress={() => setShowModal(false)} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color={KaaryaColors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalSubtitle}>{t('paymentMethods.chooseMethodSubtitle')}</Text>

            {tiers.map((tier) => (
              <View
                key={tier.id}
                style={[styles.tierCard, Shadows.sm, !tier.active && styles.tierCardInactive]}
              >
                <View style={[styles.tierIcon, { backgroundColor: tier.active ? KaaryaColors.brand[500] + '15' : KaaryaColors.border }]}>
                  <MaterialCommunityIcons
                    name={tier.icon as any}
                    size={28}
                    color={tier.active ? KaaryaColors.brand[500] : KaaryaColors.muted}
                  />
                </View>
                <View style={styles.tierContent}>
                  <View style={styles.tierHeader}>
                    <Text style={[styles.tierLabel, !tier.active && styles.textMuted]}>
                      {t(tier.labelKey)}
                    </Text>
                    <Badge
                      label={t(tier.badgeKey)}
                      variant={tier.active ? 'success' : 'muted'}
                    />
                  </View>
                  <Text style={[styles.tierSubtitle, !tier.active && styles.textMuted]}>
                    {t(tier.subtitleKey)}
                  </Text>
                  <Text style={styles.tierDescription}>{t(tier.descriptionKey)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  contentInner: { padding: Spacing.lg, gap: Spacing.md },
  emptyCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center' },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: KaaryaColors.brand[50], alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text, marginBottom: Spacing.xs },
  emptyText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', lineHeight: 20 },
  infoCard: { flexDirection: 'row', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.sm, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.muted, lineHeight: 20 },

  /* Modal */
  modalContainer: { flex: 1, backgroundColor: KaaryaColors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: KaaryaColors.border,
  },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: Spacing.lg },
  modalSubtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginBottom: Spacing.lg, lineHeight: 20 },

  /* Tier cards */
  tierCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    opacity: 1,
  },
  tierCardInactive: { opacity: 0.6 },
  tierIcon: { width: 52, height: 52, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  tierContent: { flex: 1 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tierLabel: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  tierSubtitle: { fontSize: FontSizes.sm, fontWeight: '500', color: KaaryaColors.brand[500], marginBottom: 4 },
  tierDescription: { fontSize: FontSizes.xs, color: KaaryaColors.muted, lineHeight: 18 },
  textMuted: { color: KaaryaColors.muted },
});
