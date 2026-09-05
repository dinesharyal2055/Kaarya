import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KaaryaColors, BorderRadius } from '@/constants/theme';

type BadgeVariant = 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'default';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  brand: { bg: KaaryaColors.brand[100], color: KaaryaColors.brand[700] },
  success: { bg: '#D1FAE5', color: '#065F46' },
  warning: { bg: '#FEF3C7', color: '#92400E' },
  danger: { bg: '#FEE2E2', color: '#991B1B' },
  muted: { bg: KaaryaColors.border, color: KaaryaColors.muted },
  default: { bg: KaaryaColors.border, color: KaaryaColors.muted },
};

export function Badge({ label, variant = 'brand' }: BadgeProps) {
  const { bg, color } = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
