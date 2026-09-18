/**
 * Portfolio / public profile screen — read-only marketplace profile.
 * Shows the user's avatar, name, role, rating, reviews received, and
 * role stats (jobs completed for providers, tasks posted for posters).
 * Works for the current user AND for any other user (public profile),
 * opened via `router.push({ pathname: '/portfolio', params: { userId } })`.
 * No edit/delete affordances — this screen is read-only.
 */

import { useRouter, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { usersApi, API_ROOT } from '@/lib/api';
import { parseServerTime, formatNepalMedium } from '@/lib/time';
import { useAuth } from '@/context/AuthContext';
import { jobStatusLabel } from '@/lib/jobStatus';
import { Avatar, Badge } from '@/components/ui';
import type { PublicPortfolio } from '@/types';

function StarRow({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <View style={starRowStyles.row}>
      {[...Array(max)].map((_, i) => (
        <MaterialCommunityIcons
          key={i}
          name={i < rating ? 'star' : 'star-outline'}
          size={16}
          color={i < rating ? '#F59E0B' : KaaryaColors.muted}
        />
      ))}
    </View>
  );
}

const starRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

function getStarColor(rating: number): string {
  if (rating >= 4) return '#F59E0B';
  if (rating === 3) return '#3B82F6';
  return '#EF4444';
}

function taskStatusColor(status: string): string {
  if (status === 'open') return KaaryaColors.success;
  if (status === 'in_progress') return KaaryaColors.warning;
  if (status === 'completed') return KaaryaColors.muted;
  if (status === 'cancelled') return KaaryaColors.danger;
  return KaaryaColors.warning;
}

function ReviewCard({ review, t }: { review: PublicPortfolio['reviews'][number]; t: (key: string) => string }) {
  const avatarUrl = review.reviewerAvatar
    ? `${API_ROOT}${review.reviewerAvatar}`
    : undefined;

  return (
    <View style={reviewCardStyles.card}>
      <View style={reviewCardStyles.header}>
        <Avatar name={review.reviewerName ?? 'User'} uri={avatarUrl} size={44} />
        <View style={reviewCardStyles.meta}>
          <Text style={reviewCardStyles.name}>{review.reviewerName}</Text>
          <View style={reviewCardStyles.ratingRow}>
            <StarRow rating={review.rating} />
            <Text style={reviewCardStyles.date}>{formatNepalMedium(parseServerTime(review.createdAt))}</Text>
          </View>
        </View>
        <View style={[reviewCardStyles.starBadge, { backgroundColor: getStarColor(review.rating) + '20' }]}>
          <MaterialCommunityIcons name="star" size={14} color={getStarColor(review.rating)} />
          <Text style={[reviewCardStyles.starBadgeText, { color: getStarColor(review.rating) }]}>
            {review.rating}
          </Text>
        </View>
      </View>
      {review.jobTitle ? (
        <Text style={reviewCardStyles.jobTitle}>
          {t('portfolio.taskColon')}{review.jobTitle}
        </Text>
      ) : null}
      {review.comment ? (
        <Text style={reviewCardStyles.comment}>{review.comment}</Text>
      ) : (
        <Text style={reviewCardStyles.noComment}>{t('portfolio.noComment')}</Text>
      )}
    </View>
  );
}

const reviewCardStyles = StyleSheet.create({
  card: {
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  meta: { flex: 1, marginLeft: 12 },
  name: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  date: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  starBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 3 },
  starBadgeText: { fontSize: FontSizes.xs, fontWeight: '700' },
  jobTitle: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.brand[700], marginBottom: 6 },
  comment: { fontSize: FontSizes.base, color: KaaryaColors.text, lineHeight: 22 },
  noComment: { fontSize: FontSizes.sm, color: KaaryaColors.muted, fontStyle: 'italic' },
});

function TaskCard({ task, t }: { task: PublicPortfolio['tasks'][number]; t: (key: string) => string }) {
  const color = taskStatusColor(task.status);
  return (
    <View style={taskCardStyles.card}>
      <View style={taskCardStyles.topRow}>
        <Text style={taskCardStyles.title} numberOfLines={1}>{task.title}</Text>
        <View style={[taskCardStyles.statusPill, { backgroundColor: color + '20' }]}>
          <Text style={[taskCardStyles.statusText, { color }]}>{jobStatusLabel(t, task.status)}</Text>
        </View>
      </View>
      <Text style={taskCardStyles.date}>{formatNepalMedium(parseServerTime(task.createdAt))}</Text>
    </View>
  );
}

const taskCardStyles = StyleSheet.create({
  card: {
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '700' },
  date: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 6 },
});

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={statStyles.stat}>
      <MaterialCommunityIcons name={icon as any} size={20} color={KaaryaColors.brand[500]} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: FontSizes.xl, fontWeight: '800', color: KaaryaColors.text },
  label: { fontSize: FontSizes.xs, color: KaaryaColors.muted, textAlign: 'center' },
});

export default function PortfolioScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { userId: userIdParam } = useLocalSearchParams<{ userId?: string }>();

  const [data, setData] = useState<PublicPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const targetUserId = userIdParam ? String(userIdParam) : (user?.id ?? '');
  const isOwn = !userIdParam || String(userIdParam) === String(user?.id);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      if (targetUserId) {
        const res = await usersApi.portfolio(targetUserId);
        setData(res);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load portfolio');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId]);

  useFocusEffect(
    useCallback(() => { load(); }, [load])
  );

  const isProvider = data?.user.role === 'provider';
  const portfolio = data?.user;

  const renderProfileHeader = () => {
    if (!portfolio) return null;
    const avatarUrl = portfolio.avatarUrl ? `${API_ROOT}${portfolio.avatarUrl}` : undefined;
    return (
      <View style={styles.profileHeader}>
        <Avatar name={portfolio.name ?? 'User'} uri={avatarUrl} size={72} />
        <Text style={styles.name} numberOfLines={1}>{portfolio.name}</Text>
        <View style={styles.badgeRow}>
          <Badge
            label={isProvider ? t('profile.serviceProvider') : t('profile.taskPoster')}
            variant="brand"
          />
          <Badge
            label={portfolio.verified ? t('profile.verified') : t('profile.unverified')}
            variant={portfolio.verified ? 'success' : 'warning'}
          />
        </View>
        {portfolio.bio ? <Text style={styles.bio}>{portfolio.bio}</Text> : null}
      </View>
    );
  };

  const renderStats = () => {
    if (!portfolio) return null;
    const countStat = isProvider
      ? { label: t('portfolio.jobsCompleted'), value: String(portfolio.jobsCompleted), icon: 'check-circle' }
      : { label: t('portfolio.tasksPosted'), value: String(portfolio.tasksPosted), icon: 'clipboard-list' };
    return (
      <View style={[styles.statsCard, Shadows.sm]}>
        <Stat
          label={t('review.starLabels.3')}
          value={portfolio.rating != null ? portfolio.rating.toFixed(1) : '—'}
          icon="star"
        />
        <View style={styles.statDivider} />
        <Stat
          label={t('portfolio.reviews')}
          value={String(portfolio.reviewCount)}
          icon="message-text"
        />
        <View style={styles.statDivider} />
        <Stat label={countStat.label} value={countStat.value} icon={countStat.icon} />
      </View>
    );
  };

  const renderTasks = () => {
    if (!data || isProvider) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('portfolio.tasks')}</Text>
        {data.tasks.length > 0 ? (
          data.tasks.map((task) => <TaskCard key={task.id} task={task} t={t} />)
        ) : (
          <View style={styles.emptyInline}>
            <MaterialCommunityIcons name="clipboard-outline" size={40} color={KaaryaColors.muted} />
            <Text style={styles.emptyInlineText}>{t('portfolio.noTasks')}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderReviewsTitle = () => {
    if (!data) return null;
    if (data.reviews.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('portfolio.reviewsSection')}</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <MaterialCommunityIcons name="star-outline" size={56} color={KaaryaColors.muted} />
      <Text style={styles.emptyTitle}>{t('portfolio.noReviews')}</Text>
      <Text style={styles.emptySub}>{t('portfolio.noReviewsHint')}</Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.centerState}>
      <MaterialCommunityIcons name="alert-circle-outline" size={56} color={KaaryaColors.danger} />
      <Text style={styles.errorText}>{error || t('portfolio.loadFailed')}</Text>
      <Pressable style={styles.retryBtn} onPress={() => load()}>
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.screenHeader}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isOwn ? t('portfolio.title') : t('portfolio.publicTitle')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        ) : error ? (
          renderError()
        ) : (
          <FlatList
            data={data?.reviews ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ReviewCard review={item} t={t} />}
            ListHeaderComponent={
              <>
                {renderProfileHeader()}
                {renderStats()}
                {renderTasks()}
                {renderReviewsTitle()}
              </>
            }
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={KaaryaColors.brand[500]}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: KaaryaColors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: Spacing.sm, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl * 2, flexGrow: 1 },
  profileHeader: { alignItems: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  name: { fontSize: FontSizes.xl, fontWeight: '800', color: KaaryaColors.text, marginTop: Spacing.sm, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  bio: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  statDivider: { width: 1, height: 36, backgroundColor: KaaryaColors.border },
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: KaaryaColors.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  emptyInline: { alignItems: 'center', paddingVertical: Spacing.xl, backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md },
  emptyInlineText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: Spacing.sm },
  empty: { alignItems: 'center', paddingVertical: Spacing.xl * 2 },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptySub: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 6, textAlign: 'center' },
});