/**
 * Offers screen — "My Bids" for providers, "Received Offers" for seekers
 */
import { useRouter, Stack } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES } from '@/constants/categories';
import { offersApi, chatApi } from '@/lib/api';
import { acceptOffer, rejectOffer } from '@/services/offers';
import { useAuth } from '@/context/AuthContext';
import type { Offer } from '@/types';

const BASE_URL = 'http://192.168.1.79:5000';

export default function OffersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadOffers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = isProvider
        ? await offersApi.listMine()
        : await offersApi.listReceived();
      setOffers(result.offers);
    } catch (e: any) {
      setError(e.message ?? t('offers.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isProvider, t]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadFn = useCallback(async (isRefresh = false) => { await loadOffers(isRefresh); }, [loadOffers]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { loadOffers(); });

  const getCatData = (categoryId: string) => CATEGORIES.find(c => c.id === categoryId);
  const getCatColor = (categoryId: string) => getCatData(categoryId)?.color ?? KaaryaColors.brand[500];
  const getCatIcon = (categoryId: string) => getCatData(categoryId)?.icon || 'help-circle';

  const formatDate = (dateStr: string, tFn: (key: string) => string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return tFn('common.justNow');
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${tFn('common.ago')}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${tFn('common.ago')}`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ${tFn('common.ago')}`;
    return d.toLocaleDateString('en-NP', { day: 'numeric', month: 'short' });
  };

  const statusConfig: Record<string, { color: string; labelKey: string; bg: string }> = {
    pending:   { color: KaaryaColors.warning,           bg: KaaryaColors.warning + '20',   labelKey: 'offers.status.pending' },
    accepted:  { color: KaaryaColors.success,           bg: KaaryaColors.success + '20',   labelKey: 'offers.status.accepted' },
    rejected:  { color: KaaryaColors.danger,           bg: KaaryaColors.danger + '20',   labelKey: 'offers.status.rejected' },
    withdrawn: { color: KaaryaColors.muted,            bg: KaaryaColors.muted + '20',    labelKey: 'offers.status.withdrawn' },
    countered: { color: KaaryaColors.brand[500],       bg: KaaryaColors.brand[100] + '20', labelKey: 'offers.status.countered' },
  };

  async function handleAccept(offer: Offer) {
    Alert.alert(t('offers.acceptTitle'), t('offers.acceptMessage', { price: offer.price.toLocaleString(), name: offer.providerName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.accept'),
        onPress: async () => {
          try {
            await acceptOffer(offer.id);
            loadOffers();
            if (offer.job?.id) {
              try {
                const convResult = await chatApi.getByJob(offer.job.id);
                if (convResult.data && convResult.data !== null) {
                  router.push(`/chat/${convResult.data.id}`);
                  return;
                }
              } catch { /* fall through */ }
            }
            Alert.alert(t('offers.offerAcceptedTitle'), t('offers.offerAcceptedMessage'));
          } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
          }
        },
      },
    ]);
  }

  async function handleReject(offer: Offer) {
    Alert.alert(t('offers.rejectTitle'), t('offers.rejectMessage', { name: offer.providerName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.reject'),
        style: 'destructive',
        onPress: async () => {
          try {
            await rejectOffer(offer.id);
            loadOffers();
          } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
          }
        },
      },
    ]);
  }

  async function handleChat(jobId: string) {
    try {
      const convResult = await chatApi.getByJob(jobId);
      if (convResult.data && convResult.data !== null) {
        router.push(`/chat/${convResult.data.id}`);
      } else {
        Alert.alert(t('offers.noConversationTitle'), t('offers.noConversationMessage'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isProvider ? t('offers.myBids') : t('offers.receivedOffers')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {loading && offers.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.loadingText}>{t('offers.loading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={KaaryaColors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => loadOffers()}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name={isProvider ? 'gavel' : 'inbox'}
              size={64}
              color={KaaryaColors.muted}
            />
            <Text style={styles.emptyTitle}>
              {isProvider ? t('offers.noBidsYet') : t('offers.noOffersReceived')}
            </Text>
            <Text style={styles.emptySubtext}>
              {isProvider ? t('offers.browseOpenJobs') : t('offers.postTaskToReceive')}
            </Text>
            <Pressable
              style={styles.emptyAction}
              onPress={() => router.push(isProvider ? '/(tabs)/browse' : '/post-job')}
            >
              <Text style={styles.emptyActionText}>
                {isProvider ? t('offers.browseJobs') : t('offers.postTask')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadOffers(true)}
                tintColor={KaaryaColors.brand[500]}
              />
            }
            renderItem={({ item }) => (
              <OfferCard
                offer={item}
                isProvider={isProvider ?? false}
                onAccept={handleAccept}
                onReject={handleReject}
                getCatColor={getCatColor}
                getCatIcon={getCatIcon}
                formatDate={formatDate}
                statusConfig={statusConfig}
                BASE_URL={BASE_URL}
                onChat={handleChat}
                t={t}
              />
            )}
          />
        )}
      </SafeAreaView>
    </>
  );
}

function OfferCard({
  offer,
  isProvider,
  onAccept,
  onReject,
  getCatColor,
  getCatIcon,
  formatDate,
  statusConfig,
  BASE_URL,
  onChat,
  t,
}: {
  offer: Offer;
  isProvider: boolean;
  onAccept: (o: Offer) => void;
  onReject: (o: Offer) => void;
  getCatColor: (id: string) => string;
  getCatIcon: (id: string) => any;
  formatDate: (d: string, tFn: (key: string, opts?: object) => string) => string;
  statusConfig: Record<string, { color: string; labelKey: string; bg: string }>;
  BASE_URL: string;
  onChat?: (jobId: string) => void;
  t: (key: string) => string;
}) {
  const catColor = getCatColor(offer.job?.category ?? '');
  const status = statusConfig[offer.status] ?? { color: KaaryaColors.muted, bg: KaaryaColors.muted + '20', labelKey: 'offers.status.' + offer.status };

  return (
    <View style={[styles.card, Shadows.sm]}>
      {offer.job && (
        <View style={styles.jobRow}>
          <View style={[styles.catDot, { backgroundColor: catColor }]} />
          <Text style={styles.jobCat} numberOfLines={1}>
            {getCatData(offer.job.category)?.name ?? offer.job.category}
          </Text>
          <Text style={styles.jobArea}>· {offer.job.area}</Text>
        </View>
      )}
      <Text style={styles.jobTitle}>{offer.job?.title ?? `Job #${offer.jobId}`}</Text>

      <View style={styles.divider} />

      <View style={styles.partyRow}>
        {isProvider ? (
          <>
            <View style={[styles.avatar, { backgroundColor: catColor }]}>
              <Text style={styles.avatarText}>
                {offer.providerName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.partyName}>{offer.providerName}</Text>
              <View style={styles.ratingRow}>
                {offer.providerRating ? (
                  <>
                    <MaterialCommunityIcons name="star" size={12} color={KaaryaColors.warning} />
                    <Text style={styles.rating}>{offer.providerRating.toFixed(1)}</Text>
                    <Text style={styles.ratingCount}>({offer.providerReviewCount ?? 0})</Text>
                  </>
                ) : (
                  <Text style={styles.noRating}>{t('offers.noRatingYet')}</Text>
                )}
                {offer.providerVerified && (
                  <MaterialCommunityIcons name="check-decagram" size={12} color={KaaryaColors.success} style={{ marginLeft: 4 }} />
                )}
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.avatar, { backgroundColor: catColor }]}>
              <Text style={styles.avatarText}>
                {offer.providerName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.partyName}>{offer.providerName}</Text>
              {offer.providerRating != null && (
                <View style={styles.ratingRow}>
                  <MaterialCommunityIcons name="star" size={12} color={KaaryaColors.warning} />
                  <Text style={styles.rating}>{offer.providerRating.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({offer.providerReviewCount ?? 0})</Text>
                  {offer.providerVerified && (
                    <MaterialCommunityIcons name="check-decagram" size={12} color={KaaryaColors.success} style={{ marginLeft: 4 }} />
                  )}
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>
            {isProvider ? t('offers.yourBid') : t('offers.offer')}
          </Text>
          <Text style={styles.price}>Rs. {offer.price.toLocaleString()}</Text>
        </View>
      </View>

      {offer.message && (
        <Text style={styles.message} numberOfLines={2}>{offer.message}</Text>
      )}

      <View style={[styles.statusRow]}>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{t(status.labelKey)}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(offer.createdAt, t)}</Text>
      </View>

      {!isProvider && offer.status === 'pending' && (
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(offer)}
          >
            <MaterialCommunityIcons name="close" size={16} color={KaaryaColors.danger} />
            <Text style={styles.rejectText}>{t('common.reject')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => onAccept(offer)}
          >
            <MaterialCommunityIcons name="check" size={16} color="#fff" />
            <Text style={styles.acceptText}>{t('common.accept')}</Text>
          </Pressable>
        </View>
      )}

      {offer.status === 'accepted' && offer.job?.id && (
        <Pressable
          style={[styles.chatBtn]}
          onPress={() => onChat?.(String(offer.job!.id))}
        >
          <MaterialCommunityIcons name="chat" size={16} color={KaaryaColors.brand[500]} />
          <Text style={styles.chatBtnText}>
            {(() => {
              const role = isProvider ? t('offers.seeker') : t('offers.provider');
              const chatLabel = t('offers.chatWith');
              return chatLabel.replace('{{role}}', role);
            })()}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={KaaryaColors.brand[500]} />
        </Pressable>
      )}
    </View>
  );
}

function getCatData(categoryId: string) {
  return CATEGORIES.find(c => c.id === categoryId);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted, marginTop: Spacing.md },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: Spacing.sm, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptySubtext: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 4, textAlign: 'center' },
  emptyAction: { marginTop: Spacing.lg, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  emptyActionText: { fontSize: FontSizes.base, fontWeight: '600', color: '#fff' },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 100 },
  card: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  jobCat: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.textSecondary },
  jobArea: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  jobTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text },
  divider: { height: 1, backgroundColor: KaaryaColors.border, marginVertical: Spacing.md },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSizes.lg, fontWeight: '800', color: '#fff' },
  partyName: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rating: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.text },
  ratingCount: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  noRating: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  priceBlock: { alignItems: 'flex-end' },
  priceLabel: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  price: { fontSize: FontSizes.lg, fontWeight: '800', color: KaaryaColors.brand[500] },
  message: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, marginTop: Spacing.sm, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '700' },
  dateText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  rejectBtn: { backgroundColor: KaaryaColors.danger + '15', borderWidth: 1, borderColor: KaaryaColors.danger + '30' },
  acceptBtn: { backgroundColor: KaaryaColors.success, borderWidth: 1, borderColor: KaaryaColors.success },
  rejectText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.danger },
  acceptText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: KaaryaColors.brand[500], marginTop: Spacing.sm },
  chatBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.brand[500] },
});
