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
import { chatApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import type { Conversation, Message } from '@/types';

// ─── Time formatter ────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-NP', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-NP', { month: 'short', day: 'numeric' });
}

// ─── Date separator ────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
  return (
    <View style={styles.dateSep}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepText}>{formatDate(date)}</Text>
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

function MessageBubble({ item, showAvatar, senderName }: {
  item: BubbleItem;
  showAvatar?: boolean;
  senderName?: string;
}) {
  if (item.type === 'date') {
    return <DateSeparator date={item.date!} />;
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
      const [convResult, msgsResult] = await Promise.allSettled([
        chatApi.get(id),
        chatApi.messages(id),
      ]);

      if (convResult.status === 'fulfilled') {
        setConversation(convResult.value.data as unknown as Conversation);
      }
      if (msgsResult.status === 'fulfilled') {
        setRawMessages(msgsResult.value.data as unknown as Message[]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load chat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  // Load on mount and when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      load();
      // Poll for new messages every 4 seconds
      pollingRef.current = setInterval(() => {
        if (!loading) {
          chatApi.messages(id).then(result => {
            setRawMessages(result.data as unknown as Message[]);
          }).catch(() => {});
        }
      }, 4000);
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, [load, id, loading])
  );

  // Auto-scroll to bottom when messages change
  const prevLengthRef = useRef(rawMessages.length);
  useEffect(() => {
    if (rawMessages.length > prevLengthRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
    prevLengthRef.current = rawMessages.length;
  }, [rawMessages]);

  // Build enriched items with date separators and isMe flag
  const enrichedItems: BubbleItem[] = [];
  let lastDate2 = '';
  let prevSenderId = '';

  rawMessages.forEach((msg) => {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== lastDate2) {
      enrichedItems.push({ id: `date-${msgDate}`, type: 'date', date: msg.createdAt });
      lastDate2 = msgDate;
      prevSenderId = '';
    }

    // isMe: sender is the current user
    const isMe = user ? msg.senderId === user.id : false;
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
      setInputText(text); // restore on failure
    } finally {
      setSending(false);
    }
  };

  // Derive "other" participant info (the person we're chatting with)
  const otherParticipant = conversation?.participants?.find(p => !user || String(p.id) !== user.id)
    ?? conversation?.participants?.[0];
  const otherName = otherParticipant?.name ?? 'Chat';
  const otherRole = otherParticipant?.role === 'seeker' ? 'Task Poster' : 'Service Provider';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
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

        {/* Messages */}
        {loading ? (
          <View style={styles.centerState}>
            <Text style={styles.loadingText}>Loading chat...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={KaaryaColors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : rawMessages.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="chat-outline" size={48} color={KaaryaColors.muted} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start the conversation by sending a message below</Text>
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
              />
            )}
          />
        )}

        {/* Input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
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
