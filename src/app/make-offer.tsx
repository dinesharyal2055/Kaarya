/**
 * Make Offer modal — provider submits a bid on a job
 */
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES } from '@/constants/categories';
import { Button, Input } from '@/components/ui';
import { submitOffer } from '@/services/offers';
import { useAuth } from '@/context/AuthContext';

export default function MakeOfferScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { jobId, jobTitle, jobCategory, budgetMin, budgetMax } = useLocalSearchParams<{
    jobId: string;
    jobTitle: string;
    jobCategory: string;
    budgetMin?: string;
    budgetMax?: string;
  }>();

  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const catData = CATEGORIES.find((c) => c.id === jobCategory);
  const catColor = catData?.color ?? KaaryaColors.brand[500];

  const minN = budgetMin ? parseFloat(budgetMin) : NaN;
  const maxN = budgetMax ? parseFloat(budgetMax) : NaN;
  const hasMin = !isNaN(minN) && minN > 0;
  const hasMax = !isNaN(maxN) && maxN > 0;
  const mode: 'negotiable' | 'open_offers' | 'fixed' | null =
    hasMin && hasMax && maxN > minN ? 'negotiable'
    : hasMin && hasMax && maxN === minN ? 'fixed'
    : hasMin ? 'open_offers'
    : null;
  const modeConfig = mode && {
    negotiable: { icon: 'swap-horizontal', color: KaaryaColors.brand[500], label: t('makeOffer.modeNegotiable'), hint: t('makeOffer.modeNegotiableHint') },
    open_offers: { icon: 'format-list-bulleted', color: KaaryaColors.brand[500], label: t('makeOffer.modeOpenOffers'), hint: t('makeOffer.modeOpenOffersHint') },
    fixed: { icon: 'lock', color: KaaryaColors.brand[600], label: t('makeOffer.modeFixed'), hint: t('makeOffer.modeFixedHint') },
  }[mode];
  const budgetMeta = mode === 'fixed'
    ? null
    : mode === 'open_offers'
      ? `${t('makeOffer.startingPriceLabel')}: Rs. ${budgetMin}`
      : hasMin && hasMax
        ? `${t('makeOffer.seekerBudget')}: Rs. ${budgetMin} – ${budgetMax}`
        : null;

  const fixedPrice = mode === 'fixed' && hasMin ? minN : null;

  async function handleSubmit() {
    if (user?.verificationStatus !== 'verified') {
      Alert.alert(
        t('alerts.verificationRequiredTitle'),
        t('alerts.onlyVerifiedProvidersCanBid'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('alerts.goVerify'), onPress: () => router.push('/verification') },
        ]
      );
      return;
    }

    const offerPrice = fixedPrice ?? (price ? parseFloat(price) : NaN);
    if (!offerPrice || offerPrice <= 0) {
      Alert.alert(t('makeOffer.invalidPrice'), t('makeOffer.enterValidAmount'));
      return;
    }

    setLoading(true);
    try {
      await submitOffer({
        jobId: jobId!,
        price: offerPrice,
        message: message.trim() || undefined,
      });
      Alert.alert(t('makeOffer.successTitle'), t('makeOffer.successMessage'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message ?? t('makeOffer.submitFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="close" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('makeOffer.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Job context */}
            {catData && (
              <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
                <MaterialCommunityIcons name={catData.icon as any} size={16} color={catColor} />
                <Text style={[styles.catBadgeText, { color: catColor }]}>{catData.name}</Text>
              </View>
            )}
            <Text style={styles.jobTitle}>{jobTitle}</Text>
            {modeConfig && (
              <View style={styles.modeWrap}>
                <View style={[styles.modeChip, { backgroundColor: modeConfig.color + '1A' }]}>
                  <MaterialCommunityIcons name={modeConfig.icon as any} size={14} color={modeConfig.color} />
                  <Text style={[styles.modeChipText, { color: modeConfig.color }]}>{modeConfig.label}</Text>
                </View>
                <Text style={styles.modeHint}>{modeConfig.hint}</Text>
              </View>
            )}
            {budgetMeta && (
              <Text style={styles.budgetHint}>
                {budgetMeta}
              </Text>
            )}

            {/* Price input / Fixed-price display */}
            <View style={styles.section}>
              {mode !== 'fixed' && <Text style={styles.sectionTitle}>{t('makeOffer.yourOffer')}</Text>}
              {mode === 'fixed' ? (
                <View style={styles.fixedPriceRow}>
                  <MaterialCommunityIcons name="lock" size={18} color={KaaryaColors.brand[600]} />
                  <Text style={styles.fixedPriceValue}>
                    {`${t('makeOffer.fixedPriceLabel')}: Rs. ${budgetMin}`}
                  </Text>
                </View>
              ) : (
                <View style={styles.priceRow}>
                  <Text style={styles.currency}>Rs.</Text>
                  <Input
                    placeholder="0"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                  />
                </View>
              )}
              <Text style={styles.hint}>
                {mode === 'fixed' ? t('makeOffer.modeFixedHint') : t('makeOffer.priceHint')}
              </Text>
            </View>

            {/* Message */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('makeOffer.messageOptional')}</Text>
              <Input
                placeholder={t('makeOffer.messagePlaceholder')}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                containerStyle={{ marginBottom: 0 }}
              />
            </View>

            {/* Tip */}
            <View style={styles.tipCard}>
              <MaterialCommunityIcons name="lightbulb-outline" size={20} color={KaaryaColors.brand[500]} />
              <Text style={styles.tipText}>
                {t('makeOffer.tipText')}
              </Text>
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={styles.cta}>
            <Button
              title={t('makeOffer.submitOffer')}
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || (!fixedPrice && !price)}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  catBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: Spacing.lg, gap: 6 },
  catBadgeText: { fontSize: FontSizes.xs, fontWeight: '700' },
  jobTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: KaaryaColors.text, marginTop: Spacing.sm },
  budgetHint: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, marginBottom: Spacing.md },
  modeWrap: { marginTop: Spacing.sm, gap: 4 },
  modeChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, gap: 6 },
  modeChipText: { fontSize: FontSizes.xs, fontWeight: '700' },
  modeHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, lineHeight: 18 },
  section: { marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.text, marginBottom: Spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixedPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: KaaryaColors.brand[50], borderWidth: 1, borderColor: KaaryaColors.brand[100], borderRadius: BorderRadius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  fixedPriceValue: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.brand[600] },
  currency: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginBottom: 0 },
  hint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 8 },
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: KaaryaColors.brand[50], borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.lg },
  tipText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.brand[600], lineHeight: 20 },
  cta: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
});
