/**
 * Payment Methods screen — stub
 */
import { useRouter, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function PaymentMethodsScreen() {
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
              onPress={() => {}}
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
});
