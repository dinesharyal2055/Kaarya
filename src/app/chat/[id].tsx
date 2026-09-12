/**
 * Chat screen — real-time messaging between seeker and provider
 */
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatApi } from '@/lib/api';
import { parseServerTime, formatNepalTime, formatNepalShort, nepalDateKey, nepalTodayKey } from '@/lib/time';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import type { Conversation, Message } from '@/types';

// ─── Time formatter ────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return formatNepalTime(parseServerTime(dateStr));
}

function formatDate(dateStr: string, t: (key: string) => string): string {
  const ms = parseServerTime(dateStr);
  const key = nepalDateKey(ms);
  if (key === nepalTodayKey()) return t('common.today');
  if (key === nepalDateKey(Date.now() - 86400000)) return t('common.yesterday');
  return formatNepalShort(ms);
}

// ─── Date separator ────────────────────────────────────────────────

function DateSeparator({ date, t }: { date: string; t: (key: string) => string }) {
  return (
    <View style={styles.dateSep}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepText}>{formatDate(date, t)}</Text>
      <View style={styles.dateSepLine} />
    </View>
  );
}

// ─── Message bubble ────────────────────────────────────────────────

interface BubbleItem {
  id: string;
  type: 'date' | 'message';
  date?: string;
  message?: Message;
  isMe?: boolean;
  showAvatar?: boolean;
  senderName?: string;
}

function MessageBubble({ item, showAvatar, senderName, t }: {
  item: BubbleItem;
  showAvatar?: boolean;
  senderName?: string;
  t: (key: string) => string;
}) {
  if (item.type === 'date') {
    return <DateSeparator date={item.date!} t={t} />;
  }

  const msg = item.message!;
  const isMe = item.isMe!;

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
      {!isMe && (
        <View style={styles.bubbleAvatar}>
          {showAvatar ? (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {senderName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
          ) : (
            <View style={styles.avatarPlaceholder} />
          )}
        </View>
      )}

      <View style={[styles.bubbleContainer, isMe ? styles.bubbleContainerMe : styles.bubbleContainerThem]}>
        {!isMe && showAvatar && senderName && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {msg.text}
          </Text>
        </View>
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [rawMessages, setRawMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const convData = await chatApi.get(id).catch(() => null);
      if (convData) setConversation(convData.data as unknown as Conversation);
    } catch (e: any) {
      setError(e.message ?? t('chat.loadFailed'));
    }

    try {
      const msgsData = await chatApi.messages(id).catch(() => null);
      if (msgsData) setRawMessages(msgsData.data as unknown as Message[]);
    } catch {
      // messages are non-critical
    }

    setLoading(false);
    setRefreshing(false);
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
      pollingRef.current = setInterval(() => {
        chatApi.messages(id).then(result => {
          setRawMessages(result.data as unknown as Message[]);
        }).catch(() => {});
      }, 4000);
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, [load, id])
  );

  const prevLengthRef = useRef(rawMessages.length);
  useEffect(() => {
    if (rawMessages.length > prevLengthRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
    prevLengthRef.current = rawMessages.length;
  }, [rawMessages]);

  const enrichedItems: BubbleItem[] = [];
  let lastDate2 = '';
  let prevSenderId = '';

  rawMessages.forEach((msg) => {
    const msgDate = nepalDateKey(parseServerTime(msg.createdAt));
    if (msgDate !== lastDate2) {
      enrichedItems.push({ id: `date-${msgDate}`, type: 'date', date: msg.createdAt });
      lastDate2 = msgDate;
      prevSenderId = '';
    }

    const isMe = user ? String(msg.senderId) === String(user.id) : false;
    const showAvatar = isMe ? false : (msg.senderId !== prevSenderId);
    if (msg.senderId !== prevSenderId) prevSenderId = msg.senderId;

    enrichedItems.push({
      id: msg.id,
      type: 'message',
      message: msg,
      isMe,
      showAvatar,
      senderName: conversation?.participants?.find(p => String(p.id) === String(msg.senderId))?.name,
    });
  });

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');
    try {
      const result = await chatApi.send(id, text);
      const newMsg = result.data as unknown as Message;
      setRawMessages(prev => [...prev, newMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const otherParticipant = conversation?.participants?.find(p => !user || String(p.id) !== user.id)
    ?? conversation?.participants?.[0];
  const otherName = otherParticipant?.name ?? t('chat.chat');
  const otherRole = otherParticipant?.role === 'seeker' ? t('chat.taskPoster') : t('chat.serviceProvider');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <View style={styles.headerUser}>
            <View style={[styles.headerAvatar, { backgroundColor: KaaryaColors.brand[500] }]}>
              <Text style={styles.headerAvatarText}>{otherName.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{otherName}</Text>
              <Text style={styles.headerRole}>{otherRole}</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <Text style={styles.loadingText}>{t('chat.loadingChat')}</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={KaaryaColors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : rawMessages.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="chat-outline" size={48} color={KaaryaColors.muted} />
            <Text style={styles.emptyTitle}>{t('chat.noMessagesYet')}</Text>
            <Text style={styles.emptySubtext}>{t('chat.startConversation')}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={enrichedItems}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={KaaryaColors.brand[500]} />
            }
            renderItem={({ item }) => (
              <MessageBubble
                item={item}
                showAvatar={item.showAvatar}
                senderName={item.senderName}
                t={t}
              />
            )}
          />
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={t('chat.typeMessage')}
              placeholderTextColor={KaaryaColors.muted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable
              style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              <MaterialCommunityIcons
                name={sending ? 'loading' : 'send'}
                size={20}
                color="#fff"
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: KaaryaColors.border,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { fontSize: FontSizes.base, fontWeight: '700', color: '#fff' },
  headerName: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text },
  headerRole: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted, marginTop: Spacing.md },
  errorText: { fontSize: FontSizes.sm, color: KaaryaColors.danger, marginTop: Spacing.sm, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, backgroundColor: KaaryaColors.brand[500], paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md },
  emptySubtext: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', marginTop: 4 },
  messageList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, paddingBottom: Spacing.sm },
  dateSep: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md, gap: 8 },
  dateSepLine: { flex: 1, height: 1, backgroundColor: KaaryaColors.border },
  dateSepText: { fontSize: FontSizes.xs, color: KaaryaColors.muted, fontWeight: '600' },
  bubbleRow: { flexDirection: 'row', marginBottom: 4 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowThem: { justifyContent: 'flex-start' },
  bubbleAvatar: { width: 32, alignItems: 'center', marginRight: 6 },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: KaaryaColors.brand[400], alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  avatarPlaceholder: { width: 32 },
  bubbleContainer: { maxWidth: '75%' },
  bubbleContainerMe: { alignItems: 'flex-end' },
  bubbleContainerThem: { alignItems: 'flex-start' },
  senderName: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginBottom: 2, marginLeft: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  bubbleMe: { backgroundColor: KaaryaColors.brand[500], borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: KaaryaColors.card, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: FontSizes.base, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: KaaryaColors.text },
  bubbleTime: { fontSize: 10, marginTop: 2 },
  bubbleTimeMe: { color: KaaryaColors.brand[200] },
  bubbleTimeThem: { color: KaaryaColors.muted },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: KaaryaColors.border,
    gap: 8,
    backgroundColor: KaaryaColors.background,
  },
  input: {
    flex: 1,
    backgroundColor: KaaryaColors.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: FontSizes.base,
    color: KaaryaColors.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: KaaryaColors.brand[500],
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: KaaryaColors.muted },
});
