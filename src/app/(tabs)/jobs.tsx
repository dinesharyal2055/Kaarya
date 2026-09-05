/**
 * Ongoing Jobs screen — shows assigned, in_progress, and completed jobs
 * for both seekers and providers
 */

import { useRouter, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES } from '@/constants/categories';
import { jobsApi } from '@/lib/api';
import type { Job } from '@/types';

const STATUS_CONFIG = {
  assigned:      { label: 'Assigned',       color: KaaryaColors.warning, icon: 'clock-check' },
  in_progress:   { label: 'In Progress',   color: KaaryaColors.brand[500], icon: 'progress-wrench' },
  completed:     { label: 'Completed',     color: KaaryaColors.success,   icon: 'check-circle' },
} as const;

export default function JobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await jobsApi.ongoing();
      setJobs(result.jobs);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { loadJobs(); }, [loadJobs])
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

  const renderJob = ({ item: job }: { item: Job }) => {
    const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG];
    const catColor = getCategoryColor(job.category);
    const myRole = job.userRole === 'provider' ? 'provider' : 'seeker';

    return (
      <Pressable
        style={[styles.jobCard, Shadows.md]}
        onPress={() => router.push(`/job/${job.id}`)}
      >
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

        <View style={styles.jobFooter}>
          <View>
            <Text style={styles.budget}>{formatBudget(job)}</Text>
            <Text style={styles.roleLabel}>
              {myRole === 'provider' ? 'You are providing service' : 'You posted this job'}
            </Text>
          </View>
          <Pressable style={styles.viewBtn}>
            <Text style={styles.viewBtnText}>View</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Jobs</Text>
        <Text style={styles.subtitle}>
          {jobs.length} job{jobs.length !== 1 ? 's' : ''} ongoing
        </Text>
      </View>

      {loading && jobs.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>Loading your jobs...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={KaaryaColors.danger} />
          <Text style={styles.errorTitle}>Failed to load</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadJobs()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadJobs(true)} tintColor={KaaryaColors.brand[500]} />
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={64} color={KaaryaColors.muted} />
              <Text style={styles.emptyTitle}>No active jobs</Text>
              <Text style={styles.emptyText}>
                When you accept a provider's bid or have your bid accepted,{'\n'}jobs will appear here.
              </Text>
            </View>
          }
          renderItem={renderJob}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  subtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted, marginTop: Spacing.md },
  errorTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },
  jobCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  catBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  jobTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text, marginBottom: 4 },
  jobDesc: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginBottom: Spacing.sm },
  jobMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
  budget: { fontSize: FontSizes.lg, fontWeight: '800', color: KaaryaColors.brand[500] },
  roleLabel: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.brand[500], paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 4 },
  viewBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
});
