/**
 * Notification Settings screen — stub
 */
import { useRouter, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';

interface ToggleRowProps {
  icon: string;
  title: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

function ToggleRow({ icon, title, description, value, onToggle }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleIcon}>
        <MaterialCommunityIcons name={icon as any} size={20} color={KaaryaColors.brand[500]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: KaaryaColors.border, true: KaaryaColors.brand[200] }}
        thumbColor={value ? KaaryaColors.brand[500] : '#f4f3f4'}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [offerAlerts, setOfferAlerts] = useState(true);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [jobUpdates, setJobUpdates] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [sound, setSound] = useState(true);
  const [vibrate, setVibrate] = useState(true);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('notificationSettings.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.sectionLabel}>{t('notificationSettings.alerts')}</Text>
          <View style={[styles.section, Shadows.sm]}>
            <ToggleRow
              icon="bell"
              title={t('notificationSettings.pushNotifications')}
              description={t('notificationSettings.pushDescription')}
              value={pushEnabled}
              onToggle={setPushEnabled}
            />
            <View style={styles.divider} />
            <ToggleRow
              icon="offer"
              title={t('notificationSettings.newOffers')}
              description={t('notificationSettings.newOffersDescription')}
              value={offerAlerts}
              onToggle={setOfferAlerts}
            />
            <View style={styles.divider} />
            <ToggleRow
              icon="message-text"
              title={t('notificationSettings.messages')}
              description={t('notificationSettings.messagesDescription')}
              value={messageAlerts}
              onToggle={setMessageAlerts}
            />
            <View style={styles.divider} />
            <ToggleRow
              icon="briefcase-outline"
              title={t('notificationSettings.jobUpdates')}
              description={t('notificationSettings.jobUpdatesDescription')}
              value={jobUpdates}
              onToggle={setJobUpdates}
            />
          </View>

          <Text style={styles.sectionLabel}>{t('notificationSettings.preferences')}</Text>
          <View style={[styles.section, Shadows.sm]}>
            <ToggleRow
              icon="volume-high"
              title={t('notificationSettings.sound')}
              description={t('notificationSettings.soundDescription')}
              value={sound}
              onToggle={setSound}
            />
            <View style={styles.divider} />
            <ToggleRow
              icon="vibrate"
              title={t('notificationSettings.vibration')}
              description={t('notificationSettings.vibrationDescription')}
              value={vibrate}
              onToggle={setVibrate}
            />
          </View>

          <Text style={styles.sectionLabel}>{t('notificationSettings.other')}</Text>
          <View style={[styles.section, Shadows.sm]}>
            <ToggleRow
              icon="tag-outline"
              title={t('notificationSettings.promotionsTips')}
              description={t('notificationSettings.promotionsTipsDescription')}
              value={marketing}
              onToggle={setMarketing}
            />
          </View>

          <Text style={styles.footerText}>
            {t('notificationSettings.footerNote')}
          </Text>
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
  contentInner: { padding: Spacing.lg },
  sectionLabel: { fontSize: FontSizes.xs, fontWeight: '700', color: KaaryaColors.muted, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.md },
  section: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: 12 },
  toggleIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: KaaryaColors.brand[50], alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontSize: FontSizes.base, color: KaaryaColors.text, fontWeight: '500' },
  toggleDesc: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: KaaryaColors.border, marginLeft: Spacing.md + 36 + 12 },
  footerText: { fontSize: FontSizes.xs, color: KaaryaColors.muted, textAlign: 'center', marginTop: Spacing.xl, lineHeight: 18 },
});
