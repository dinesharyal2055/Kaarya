/**
 * Review screen — rate and review the other party after job completion
 */

import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { KaaryaColors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { reviewsApi } from '@/lib/api';
import { Button } from '@/components/ui';

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export default function ReviewScreen() {
  const router = useRouter();
  const { jobId, revieweeId, revieweeName } = useLocalSearchParams<{
    jobId: string;
    revieweeId: string;
    revieweeName: string;
  }>();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayRating = hoverRating || rating;

  const submit = async () => {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      await reviewsApi.submit({
        jobId: jobId!,
        revieweeId: revieweeId!,
        rating,
        comment: comment.trim() || undefined,
      });
      Alert.alert('Review submitted!', 'Thank you for your feedback.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Leave a Review</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>How was your experience with</Text>
            <Text style={styles.revieweeName}>{revieweeName ?? 'the provider'}?</Text>

            {/* Stars */}
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => setRating(star)}
                  onPressIn={() => setHoverRating(star)}
                  onPressOut={() => setHoverRating(0)}
                  style={styles.starBtn}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons
                    name={star <= displayRating ? 'star' : 'star-outline'}
                    size={44}
                    color={star <= displayRating ? '#F59E0B' : KaaryaColors.muted}
                  />
                </Pressable>
              ))}
            </View>

            {displayRating > 0 && (
              <Text style={styles.starLabel}>{STAR_LABELS[displayRating]}</Text>
            )}
          </View>

          {/* Comment */}
          <View style={styles.commentCard}>
            <Text style={styles.commentLabel}>Add a comment (optional)</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Share details about your experience..."
              placeholderTextColor={KaaryaColors.muted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{comment.length}/500</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={submitting ? 'Submitting...' : 'Submit Review'}
            onPress={submit}
            loading={submitting}
            disabled={rating === 0}
            fullWidth
          />
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 100 },
  card: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center' },
  label: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  revieweeName: { fontSize: FontSizes.xl, fontWeight: '800', color: KaaryaColors.text, marginTop: 4, marginBottom: Spacing.lg },
  stars: { flexDirection: 'row', gap: Spacing.xs },
  starBtn: { padding: 4 },
  starLabel: { fontSize: FontSizes.base, fontWeight: '600', color: '#F59E0B', marginTop: Spacing.sm },
  commentCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginTop: Spacing.md },
  commentLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, marginBottom: Spacing.sm },
  commentInput: {
    backgroundColor: KaaryaColors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: KaaryaColors.border,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: KaaryaColors.text,
    height: 120,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: FontSizes.xs, color: KaaryaColors.muted, textAlign: 'right', marginTop: 6 },
  footer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border, backgroundColor: '#fff' },
});
