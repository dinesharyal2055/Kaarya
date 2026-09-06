/**
 * Messages tab — conversation list
 */
import { useRouter, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { chatApi } from '@/lib/api';
import type { Conversation } from '@/types';

export default function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await chatApi.list();
      setConversations(result.data ?? []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('messages.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>{t('messages.loading')}</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="chat-outline" size={64} color={KaaryaColors.muted} />
          <Text style={styles.emptyTitle}>{t('messages.noMessagesYet')}</Text>
          <Text style={styles.emptySubtitle}>{t('messages.noMessagesSubtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
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
            <Pressable
              style={[styles.convoCard, Shadows.sm]}
              onPress={() => router.push(`/chat/${item.id}`)}
            >
              <View style={[styles.avatar, { backgroundColor: KaaryaColors.brand[500] }]}>
                <Text style={styles.avatarText}>
                  {item.participants[0]?.name?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={styles.convoBody}>
                <Text style={styles.convoName}>{item.participants[0]?.name ?? 'User'}</Text>
                <Text style={styles.convoJob} numberOfLines={1}>{item.jobTitle}</Text>
                {item.lastMessage && (
                  <Text style={styles.convoMsg} numberOfLines={1}>
                    {String(item.lastMessage.senderId) === String(item.participants[0]?.id) ? '' : 'You: '}
                    {item.lastMessage.text}
                  </Text>
                )}
              </View>
              {item.unreadCount && item.unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                </View>
              ) : null}
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', marginTop: 8 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  convoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSizes.lg, fontWeight: '800', color: '#fff' },
  convoBody: { flex: 1, gap: 2 },
  convoName: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text },
  convoJob: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  convoMsg: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, marginTop: 2 },
  unreadBadge: {
    backgroundColor: KaaryaColors.brand[500], borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
