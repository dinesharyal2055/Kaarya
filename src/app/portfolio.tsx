/**
 * Portfolio screen — shows all reviews and ratings received by the current user
 * Works for both Task Poster and Service Provider modes
 */

import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { reviewsApi, API_ROOT } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Button } from '@/components/ui';
import type { Review } from '@/types';

function timeAgo(dateStr: string, t: (key: string) => string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${t('common.ago')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${t('common.ago')}`;
  if (diff < 172800) return t('common.yesterday');
  return d.toLocaleDateString('en-NP', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

function RatingBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={ratingBarStyles.container}>
      <Text style={ratingBarStyles.label}>{label}</Text>
      <View style={ratingBarStyles.track}>
        <View style={[ratingBarStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={ratingBarStyles.count}>{count}</Text>
    </View>
  );
}

const ratingBarStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  label: { fontSize: FontSizes.xs, color: KaaryaColors.textSecondary, width: 12, textAlign: 'right' },
  track: { flex: 1, height: 6, backgroundColor: KaaryaColors.border, borderRadius: 3 },
  fill: { height: '100%', borderRadius: 3 },
  count: { fontSize: FontSizes.xs, color: KaaryaColors.textSecondary, width: 20, textAlign: 'right' },
});

function ReviewCard({ review, t }: { review: Review; t: (key: string) => string }) {
  const avatarUrl = review.reviewerAvatar
    ? `${API_ROOT}${review.reviewerAvatar}`
    : undefined;

  return (
    <View style={reviewCardStyles.card}>
      <View style={reviewCardStyles.header}>
        <Avatar
          name={review.reviewerName ?? 'User'}
          uri={avatarUrl}
          size={44}
        />
        <View style={reviewCardStyles.meta}>
          <Text style={reviewCardStyles.name}>{review.reviewerName}</Text>
          <View style={reviewCardStyles.ratingRow}>
            <StarRow rating={review.rating} />
            <Text style={reviewCardStyles.date}>{timeAgo(review.createdAt, t)}</Text>
          </View>
        </View>
        <View style={[reviewCardStyles.starBadge, { backgroundColor: getStarColor(review.rating) + '20' }]}>
          <MaterialCommunityIcons
            name="star"
            size={14}
            color={getStarColor(review.rating)}
          />
          <Text style={[reviewCardStyles.starBadgeText, { color: getStarColor(review.rating) }]}>
            {review.rating}
          </Text>
        </View>
      </View>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  meta: { flex: 1, marginLeft: 12 },
  name: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  starBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 3 },
  starBadgeText: { fontSize: FontSizes.xs, fontWeight: '700' },
  comment: { fontSize: FontSizes.base, color: KaaryaColors.text, lineHeight: 22 },
  noComment: { fontSize: FontSizes.sm, color: KaaryaColors.muted, fontStyle: 'italic' },
});

function getStarColor(rating: number): string {
  if (rating >= 4) return '#F59E0B'; // amber
  if (rating === 3) return '#3B82F6'; // blue
  return '#EF4444'; // red
}

type ReviewsResponse = { reviews: Review[]; rating: number | null; reviewCount: number };

export default function PortfolioScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      if (user?.id) {
        const res = await reviewsApi.forUser(user.id);
        setData(res);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => { load(); }, [load])
  );

  // Compute rating breakdown
  const breakdown = data ? [5, 4, 3, 2, 1].map(stars => ({
    stars,
    count: data.reviews.filter(r => r.rating === stars).length,
  })) : [];

  const renderHeader = () => {
    const rating = data?.rating;
    const count = data?.reviewCount ?? 0;

    return (
      <View style={styles.header}>
        {/* Overall rating */}
        <View style={styles.ratingSummary}>
          <Text style={styles.bigRating}>{rating != null ? rating.toFixed(1) : '—'}</Text>
          <View style={styles.ratingRight}>
            <View style={starRowStyles.row}>
              {[1, 2, 3, 4, 5].map(i => (
                <MaterialCommunityIcons
                  key={i}
                  name={rating != null && i <= Math.round(rating) ? 'star' : 'star-outline'}
                  size={22}
                  color={rating != null && i <= Math.round(rating) ? '#F59E0B' : KaaryaColors.muted}
                />
              ))}
            </View>
            <Text style={styles.ratingCount}>
              {count === 0 ? t('portfolio.noReviews') : `${count} ${count === 1 ? t('portfolio.review') : t('portfolio.reviews')}`}
            </Text>
          </View>
        </View>

        {/* Rating breakdown bars */}
        {count > 0 && (
          <View style={styles.breakdown}>
            {breakdown.map(({ stars, count: c }) => (
              <RatingBar
                key={stars}
                label={`${stars}★`}
                count={c}
                total={count}
                color={getStarColor(stars)}
              />
            ))}
          </View>
        )}
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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.screenHeader}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('portfolio.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        ) : (
          <FlatList
            data={data?.reviews ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ReviewCard review={item} t={t} />}
            ListHeaderComponent={renderHeader}
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
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl * 2, flexGrow: 1 },
  header: { paddingVertical: Spacing.lg },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
    gap: Spacing.md,
  },
  bigRating: { fontSize: 52, fontWeight: '800', color: KaaryaColors.text },
  ratingRight: { flex: 1 },
  ratingCount: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4 },
  breakdown: {
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  empty: { alignItems: 'center', paddingVertical: Spacing.xl * 2 },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptySub: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 6, textAlign: 'center' },
});
