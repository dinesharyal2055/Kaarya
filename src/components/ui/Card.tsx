import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { KaaryaColors, BorderRadius, Spacing, FontSizes, Shadows } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, onPress, style, padding = Spacing.md }: CardProps) {
  const content = (
    <View style={[styles.card, { padding }, Shadows.sm, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>{content}</Pressable>;
  }
  return content;
}

interface BadgeProps {
  label: string;
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'default';
}

const BADGE_STYLES: Record<NonNullable<BadgeProps['variant']>, { bg: string; text: string }> = {
  brand: { bg: KaaryaColors.brand[100], text: KaaryaColors.brand[700] },
  success: { bg: '#D1FAE5', text: '#065F46' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  danger: { bg: '#FEE2E2', text: '#991B1B' },
  muted: { bg: KaaryaColors.border, text: KaaryaColors.textSecondary },
  default: { bg: KaaryaColors.border, text: KaaryaColors.muted },
};

export function Badge({ label, variant = 'brand' }: BadgeProps) {
  const s = BADGE_STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.text }]}>{label}</Text>
    </View>
  );
}

interface AvatarProps {
  name: string;
  uri?: string;
  size?: number;
}

export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: KaaryaColors.brand[500] }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message && <Text style={styles.emptyMessage}>{message}</Text>}
      {action && <View style={{ marginTop: Spacing.md }}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: KaaryaColors.border },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: FontSizes.xs, fontWeight: '600' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, textAlign: 'center' },
  emptyMessage: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
});
