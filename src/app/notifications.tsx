/**
 * Notifications screen — list of all user notifications
 */
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { notifApi } from '@/lib/api';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import type { Notification } from '@/types';

// ─── Icon & color map for each notification type ────────────────────

type NotifType = Notification['type'];

const TYPE_META: Record<NotifType, { icon: string; color: string; label: string }> = {
  new_offer:             { icon: 'gavel',            color: KaaryaColors.brand[500], label: 'New Offer' },
  offer_accepted:        { icon: 'check-circle',    color: KaaryaColors.success,    label: 'Offer Accepted' },
  offer_rejected:        { icon: 'close-circle',    color: KaaryaColors.danger,    label: 'Not Selected' },
  offer_countered:       { icon: 'swap-horizontal', color: KaaryaColors.warning,   label: 'Counter Offer' },
  new_message:           { icon: 'email-outline',    color: KaaryaColors.brand[500], label: 'New Message' },
  job_started:           { icon: 'play-circle',     color: KaaryaColors.brand[500], label: 'Job Started' },
  job_completed:         { icon: 'check-circle',    color: KaaryaColors.success,    label: 'Job Complete' },
  review_received:       { icon: 'star',             color: '#F59E0B',              label: 'New Review' },
  verification_approved:  { icon: 'shield-check',    color: KaaryaColors.success,   label: 'Verified' },
  verification_rejected: { icon: 'shield-off',      color: KaaryaColors.danger,    label: 'Verification' },
};

// ─── Relative time ──────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  return d.toLocaleDateString('en-NP', { month: 'short', day: 'numeric' });
}

// ─── Single notification card ───────────────────────────────────────

function NotifCard({ item, onPress }: { item: Notification; onPress: () => void }) {
  const meta = TYPE_META[item.type] ?? { icon: 'bell', color: KaaryaColors.brand[500], label: 'Notification' };

  return (
    <Pressable
      style={[styles.card, item.read ? {} : styles.cardUnread]}
      onPress={onPress}
    >
      {!item.read && <View style={[styles.unreadBar, { backgroundColor: meta.color }]} />}
      <View style={[styles.iconWrap, { backgroundColor: meta.color + '20' }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}>{item.title}</Text>
        <Text style={styles.cardBody2} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.cardTime}>{relativeTime(item.createdAt)}</Text>
      </View>
      {!item.read && (
        <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />
      )}
    </Pressable>
  );
}

// ─── Main screen ───────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await notifApi.list();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently fail — notifications are non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on mount and whenever screen regains focus
  useFocusEffect(
    useCallback(() => { load(); }, [load])
  );

  const handlePress = async (item: Notification) => {
    // Mark as read
    if (!item.read) {
      try {
        await notifApi.markRead(item.id);
        setNotifications(prev =>
          prev.map(n => n.id === item.id ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch { /* non-critical */ }
    }

    // Navigate based on type + data
    const data = item.data ?? {};
    if (item.type === 'new_offer' && data.jobId) {
      router.push(`/job/${data.jobId}`);
    } else if (item.type === 'offer_accepted' && data.jobId) {
      router.push(`/job/${data.jobId}`);
    } else if (item.type === 'offer_rejected' && data.jobId) {
      router.push(`/job/${data.jobId}`);
    } else if (
      item.type === 'offer_accepted' ||
      item.type === 'offer_rejected' ||
      item.type === 'offer_countered'
    ) {
      router.push('/offers');
    } else if (item.type === 'new_message') {
      // Chat not fully implemented — fall back to messages tab
      router.push('/(tabs)/messages');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notifApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* non-critical */ }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 ? (
            <Pressable onPress={handleMarkAllRead} style={styles.markAllBtn}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : (
            <View style={{ width: 80 }} />
          )}
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="bell-off-outline" size={64} color={KaaryaColors.muted} />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyText}>
              You're all caught up! We'll notify you when something happens.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={KaaryaColors.brand[500]}
              />
            }
            renderItem={({ item }) => (
              <NotifCard item={item} onPress={() => handlePress(item)} />
            )}
          />
        )}
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
  markAllBtn: { paddingHorizontal: 4 },
  markAllText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.brand[500] },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', marginTop: 8 },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
    overflow: 'hidden',
  },
  cardUnread: {
    backgroundColor: KaaryaColors.brand[50],
    ...Shadows.md,
  },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: BorderRadius.lg, borderBottomLeftRadius: BorderRadius.lg },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  cardTitleUnread: { fontWeight: '700' },
  cardBody2: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, lineHeight: 20 },
  cardTime: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 6 },
});
