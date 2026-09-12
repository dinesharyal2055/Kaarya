/**
 * Browse screen — job listing with advanced filters
 */
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES, KATHMANDU_AREAS } from '@/constants/categories';
import { fetchJobs } from '@/services/jobs';
import { offersApi } from '@/lib/api';
import { parseServerTime, formatNepalShort } from '@/lib/time';
import { useAuth } from '@/context/AuthContext';
import type { Job } from '@/types';

// ─── Filter state ──────────────────────────────────────────────────────────────
interface Filters {
  budgetMin: string;
  budgetMax: string;
  sortBy: 'newest' | 'oldest' | 'price_low' | 'price_high';
}

const BUDGET_PRESETS = [
  { label: 'Under Rs. 500',      min: 0,     max: 500 },
  { label: 'Rs. 500 – 1,000',    min: 500,   max: 1000 },
  { label: 'Rs. 1,000 – 3,000',  min: 1000,  max: 3000 },
  { label: 'Rs. 3,000 – 5,000',  min: 3000,  max: 5000 },
  { label: 'Rs. 5,000+',         min: 5000,  max: undefined },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const getCategoryColor = (categoryId: string) =>
  CATEGORIES.find(c => c.id === categoryId)?.color ?? KaaryaColors.brand[500];

const getCategoryIcon = (categoryId: string) =>
  CATEGORIES.find(c => c.id === categoryId)?.icon || 'help-circle';

const getCategoryName = (categoryId: string) =>
  CATEGORIES.find(c => c.id === categoryId)?.name || categoryId;

const formatBudget = (job: Job) => {
  if (job.budgetMin && job.budgetMax)
    return `Rs. ${job.budgetMin.toLocaleString()} – ${job.budgetMax.toLocaleString()}`;
  if (job.budgetMax) return `Up to Rs. ${job.budgetMax.toLocaleString()}`;
  if (job.budgetMin) return `Rs. ${job.budgetMin.toLocaleString()}+`;
  return 'Budget TBD';
};

const formatDate = (dateStr: string, t: (key: string, opts?: object) => string) => {
  const ms = parseServerTime(dateStr);
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return t('common.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t('common.daysAgo', { count: Math.floor(diff / 86400) });
  return formatNepalShort(ms);
};

// ─── Job Card ─────────────────────────────────────────────────────────────────
function JobCard({ item, myOfferJobIds, onPress, t }: {
  item: Job;
  myOfferJobIds: Set<string>;
  onPress: () => void;
  t: (key: string) => string;
}) {
  const catColor = getCategoryColor(item.category);
  const hasOffer = myOfferJobIds.has(item.id);

  return (
    <Pressable style={[styles.jobCard, Shadows.md]} onPress={onPress}>
      <View style={styles.jobHeader}>
        <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
          <MaterialCommunityIcons
            name={getCategoryIcon(item.category) as any}
            size={14}
            color={catColor}
          />
          <Text style={[styles.catBadgeText, { color: catColor }]}>
            {getCategoryName(item.category)}
          </Text>
        </View>
        {hasOffer ? (
          <View style={[styles.statusBadge, { backgroundColor: KaaryaColors.brand[100] }]}>
            <Text style={[styles.statusText, { color: KaaryaColors.brand[500] }]}>{t('browse.offerSent')}</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, {
            backgroundColor: item.status === 'open'
              ? KaaryaColors.success + '20'
              : KaaryaColors.muted + '20'
          }]}>
            <Text style={[styles.statusText, {
              color: item.status === 'open' ? KaaryaColors.success : KaaryaColors.muted
            }]}>
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
          <Text style={styles.metaText}>{formatDate(item.createdAt, t)}</Text>
        </View>
        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="gavel" size={14} color={KaaryaColors.muted} />
          <Text style={styles.metaText}>
            {item.offerCount ?? 0} {item.offerCount !== 1 ? t('browse.bids') : t('browse.bid')}
          </Text>
        </View>
      </View>

      <View style={styles.jobFooter}>
        <Text style={styles.budget}>{formatBudget(item)}</Text>
        <Pressable style={styles.viewBtn} onPress={onPress}>
          <Text style={styles.viewBtnText}>{t('browse.viewDetails')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Filter Sheet ─────────────────────────────────────────────────────────────
function FilterSheet({ visible, filters, onClose, onApply, t }: {
  visible: boolean;
  filters: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
  t: (key: string) => string;
}) {
  const [local, setLocal] = useState<Filters>(filters);

  const SORT_OPTIONS = [
    { value: 'newest' as const,     label: t('browse.sortNewest') },
    { value: 'oldest' as const,     label: t('browse.sortOldest') },
    { value: 'price_low' as const,  label: t('browse.sortPriceLow') },
    { value: 'price_high' as const, label: t('browse.sortPriceHigh') },
  ];

  const applyPreset = (min?: number, max?: number) => {
    setLocal({
      ...local,
      budgetMin: min === undefined ? '' : String(min),
      budgetMax: max === undefined ? '' : String(max),
    });
  };

  const clearPrice = () => setLocal(l => ({ ...l, budgetMin: '', budgetMax: '' }));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={() => setLocal(filters)}
      onRequestClose={onClose}
    >
      <View style={fs.overlay}>
        <Pressable style={fs.backdrop} onPress={onClose} />
        <View style={fs.sheet}>
          <View style={fs.handleRow}>
            <View style={fs.handle} />
            <Pressable style={fs.dismissBtn} onPress={onClose} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={20} color={KaaryaColors.muted} />
            </Pressable>
          </View>
          <View style={fs.header}>
            <Text style={fs.title}>{t('common.filters')}</Text>
          </View>
          <ScrollView style={fs.body} showsVerticalScrollIndicator={false}>
            <Text style={fs.sectionLabel}>{t('browse.sortBy')}</Text>
            <View style={fs.sortGrid}>
              {SORT_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[fs.chip, local.sortBy === opt.value && fs.chipActive]}
                  onPress={() => setLocal(l => ({ ...l, sortBy: opt.value }))}
                >
                  <Text style={[fs.chipText, local.sortBy === opt.value && fs.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={fs.sectionLabel}>{t('browse.budgetRange')}</Text>
            <View style={fs.presetGrid}>
              {BUDGET_PRESETS.map(p => {
                const minMatch = local.budgetMin === String(p.min);
                const maxMatch = p.max === undefined
                  ? local.budgetMax === ''
                  : local.budgetMax === String(p.max);
                const active = minMatch && maxMatch;
                return (
                  <Pressable
                    key={p.label}
                    style={[fs.presetChip, active && fs.presetChipActive]}
                    onPress={() => applyPreset(p.min, p.max)}
                  >
                    <Text style={[fs.presetText, active && fs.presetTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={fs.sectionLabel}>{t('browse.customRange')}</Text>
            <View style={fs.rangeRow}>
              <View style={fs.rangeInput}>
                <Text style={fs.rangeLabel}>{t('browse.minRs')}</Text>
                <TextInput
                  style={fs.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={KaaryaColors.muted}
                  value={local.budgetMin}
                  onChangeText={v => setLocal(l => ({ ...l, budgetMin: v.replace(/\D/g, '') }))}
                />
              </View>
              <Text style={fs.rangeSep}>—</Text>
              <View style={fs.rangeInput}>
                <Text style={fs.rangeLabel}>{t('browse.maxRs')}</Text>
                <TextInput
                  style={fs.input}
                  keyboardType="numeric"
                  placeholder="Any"
                  placeholderTextColor={KaaryaColors.muted}
                  value={local.budgetMax}
                  onChangeText={v => setLocal(l => ({ ...l, budgetMax: v.replace(/\D/g, '') }))}
                />
              </View>
            </View>
            {(local.budgetMin || local.budgetMax) && (
              <Pressable onPress={clearPrice}>
                <Text style={fs.clearLink}>{t('browse.clearPriceFilter')}</Text>
              </Pressable>
            )}
          </ScrollView>
          <View style={fs.footer}>
            <Pressable
              style={fs.resetBtn}
              onPress={() => setLocal({ budgetMin: '', budgetMax: '', sortBy: 'newest' })}
            >
              <Text style={fs.resetText}>{t('common.reset')}</Text>
            </Pressable>
            <Pressable
              style={fs.applyBtn}
              onPress={() => { onApply(local); onClose(); }}
            >
              <Text style={fs.applyText}>{t('browse.showResults')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function BrowseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; area?: string }>();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [myOfferJobIds, setMyOfferJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    budgetMin: '',
    budgetMax: '',
    sortBy: 'newest',
  });

  const hasActiveFilters =
    !!(filters.budgetMin || filters.budgetMax || filters.sortBy !== 'newest');

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
      const result = await fetchJobs({
        category: params.category,
        area: params.area,
        budgetMin: filters.budgetMin ? Number(filters.budgetMin) : undefined,
        budgetMax: filters.budgetMax ? Number(filters.budgetMax) : undefined,
        sortBy: filters.sortBy,
      });
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
      setError(e.message ?? t('browse.failedToLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.category, params.area, filters.budgetMin, filters.budgetMax, filters.sortBy, user]);

  useFocusEffect(
    useCallback(() => {
      loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadJobs])
  );

  const handleApplyFilters = (f: Filters) => {
    setFilters(f);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {params.category ? getCategoryName(params.category) : params.area ?? t('browse.title')}
          </Text>
          <Text style={styles.subtitle}>
            {t('browse.jobsCount', { count: filteredJobs.length })}
          </Text>
        </View>
        <Pressable
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
        >
          <MaterialCommunityIcons name="tune-variant" size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color={KaaryaColors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('browse.searchPlaceholder')}
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

      <View style={styles.filterSection}>
        <FlatList
          horizontal
          data={[
            { id: 'all', name: t('browse.all'), icon: 'view-grid' },
            ...CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color })),
          ]}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContent}
          renderItem={({ item }) => {
            const isActive = item.id === 'all'
              ? !params.category
              : params.category === item.id;
            return (
              <Pressable
                style={[styles.pill, isActive && styles.pillActive]}
                onPress={() => router.push(
                  item.id === 'all' ? '/(tabs)/browse' : `/browse?category=${item.id}`
                )}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={16}
                  color={isActive ? '#fff' : KaaryaColors.brand[500]}
                />
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.filterSection}>
        <FlatList
          horizontal
          data={[{ area: t('browse.allAreas') }, ...KATHMANDU_AREAS.map(a => ({ area: a }))]}
          keyExtractor={(item) => item.area}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContent}
          renderItem={({ item }) => {
            const isActive = item.area === t('browse.allAreas')
              ? !params.area
              : params.area === item.area;
            const handlePress = () => {
              if (params.category) {
                if (item.area === t('browse.allAreas')) router.push(`/browse?category=${params.category}`);
                else router.push(`/browse?category=${params.category}&area=${item.area}`);
              } else {
                if (item.area === t('browse.allAreas')) router.push('/(tabs)/browse');
                else router.push(`/browse?area=${item.area}`);
              }
            };
            return (
              <Pressable
                style={[styles.areaPill, isActive && styles.areaPillActive]}
                onPress={handlePress}
              >
                <MaterialCommunityIcons
                  name="map-marker"
                  size={14}
                  color={isActive ? '#fff' : KaaryaColors.muted}
                />
                <Text style={[styles.areaPillText, isActive && styles.areaPillTextActive]}>
                  {item.area}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading && jobs.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>{t('browse.loadingJobs')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={KaaryaColors.danger} />
          <Text style={styles.errorTitle}>{t('common.loadingFailed')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadJobs()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadJobs(true)}
              tintColor={KaaryaColors.brand[500]}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <MaterialCommunityIcons name="briefcase-search" size={64} color={KaaryaColors.muted} />
              <Text style={styles.emptyTitle}>{t('browse.noJobsFound')}</Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? t('common.noResults')
                  : t('browse.tryDifferentFilters')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <JobCard
              item={item}
              myOfferJobIds={myOfferJobIds}
              onPress={() => router.push(`/job/${item.id}`)}
              t={t}
            />
          )}
        />
      )}

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onClose={() => setShowFilters(false)}
        onApply={handleApplyFilters}
        t={t}
      />
    </SafeAreaView>
  );
}

const fs = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '82%',
  },
  handleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingTop: 14, paddingHorizontal: Spacing.lg, paddingBottom: 4,
  },
  handle: { flex: 1, height: 4, backgroundColor: KaaryaColors.border, borderRadius: 2 },
  dismissBtn: { marginLeft: Spacing.md, padding: 4 },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: KaaryaColors.border,
  },
  title: { fontSize: FontSizes.xl, fontWeight: '800', color: KaaryaColors.text },
  body: { paddingHorizontal: Spacing.lg },
  sectionLabel: {
    fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.text,
    marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  sortGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
    borderColor: KaaryaColors.border, backgroundColor: KaaryaColors.card,
  },
  chipActive: { backgroundColor: KaaryaColors.brand[500], borderColor: KaaryaColors.brand[500] },
  chipText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text },
  chipTextActive: { color: '#fff' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  presetChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1,
    borderColor: KaaryaColors.border, backgroundColor: KaaryaColors.card,
  },
  presetChipActive: { backgroundColor: KaaryaColors.brand[500], borderColor: KaaryaColors.brand[500] },
  presetText: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.text },
  presetTextActive: { color: '#fff' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rangeInput: { flex: 1 },
  rangeLabel: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: KaaryaColors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.base,
    color: KaaryaColors.text, backgroundColor: KaaryaColors.card,
  },
  rangeSep: { fontSize: FontSizes.xl, color: KaaryaColors.muted, marginTop: 20 },
  clearLink: {
    fontSize: FontSizes.sm, color: KaaryaColors.danger, marginTop: Spacing.sm,
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border,
  },
  resetBtn: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: KaaryaColors.border,
  },
  resetText: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  applyBtn: {
    flex: 1, backgroundColor: KaaryaColors.brand[500], paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, alignItems: 'center',
  },
  applyText: { fontSize: FontSizes.base, fontWeight: '700', color: '#fff' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  subtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4 },
  filterBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: KaaryaColors.brand[500],
    alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm,
  },
  filterBtnActive: { backgroundColor: KaaryaColors.success },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md, height: 46,
    borderWidth: 1, borderColor: KaaryaColors.border, gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: FontSizes.base, color: KaaryaColors.text, padding: 0 },
  activeFilters: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: 6,
  },
  filterChip: {
    backgroundColor: KaaryaColors.brand[100], borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  filterChipText: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.brand[500] },
  clearAllText: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.danger },
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
  retryBtn: {
    marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500],
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
  },
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
  jobMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  jobFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: KaaryaColors.border,
  },
  budget: { fontSize: FontSizes.lg, fontWeight: '800', color: KaaryaColors.brand[500] },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.brand[500],
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 4,
  },
  viewBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
});
