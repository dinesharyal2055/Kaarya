/**
 * Job detail screen — shows full job info and CTA
 */

import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES } from '@/constants/categories';
import { fetchJob } from '@/services/jobs';
import { offersApi, reviewsApi, jobsApi } from '@/lib/api';
import { Button } from '@/components/ui';
import type { Job } from '@/types';

const BASE_URL = 'http://192.168.1.79:5000';

export default function JobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [myOffer, setMyOffer] = useState<any>(null);     // provider's own offer on this job
  const [receivedOffers, setReceivedOffers] = useState<any[]>([]); // seeker's received offers
  const [hasReviewed, setHasReviewed] = useState(false);          // current user already reviewed this job
  const [actionLoading, setActionLoading] = useState(false);       // CTA loading state
  const [isSaved, setIsSaved] = useState(false);                 // save state
  const [saveLoading, setSaveLoading] = useState(false);          // save button loading

  // True when the logged-in user is the seeker who posted this job (compares DB int to JWT string)
  const isSeekerOwner = !!(user && job && String(job.seekerId as any) === user.id);

  // i18n
  const { t } = useTranslation();

  // Open native Maps with seeker's coordinates
  const openMaps = (lat: number, lng: number) => {
    const scheme = Platform.select({
      ios: `maps://?ll=${lat},${lng}&q=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}`,
    });
    if (scheme) Linking.openURL(scheme);
  };

  const loadJob = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await fetchJob(id);
      setJob(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load job');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const loadSaveStatus = useCallback(async () => {
    if (!job || user?.role !== 'provider') return;
    try {
      const result = await jobsApi.isSaved(job.id);
      setIsSaved(result.saved);
    } catch {
      setIsSaved(false);
    }
  }, [job, user]);

  const loadOfferStatus = useCallback(async () => {
    if (!job) return;
    if (user?.role === 'provider') {
      // Provider: check if they already bid on this job
      try {
        const result = await offersApi.listForJob(job.id);
        const mine = result.offers.find((o) => o.providerId === user.id);
        setMyOffer(mine ?? null);
      } catch {
        setMyOffer(null);
      }
    } else if (user?.role === 'seeker') {
      // Seeker: load received offers for this job
      try {
        const result = await offersApi.listReceived();
        const mine = result.offers.filter((o) => o.jobId === job.id);
        setReceivedOffers(mine);
      } catch {
        setReceivedOffers([]);
      }
    }

    // Check if current user already reviewed this job (only for completed jobs)
    if (job.status === 'completed' && user) {
      try {
        const result = await reviewsApi.forJob(job.id);
        const myReview = result.reviews.find((r) => r.reviewerId === user.id);
        setHasReviewed(!!myReview);
      } catch {
        setHasReviewed(false);
      }
    }
  }, [user, job]);

  // Load job on mount
  useEffect(() => { loadJob(); }, [loadJob]);

  // Load offer status + save status after job is loaded and whenever screen refocuses
  useEffect(() => { if (job) { loadOfferStatus(); loadSaveStatus(); } }, [job, loadOfferStatus, loadSaveStatus]);

  useFocusEffect(
    useCallback(() => {
      if (job) { loadOfferStatus(); loadSaveStatus(); }
    }, [job, loadOfferStatus, loadSaveStatus])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !job) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorState}>
          <MaterialCommunityIcons name="alert-circle" size={64} color={KaaryaColors.danger} />
          <Text style={styles.errorTitle}>Job not found</Text>
          <Text style={styles.errorText}>{error || 'This job may have been removed.'}</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const catData = CATEGORIES.find((c) => c.id === job.category);
  const catColor = catData?.color ?? KaaryaColors.brand[500];

  const formatBudget = () => {
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
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    return d.toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const statusColor = job.status === 'open'
    ? KaaryaColors.success
    : job.status === 'in_progress'
    ? KaaryaColors.warning
    : KaaryaColors.muted;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Task Details</Text>
          {user?.role === 'provider' && job.status === 'open' ? (
            <Pressable
              onPress={async () => {
                if (!user) return;
                setSaveLoading(true);
                try {
                  const result = await jobsApi.toggleSave(job.id);
                  setIsSaved(result.saved);
                } catch (e: any) {
                  Alert.alert('Error', e.message ?? 'Failed to save job');
                } finally {
                  setSaveLoading(false);
                }
              }}
              style={styles.saveBtn}
              disabled={saveLoading}
            >
              <MaterialCommunityIcons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={isSaved ? KaaryaColors.brand[500] : KaaryaColors.muted}
              />
            </Pressable>
          ) : user?.role === 'seeker' && isSeekerOwner && job.status === 'open' ? (
            <Pressable
              onPress={() => router.push({ pathname: '/edit-job', params: { id: job.id } })}
              style={styles.saveBtn}
            >
              <MaterialCommunityIcons name="pencil" size={22} color={KaaryaColors.brand[500]} />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadJob(true)} tintColor={KaaryaColors.brand[500]} />
          }
        >
          {/* Category badge */}
          {catData && (
            <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
              <MaterialCommunityIcons name={catData.icon as any} size={16} color={catColor} />
              <Text style={[styles.catBadgeText, { color: catColor }]}>{catData.name}</Text>
            </View>
          )}

          {/* Title & Status */}
          <Text style={styles.title}>{job.title}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace('_', ' ')}
              </Text>
            </View>
            <Text style={styles.postedAt}>{formatDate(job.createdAt)}</Text>
          </View>

          {/* Photos */}
          {job.photoUrls && job.photoUrls.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoGallery}
              contentContainerStyle={styles.photoGalleryContent}
            >
              {job.photoUrls.map((url, index) => (
                <View key={index} style={styles.photoFrame}>
                  <Image
                    source={{ uri: `${BASE_URL}${url}` }}
                    style={styles.photoThumb}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>
          )}

          {/* Budget */}
          <View style={[styles.budgetCard, Shadows.sm]}>
            <MaterialCommunityIcons name="currency-inr" size={24} color={KaaryaColors.brand[500]} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.budgetLabel}>Budget Range</Text>
              <Text style={styles.budgetValue}>{formatBudget()}</Text>
            </View>
          </View>

          {/* Description */}
          {job.description && (
            <View style={[styles.section, Shadows.sm]}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descText}>{job.description}</Text>
            </View>
          )}

          {/* Location */}
          <View style={[styles.section, Shadows.sm]}>
            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker" size={18} color={KaaryaColors.brand[500]} />
              <Text style={styles.locationText}>{job.area}, Kathmandu</Text>
            </View>
            {job.seekerLat != null && job.seekerLng != null &&
              user?.role === 'provider' &&
              job.acceptedOffer?.providerId === user?.id ? (
              <Pressable
                style={styles.viewLocationBtn}
                onPress={() => openMaps(job.seekerLat!, job.seekerLng!)}
              >
                <MaterialCommunityIcons name="navigation" size={16} color="#FFFFFF" />
                <Text style={styles.viewLocationBtnText}>{t('jobDetail.viewLocation')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.locationNote}>{t('jobDetail.locationNotShared')}</Text>
            )}
          </View>

          {/* Seeker */}
          {job.seekerName && (
            <View style={[styles.section, Shadows.sm]}>
              <Text style={styles.sectionTitle}>Posted By</Text>
              <View style={styles.seekerRow}>
                <View style={[styles.avatar, { backgroundColor: catColor }]}>
                  <Text style={styles.avatarText}>{job.seekerName.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.seekerName}>{job.seekerName}</Text>
                  <Text style={styles.seekerPhone}>Job Seeker</Text>
                </View>
              </View>
            </View>
          )}

          {/* Offers summary */}
          <View style={[styles.section, Shadows.sm]}>
            <Text style={styles.sectionTitle}>Offers</Text>
            {user?.role === 'seeker' && isSeekerOwner ? (
              receivedOffers.length > 0 ? (
                <Pressable
                  style={styles.offersAction}
                  onPress={() => router.push('/offers')}
                >
                  <View style={styles.offersInfo}>
                    <Text style={styles.offersCount}>
                      {receivedOffers.length} offer{receivedOffers.length !== 1 ? 's' : ''} received
                    </Text>
                    <Text style={styles.offersSubtext}>Tap to accept or decline</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={KaaryaColors.brand[500]} />
                </Pressable>
              ) : (
                <Text style={styles.emptyText}>No offers yet. Check back soon!</Text>
              )
            ) : (
              <Text style={styles.emptyText}>
                {job.offerCount && job.offerCount > 0
                  ? `${job.offerCount} provider${job.offerCount !== 1 ? 's' : ''} have placed bids.`
                  : 'No offers yet. Providers will bid once this job is posted.'}
              </Text>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.cta}>
          {/* OPEN jobs */}
          {job.status === 'open' && (
            <>
              {user?.role === 'provider' && (
                myOffer ? (
                  <View style={styles.submittedOfferBar}>
                    <MaterialCommunityIcons name="check-circle" size={18} color={KaaryaColors.success} />
                    <Text style={styles.submittedOfferText}>
                      Offer submitted — Rs. {myOffer.price.toLocaleString()}
                      {myOffer.status === 'pending' ? ' (pending)' : myOffer.status === 'accepted' ? ' (accepted!)' : myOffer.status === 'rejected' ? ' (rejected)' : ''}
                    </Text>
                    <Pressable onPress={() => router.push('/offers')}>
                      <Text style={styles.submittedOfferLink}>View</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Button
                    title="Make an Offer"
                    onPress={() => {
                      if (!user) { Alert.alert('Login required', 'Please log in to make an offer'); return; }
                      if (user.role !== 'provider') { Alert.alert('Providers only', 'Only verified providers can submit offers'); return; }
                      if (user.verificationStatus !== 'verified') { Alert.alert('Verification required', 'Please verify your account before making offers'); return; }
                      router.push({
                        pathname: '/make-offer',
                        params: {
                          jobId: job.id,
                          jobTitle: job.title,
                          jobCategory: job.category,
                          budgetMin: job.budgetMin?.toString() ?? '',
                          budgetMax: job.budgetMax?.toString() ?? '',
                        },
                      });
                    }}
                    fullWidth
                  />
                )
              )}
              {user?.role === 'seeker' && isSeekerOwner && (
                <View style={styles.noOffersBar}>
                  <MaterialCommunityIcons name="inbox-outline" size={18} color={KaaryaColors.muted} />
                  <Text style={styles.noOffersText}>Check the Offers section to manage bids</Text>
                </View>
              )}
              {user?.role === 'seeker' && !isSeekerOwner && (
                <Button
                  title="Switch to Service Provider"
                  onPress={() => router.push('/(tabs)/profile')}
                  variant="secondary"
                  fullWidth
                />
              )}
            </>
          )}

          {/* ASSIGNED jobs */}
          {job.status === 'assigned' && (
            <>
              {user?.role === 'seeker' && isSeekerOwner && (
                <View style={styles.infoBar}>
                  <MaterialCommunityIcons name="check-circle-outline" size={18} color={KaaryaColors.warning} />
                  <Text style={styles.infoText}>
                    Provider accepted! Waiting for them to start the job.
                  </Text>
                </View>
              )}
              {user?.role === 'provider' && job.acceptedOffer?.providerId === user?.id && (
                <Button
                  title="Start Job"
                  onPress={async () => {
                    setActionLoading(true);
                    try {
                      await jobsApi.start(job.id);
                      await loadJob();
                    } catch (e: any) {
                      Alert.alert('Error', e.message ?? 'Failed to start job');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  loading={actionLoading}
                  fullWidth
                />
              )}
            </>
          )}

          {/* IN_PROGRESS jobs */}
          {job.status === 'in_progress' && (
            <>
              {user?.role === 'seeker' && isSeekerOwner && (
                <Button
                  title="Mark as Complete"
                  onPress={async () => {
                    setActionLoading(true);
                    try {
                      await jobsApi.complete(job.id);
                      await loadJob();
                    } catch (e: any) {
                      Alert.alert('Error', e.message ?? 'Failed to complete job');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  loading={actionLoading}
                  fullWidth
                />
              )}
              {user?.role === 'provider' && job.acceptedOffer?.providerId === user?.id && (
                <View style={styles.infoBar}>
                  <MaterialCommunityIcons name="progress-wrench" size={18} color={KaaryaColors.brand[500]} />
                  <Text style={styles.infoText}>Work in progress. The seeker will confirm when done.</Text>
                </View>
              )}
            </>
          )}

          {/* COMPLETED jobs */}
          {job.status === 'completed' && (
            <>
              {user?.role === 'seeker' && isSeekerOwner && (
                hasReviewed ? (
                  <View style={styles.submittedOfferBar}>
                    <MaterialCommunityIcons name="check-circle" size={18} color={KaaryaColors.success} />
                    <Text style={styles.submittedOfferText}>Review submitted!</Text>
                  </View>
                ) : (
                  <Button
                    title="Leave a Review"
                    onPress={() => {
                      const providerId = job.acceptedOffer?.providerId;
                      if (!providerId) { Alert.alert('Error', 'Provider info not available'); return; }
                      router.push({
                        pathname: '/review',
                        params: { jobId: job.id, revieweeId: providerId, revieweeName: job.acceptedOffer?.providerName ?? 'Provider' },
                      });
                    }}
                    fullWidth
                  />
                )
              )}
              {user?.role === 'provider' && job.acceptedOffer?.providerId === user?.id && (
                hasReviewed ? (
                  <View style={styles.submittedOfferBar}>
                    <MaterialCommunityIcons name="check-circle" size={18} color={KaaryaColors.success} />
                    <Text style={styles.submittedOfferText}>Review submitted!</Text>
                  </View>
                ) : (
                  <Button
                    title="Leave a Review"
                    onPress={() => {
                      router.push({
                        pathname: '/review',
                        params: { jobId: job.id, revieweeId: job.seekerId, revieweeName: job.seekerName ?? 'Seeker' },
                      });
                    }}
                    fullWidth
                  />
                )
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  saveBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  catBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: Spacing.lg, gap: 6 },
  catBadgeText: { fontSize: FontSizes.xs, fontWeight: '700' },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text, marginTop: Spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, gap: Spacing.md },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '700' },
  postedAt: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  photoGallery: { marginTop: Spacing.md },
  photoGalleryContent: { gap: Spacing.sm, paddingRight: Spacing.lg },
  photoFrame: { width: 180, height: 140, borderRadius: BorderRadius.md, overflow: 'hidden', backgroundColor: KaaryaColors.card },
  photoThumb: { width: '100%', height: '100%' },
  budgetCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginTop: Spacing.md },
  budgetLabel: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  budgetValue: { fontSize: FontSizes.xl, fontWeight: '800', color: KaaryaColors.text },
  section: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginTop: Spacing.md },
  sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.text, marginBottom: 8 },
  descText: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary, lineHeight: 22 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { fontSize: FontSizes.base, color: KaaryaColors.text, fontWeight: '600' },
  locationNote: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 6 },
  viewLocationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, backgroundColor: KaaryaColors.brand[500], paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md },
  viewLocationBtnText: { fontSize: FontSizes.sm, fontWeight: '700', color: '#FFFFFF' },
  seekerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSizes.lg, fontWeight: '800', color: '#fff' },
  seekerName: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  seekerPhone: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  emptyText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', paddingVertical: Spacing.md },
  offersAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offersInfo: { flex: 1 },
  offersCount: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  offersSubtext: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  cta: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
  submittedOfferBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: KaaryaColors.success + '15', borderRadius: BorderRadius.md, padding: Spacing.md },
  submittedOfferText: { flex: 1, fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.success },
  submittedOfferLink: { fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.brand[500] },
  noOffersBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md },
  infoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md },
  infoText: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, textAlign: 'center', flex: 1 },
  noOffersText: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  errorTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.lg },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', marginTop: Spacing.sm },
  backButton: { backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.xl },
  backButtonText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
});
