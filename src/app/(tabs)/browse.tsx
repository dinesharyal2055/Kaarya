import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES, KATHMANDU_AREAS } from '@/constants/categories';
import { fetchJobs } from '@/services/jobs';
import { offersApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Job } from '@/types';

export default function BrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; area?: string }>();
  const { user } = useAuth();

  const selectedCategory = params.category;
  const selectedArea = params.area;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [myOfferJobIds, setMyOfferJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredJobs = searchQuery.trim()
    ? jobs.filter(j =>
        j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (j.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : jobs;

  const loadJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await fetchJobs({ category: selectedCategory, area: selectedArea });
      setJobs(result.jobs);

      if (user?.role === 'provider') {
        try {
          const offers = await offersApi.listMine();
          setMyOfferJobIds(new Set(offers.offers.map(o => o.jobId)));
        } catch {
          setMyOfferJobIds(new Set());
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedArea, user]);

  useFocusEffect(
    useCallback(() => { loadJobs(); }, [loadJobs])
  );
  useEffect(() => { loadJobs(); }, [loadJobs]);

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
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {selectedCategory ? getCategoryName(selectedCategory) : selectedArea ?? 'Browse Jobs'}
          </Text>
          <Text style={styles.subtitle}>
            {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} available
          </Text>
        </View>
        <Pressable style={styles.filterBtn}>
          <MaterialCommunityIcons name="tune-variant" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Search Box */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color={KaaryaColors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search jobs..."
          placeholderTextColor={KaaryaColors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={KaaryaColors.muted} />
          </Pressable>
        )}
      </View>

      {/* Category Pills */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          data={[{ id: 'all', name: 'All', icon: 'view-grid' }, ...CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }))]}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContent}
          renderItem={({ item }) => {
            const isActive = item.id === 'all' ? !selectedCategory : selectedCategory === item.id;
            return (
              <Pressable
                style={[styles.pill, isActive && styles.pillActive]}
                onPress={() => router.push(item.id === 'all' ? '/(tabs)/browse' : `/browse?category=${item.id}`)}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={16}
                  color={isActive ? '#fff' : KaaryaColors.brand[500]}
                />
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{item.name}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Area Pills */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          data={[{ area: 'All Areas' }, ...KATHMANDU_AREAS.map(a => ({ area: a }))]}
          keyExtractor={(item) => item.area}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContent}
          renderItem={({ item }) => {
            const isActive = item.area === 'All Areas' ? !selectedArea : selectedArea === item.area;
            const handleAreaPress = () => {
              if (selectedCategory) {
                if (item.area === 'All Areas') router.push(`/browse?category=${selectedCategory}`);
                else router.push(`/browse?category=${selectedCategory}&area=${item.area}`);
              } else {
                if (item.area === 'All Areas') router.push('/(tabs)/browse');
                else router.push(`/browse?area=${item.area}`);
              }
            };
            return (
              <Pressable
                style={[styles.areaPill, isActive && styles.areaPillActive]}
                onPress={handleAreaPress}
              >
                <MaterialCommunityIcons name="map-marker" size={14} color={isActive ? '#fff' : KaaryaColors.muted} />
                <Text style={[styles.areaPillText, isActive && styles.areaPillTextActive]}>{item.area}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Jobs List */}
      {loading && jobs.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>Loading jobs...</Text>
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
          data={filteredJobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadJobs(true)} tintColor={KaaryaColors.brand[500]} />
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <MaterialCommunityIcons name="briefcase-search" size={64} color={KaaryaColors.muted} />
              <Text style={styles.emptyTitle}>No jobs found</Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : selectedCategory || selectedArea
                  ? 'Try different filters'
                  : 'No open jobs yet. Be the first to post one!'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.jobCard, Shadows.md]}
              onPress={() => router.push(`/job/${item.id}`)}
            >
              <View style={styles.jobHeader}>
                <View style={[styles.catBadge, { backgroundColor: getCategoryColor(item.category) + '20' }]}>
                  <MaterialCommunityIcons
                    name={getCategoryIcon(item.category) as any}
                    size={16}
                    color={getCategoryColor(item.category)}
                  />
                  <Text style={[styles.catBadgeText, { color: getCategoryColor(item.category) }]}>
                    {getCategoryName(item.category)}
                  </Text>
                </View>
                {myOfferJobIds.has(item.id) ? (
                  <View style={[styles.statusBadge, { backgroundColor: KaaryaColors.brand[100] }]}>
                    <Text style={[styles.statusText, { color: KaaryaColors.brand[500] }]}>Offer Sent</Text>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: item.status === 'open' ? KaaryaColors.success + '20' : KaaryaColors.muted + '20' }]}>
                    <Text style={[styles.statusText, { color: item.status === 'open' ? KaaryaColors.success : KaaryaColors.muted }]}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.jobTitle}>{item.title}</Text>
              <Text style={styles.jobDesc} numberOfLines={2}>{item.description}</Text>

              <View style={styles.jobMeta}>
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="map-marker-outline" size={14} color={KaaryaColors.muted} />
                  <Text style={styles.metaText}>{item.area}</Text>
                </View>
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color={KaaryaColors.muted} />
                  <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="gavel" size={14} color={KaaryaColors.muted} />
                  <Text style={styles.metaText}>{item.offerCount ?? 0} bid{item.offerCount !== 1 ? 's' : ''}</Text>
                </View>
              </View>

              <View style={styles.jobFooter}>
                <Text style={styles.budget}>{formatBudget(item)}</Text>
                <Pressable style={styles.viewBtn}>
                  <Text style={styles.viewBtnText}>View Details</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  subtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4 },
  filterBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: KaaryaColors.brand[500],
    alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md, height: 46,
    borderWidth: 1, borderColor: KaaryaColors.border, gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: FontSizes.base, color: KaaryaColors.text, padding: 0 },
  filterSection: { paddingVertical: 6 },
  pillContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingRight: Spacing.lg + 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: KaaryaColors.brand[200], gap: 6,
  },
  pillActive: { backgroundColor: KaaryaColors.brand[500], borderColor: KaaryaColors.brand[500] },
  pillText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.brand[600] },
  pillTextActive: { color: '#fff' },
  areaPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: KaaryaColors.border, gap: 4,
  },
  areaPillActive: { backgroundColor: KaaryaColors.brand[500], borderColor: KaaryaColors.brand[500] },
  areaPillText: { fontSize: FontSizes.xs, fontWeight: '500', color: KaaryaColors.muted },
  areaPillTextActive: { color: '#fff' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted, marginTop: Spacing.md },
  errorTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center' },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },
  jobCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  catBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  catBadgeText: { fontSize: FontSizes.xs, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  jobTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text, marginBottom: 4 },
  jobDesc: { fontSize: FontSizes.sm, color: KaaryaColors.muted, lineHeight: 20, marginBottom: Spacing.sm },
  jobMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
  budget: { fontSize: FontSizes.lg, fontWeight: '800', color: KaaryaColors.brand[500] },
  viewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.brand[500], paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 4 },
  viewBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
});
