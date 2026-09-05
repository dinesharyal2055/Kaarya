/**
 * Home screen — main hub for the user
 * Shows greeting, quick actions, and recent open jobs
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES } from '@/constants/categories';
import { fetchJobs } from '@/services/jobs';
import { notifApi } from '@/lib/api';
import type { Job } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const greeting = getGreeting();

  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const loadRecentJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingJobs(true);
    try {
      const [jobsResult, notifResult] = await Promise.allSettled([
        fetchJobs({ status: 'open' }),
        notifApi.list(),
      ]);
      if (jobsResult.status === 'fulfilled') {
        setRecentJobs(jobsResult.value.jobs.slice(0, 5));
      }
      if (notifResult.status === 'fulfilled') {
        setUnreadNotifCount(notifResult.value.unreadCount ?? 0);
      }
    } catch {
      // Silently fail — home should still load
    } finally {
      setLoadingJobs(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRecentJobs(); }, [loadRecentJobs]);

  const getCategoryColor = (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    return cat?.color ?? KaaryaColors.brand[500];
  };

  const getCategoryIcon = (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    return cat?.icon || 'help-circle';
  };

  const getCategoryName = (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    return cat?.name || categoryId;
  };

  const formatBudget = (job: Job) => {
    if (job.budgetMin && job.budgetMax) {
      return `Rs. ${job.budgetMin.toLocaleString()} – ${job.budgetMax.toLocaleString()}`;
    }
    if (job.budgetMax) return `Up to Rs. ${job.budgetMax.toLocaleString()}`;
    if (job.budgetMin) return `Rs. ${job.budgetMin.toLocaleString()}+`;
    return 'Budget TBD';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-NP', { month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadRecentJobs(true)} tintColor={KaaryaColors.brand[500]} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.userName}>{user?.name ?? 'there'}!</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.bellBtn} onPress={() => router.push('/notifications')}>
              <MaterialCommunityIcons name="bell-outline" size={24} color={KaaryaColors.text} />
              {unreadNotifCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <View style={styles.avatarCircle}>
                <MaterialCommunityIcons name="account" size={28} color="#FFF" />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={[styles.quickActionCard, Shadows.md]}
            onPress={() => router.push('/post-job')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: KaaryaColors.brand[500] + '20' }]}>
              <MaterialCommunityIcons name="plus-circle" size={28} color={KaaryaColors.brand[500]} />
            </View>
            <Text style={styles.quickActionLabel}>Post a Task</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={KaaryaColors.muted} />
          </Pressable>
          <Pressable
            style={[styles.quickActionCard, Shadows.md]}
            onPress={() => router.push('/(tabs)/browse')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: KaaryaColors.success + '20' }]}>
              <MaterialCommunityIcons name="magnify" size={28} color={KaaryaColors.success} />
            </View>
            <Text style={styles.quickActionLabel}>Find Work</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={KaaryaColors.muted} />
          </Pressable>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.slice(0, 8).map((cat) => (
              <CategoryCard key={cat.id} category={cat} onPress={() => router.push(`/browse?category=${cat.id}`)} />
            ))}
          </View>
        </View>

        {/* Recent Jobs Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Tasks</Text>
            <Text style={styles.seeAll} onPress={() => router.push('/(tabs)/browse')}>See all</Text>
          </View>

          {loadingJobs ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptySubtext}>Loading recent tasks...</Text>
            </View>
          ) : recentJobs.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={40} color={KaaryaColors.muted} />
              <Text style={styles.emptyText}>No open tasks yet</Text>
              <Text style={styles.emptySubtext}>Be the first to post one!</Text>
            </View>
          ) : (
            recentJobs.map((job) => (
              <Pressable
                key={job.id}
                style={[styles.recentJobCard, Shadows.sm]}
                onPress={() => router.push(`/job/${job.id}`)}
              >
                <View style={[styles.rjLeft, { backgroundColor: getCategoryColor(job.category) + '20' }]}>
                  <MaterialCommunityIcons
                    name={getCategoryIcon(job.category) as any}
                    size={22}
                    color={getCategoryColor(job.category)}
                  />
                </View>
                <View style={styles.rjContent}>
                  <Text style={styles.rjTitle} numberOfLines={1}>{job.title}</Text>
                  <Text style={styles.rjMeta}>{getCategoryName(job.category)} · {job.area}</Text>
                </View>
                <View style={styles.rjRight}>
                  <Text style={styles.rjBudget}>{formatBudget(job)}</Text>
                  <Text style={styles.rjTime}>{formatDate(job.createdAt)}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function CategoryCard({ category, onPress }: { category: typeof CATEGORIES[0]; onPress: () => void }) {
  return (
    <Pressable style={[styles.categoryCard, Shadows.sm]} onPress={onPress}>
      <View style={[styles.catIconWrap, { backgroundColor: category.color + '20' }]}>
        <MaterialCommunityIcons name={category.icon as any} size={24} color={category.color} />
      </View>
      <Text style={styles.catName} numberOfLines={1}>{category.name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.lg },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bellBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: KaaryaColors.danger,
    borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  bellBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  greeting: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary },
  userName: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: KaaryaColors.brand[500], alignItems: 'center', justifyContent: 'center' },
  quickActions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
  quickActionCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.sm },
  quickActionIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { flex: 1, fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.text },
  section: { marginBottom: Spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text },
  seeAll: { fontSize: FontSizes.sm, color: KaaryaColors.brand[500], fontWeight: '600' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryCard: { width: '23%', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md, padding: Spacing.sm, alignItems: 'center', gap: 6 },
  catIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: 11, fontWeight: '600', color: KaaryaColors.text, textAlign: 'center' },
  emptyCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  emptySubtext: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center' },
  recentJobCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  rjLeft: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rjContent: { flex: 1 },
  rjTitle: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text },
  rjMeta: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  rjRight: { alignItems: 'flex-end' },
  rjBudget: { fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.brand[500] },
  rjTime: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
});
