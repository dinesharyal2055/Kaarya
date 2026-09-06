/**
 * Jobs screen — Ongoing, Posted, and Saved Jobs
 * Providers: Ongoing + Saved tabs
 * Seekers: Posted + Ongoing tabs
 */

import { useRouter, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES } from '@/constants/categories';
import { jobsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Job } from '@/types';

type ActiveTab = 'posted' | 'ongoing' | 'saved';

export default function JobsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('posted');

  const isProvider = user?.role === 'provider';

  // ── Posted jobs (seekers only — all jobs they have posted) ─────────
  const [postedJobs, setPostedJobs] = useState<Job[]>([]);
  const [postedLoading, setPostedLoading] = useState(true);
  const [postedRefreshing, setPostedRefreshing] = useState(false);
  const [postedError, setPostedError] = useState('');

  const loadPosted = useCallback(async (isRefresh = false) => {
    if (isRefresh) setPostedRefreshing(true);
    else setPostedLoading(true);
    setPostedError('');
    try {
      const result = await jobsApi.postedList();
      setPostedJobs(result.jobs);
    } catch (e: any) {
      setPostedError(e.message ?? t('jobs.loadFailed'));
    } finally {
      setPostedLoading(false);
      setPostedRefreshing(false);
    }
  }, [t]);

  // ── Ongoing jobs ──────────────────────────────────────────────────
  const [ongoingJobs, setOngoingJobs] = useState<Job[]>([]);
  const [ongoingLoading, setOngoingLoading] = useState(true);
  const [ongoingRefreshing, setOngoingRefreshing] = useState(false);
  const [ongoingError, setOngoingError] = useState('');

  const loadOngoing = useCallback(async (isRefresh = false) => {
    if (isRefresh) setOngoingRefreshing(true);
    else setOngoingLoading(true);
    setOngoingError('');
    try {
      const result = await jobsApi.ongoing();
      setOngoingJobs(result.jobs);
    } catch (e: any) {
      setOngoingError(e.message ?? t('jobs.loadFailed'));
    } finally {
      setOngoingLoading(false);
      setOngoingRefreshing(false);
    }
  }, [t]);

  // ── Saved jobs ───────────────────────────────────────────────────
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedRefreshing, setSavedRefreshing] = useState(false);
  const [savedError, setSavedError] = useState('');

  const loadSaved = useCallback(async (isRefresh = false) => {
    if (!isProvider) return;
    if (isRefresh) setSavedRefreshing(true);
    else setSavedLoading(true);
    setSavedError('');
    try {
      const result = await jobsApi.savedList();
      setSavedJobs(result.jobs);
    } catch (e: any) {
      setSavedError(e.message ?? t('jobs.loadFailed'));
    } finally {
      setSavedLoading(false);
      setSavedRefreshing(false);
    }
  }, [isProvider, t]);

  useFocusEffect(
    useCallback(() => {
      if (isProvider) {
        setActiveTab('ongoing');
        loadOngoing();
        loadSaved();
      } else {
        setActiveTab('posted');
        loadPosted();
        loadOngoing();
      }
    }, [isProvider, loadPosted, loadOngoing, loadSaved])
  );

  const getCategoryColor = (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    return cat?.color ?? KaaryaColors.brand[500];
  };

  const getCategoryIcon = (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    return cat?.icon || 'help-circle';
  };

  const formatBudget = (job: Job) => {
    if (job.agreedAmount) return `Rs. ${job.agreedAmount.toLocaleString()}`;
    if (job.budgetMin && job.budgetMax) return `Rs. ${job.budgetMin.toLocaleString()} – ${job.budgetMax.toLocaleString()}`;
    if (job.budgetMax) return `Up to Rs. ${job.budgetMax.toLocaleString()}`;
    if (job.budgetMin) return `Rs. ${job.budgetMin.toLocaleString()}+`;
    return t('jobDetail.budgetTbd');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return t('common.justNow');
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${t('common.ago')}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${t('common.ago')}`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ${t('common.ago')}`;
    return d.toLocaleDateString('en-NP', { month: 'short', day: 'numeric' });
  };

  // ── Posted job card (seekers) ──────────────────────────────────────
  const renderPostedJob = ({ item: job }: { item: Job }) => {
    const statusKey = job.status;
    const statusMap: { [key: string]: { label: string; color: string; icon: string } } = {
      open:        { label: t('jobs.status.open'),       color: KaaryaColors.success,   icon: 'help-circle' },
      assigned:    { label: t('jobs.status.assigned'),  color: KaaryaColors.warning,   icon: 'clock-check' },
      in_progress: { label: t('jobs.status.inProgress'),color: KaaryaColors.brand[500],icon: 'progress-wrench' },
      completed:   { label: t('jobs.status.completed'), color: KaaryaColors.success,   icon: 'check-circle' },
      cancelled:   { label: t('jobs.status.cancelled'),color: KaaryaColors.danger,   icon: 'close-circle' },
    };
    const cfg = statusMap[statusKey] ?? { label: job.status, color: KaaryaColors.muted, icon: 'help-circle' };
    const catColor = getCategoryColor(job.category);

    return (
      <View style={[styles.jobCard, Shadows.md]}>
        <Pressable style={styles.cardBody} onPress={() => router.push(`/job/${job.id}`)}>
          <View style={styles.jobHeader}>
            <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
              <MaterialCommunityIcons name={getCategoryIcon(job.category) as any} size={14} color={catColor} />
            </View>
            <View style={[styles.statusBadge, { backgroundColor: cfg.color + '20' }]}>
              <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.jobDesc} numberOfLines={1}>{job.description}</Text>
          <View style={styles.jobMeta}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={KaaryaColors.muted} />
              <Text style={styles.metaText}>{job.area}</Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={KaaryaColors.muted} />
              <Text style={styles.metaText}>{formatDate(job.createdAt)}</Text>
            </View>
            {job.offerCount !== undefined && job.offerCount > 0 && (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="tag" size={14} color={KaaryaColors.brand[500]} />
                <Text style={[styles.metaText, { color: KaaryaColors.brand[500] }]}>
                  {job.offerCount} bid{job.offerCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
        <View style={styles.jobFooter}>
          <View>
            <Text style={styles.budget}>{formatBudget(job)}</Text>
            <Text style={styles.roleLabel}>{t('jobs.youPosted')}</Text>
          </View>
          <Pressable style={styles.viewBtn} onPress={() => router.push(`/job/${job.id}`)}>
            <Text style={styles.viewBtnText}>{t('common.view')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Ongoing job card ────────────────────────────────────────────
  const renderOngoingJob = ({ item: job }: { item: Job }) => {
    const statusKey = job.status;
    const statusMap: { [key: string]: { label: string; color: string; icon: string } } = {
      assigned:    { label: t('jobs.status.assigned'),    color: KaaryaColors.warning,   icon: 'clock-check' },
      in_progress: { label: t('jobs.status.inProgress'), color: KaaryaColors.brand[500], icon: 'progress-wrench' },
      completed:   { label: t('jobs.status.completed'),  color: KaaryaColors.success,   icon: 'check-circle' },
    };
    const cfg = statusMap[statusKey] ?? { label: job.status, color: KaaryaColors.muted, icon: 'help-circle' };
    const catColor = getCategoryColor(job.category);
    const myRole = job.userRole === 'provider' ? 'provider' : 'seeker';

    return (
      <View style={[styles.jobCard, Shadows.md]}>
        <Pressable style={styles.cardBody} onPress={() => router.push(`/job/${job.id}`)}>
          <View style={styles.jobHeader}>
            <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
              <MaterialCommunityIcons name={getCategoryIcon(job.category) as any} size={14} color={catColor} />
            </View>
            <View style={[styles.statusBadge, { backgroundColor: cfg.color + '20' }]}>
              <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.jobDesc} numberOfLines={1}>{job.description}</Text>
          <View style={styles.jobMeta}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={KaaryaColors.muted} />
              <Text style={styles.metaText}>{job.area}</Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={KaaryaColors.muted} />
              <Text style={styles.metaText}>{formatDate(job.updatedAt ?? job.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
        <View style={styles.jobFooter}>
          <View>
            <Text style={styles.budget}>{formatBudget(job)}</Text>
            <Text style={styles.roleLabel}>
              {myRole === 'provider' ? t('jobs.youAreProviding') : t('jobs.youPosted')}
            </Text>
          </View>
          <Pressable style={styles.viewBtn} onPress={() => router.push(`/job/${job.id}`)}>
            <Text style={styles.viewBtnText}>{t('common.view')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Saved job card ──────────────────────────────────────────────
  const renderSavedJob = ({ item: job }: { item: Job }) => {
    const catColor = getCategoryColor(job.category);

    return (
      <View style={[styles.jobCard, Shadows.md]}>
        <Pressable style={styles.cardBody} onPress={() => router.push(`/job/${job.id}`)}>
          <View style={styles.jobHeader}>
            <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
              <MaterialCommunityIcons name={getCategoryIcon(job.category) as any} size={14} color={catColor} />
            </View>
            <View style={[styles.statusBadge, { backgroundColor: KaaryaColors.success + '20' }]}>
              <MaterialCommunityIcons name="bookmark" size={12} color={KaaryaColors.success} />
              <Text style={[styles.statusText, { color: KaaryaColors.success }]}>{t('jobs.saved')}</Text>
            </View>
          </View>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.jobDesc} numberOfLines={1}>{job.description}</Text>
          <View style={styles.jobMeta}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={KaaryaColors.muted} />
              <Text style={styles.metaText}>{job.area}</Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={KaaryaColors.muted} />
              <Text style={styles.metaText}>{formatDate(job.savedAt ?? job.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
        <View style={styles.jobFooter}>
          <Text style={styles.budget}>{formatBudget(job)}</Text>
          <Pressable style={styles.viewBtn} onPress={() => router.push(`/job/${job.id}`)}>
            <Text style={styles.viewBtnText}>{t('common.view')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Resolver helpers ────────────────────────────────────────────
  const allJobs = { posted: postedJobs, ongoing: ongoingJobs, saved: savedJobs };
  const allLoading = { posted: postedLoading, ongoing: ongoingLoading, saved: savedLoading };
  const allRefreshing = { posted: postedRefreshing, ongoing: ongoingRefreshing, saved: savedRefreshing };
  const allError = { posted: postedError, ongoing: ongoingError, saved: savedError };
  const allLoadFns: Record<ActiveTab, (isRefresh?: boolean) => void> = {
    posted: loadPosted,
    ongoing: loadOngoing,
    saved: loadSaved,
  };
  const renderers: Record<ActiveTab, (props: { item: Job }) => React.ReactElement> = {
    posted: renderPostedJob,
    ongoing: renderOngoingJob,
    saved: renderSavedJob,
  };

  const jobs = allJobs[activeTab];
  const loading = allLoading[activeTab];
  const refreshing = allRefreshing[activeTab];
  const error = allError[activeTab];
  const renderItem = renderers[activeTab];

  // Tabs: seekers get Posted + Ongoing; providers get Ongoing + Saved
  const seekerTabs: ActiveTab[] = ['posted', 'ongoing'];
  const providerTabs: ActiveTab[] = ['ongoing', 'saved'];
  const tabs = isProvider ? providerTabs : seekerTabs;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('jobs.title')}</Text>
        <View style={styles.tabSelector}>
          {tabs.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab);
                const tabJobs = allJobs[tab];
                if (tabJobs.length === 0 && !allLoading[tab]) {
                  allLoadFns[tab]();
                }
              }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'posted' ? t('jobs.posted') : tab === 'ongoing' ? t('jobs.ongoing') : t('jobs.saved')}
              </Text>
              {tab === 'saved' && savedJobs.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{savedJobs.length}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {loading && jobs.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>
            {activeTab === 'posted' ? t('jobs.loadingPosted') : activeTab === 'ongoing' ? t('jobs.loadingJobs') : t('jobs.loadingSaved')}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={KaaryaColors.danger} />
          <Text style={styles.errorTitle}>{t('common.loadingFailed')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => allLoadFns[activeTab]()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => allLoadFns[activeTab](true)}
              tintColor={KaaryaColors.brand[500]}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              {activeTab === 'posted' ? (
                <>
                  <MaterialCommunityIcons name="plus-circle-outline" size={64} color={KaaryaColors.muted} />
                  <Text style={styles.emptyTitle}>{t('jobs.noPostedJobs')}</Text>
                  <Text style={styles.emptyText}>{t('jobs.noPostedJobsHint')}</Text>
                </>
              ) : activeTab === 'ongoing' ? (
                <>
                  <MaterialCommunityIcons name="clipboard-list-outline" size={64} color={KaaryaColors.muted} />
                  <Text style={styles.emptyTitle}>{t('jobs.noActiveJobs')}</Text>
                  <Text style={styles.emptyText}>{t('jobs.noActiveJobsHint')}</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="bookmark-outline" size={64} color={KaaryaColors.muted} />
                  <Text style={styles.emptyTitle}>{t('jobs.noSavedJobs')}</Text>
                  <Text style={styles.emptyText}>{t('jobs.noSavedJobsHint')}</Text>
                </>
              )}
            </View>
          }
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted, marginTop: Spacing.md },
  errorTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },
  jobCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  cardBody: { padding: Spacing.lg },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  catBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  jobTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text, marginBottom: 4 },
  jobDesc: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginBottom: Spacing.sm },
  jobMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
  budget: { fontSize: FontSizes.lg, fontWeight: '800', color: KaaryaColors.brand[500] },
  roleLabel: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.brand[500], paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 4 },
  viewBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
  tabSelector: { flexDirection: 'row', marginTop: Spacing.md, backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: BorderRadius.sm, gap: 4 },
  tabActive: { backgroundColor: KaaryaColors.brand[500] },
  tabText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.muted },
  tabTextActive: { color: '#fff' },
  badge: { backgroundColor: KaaryaColors.brand[500], borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
});
