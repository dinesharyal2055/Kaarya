import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { KaaryaColors, BorderRadius, FontSizes } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, { bg: string; text: string; border: string; pressed: string }> = {
  primary: { bg: KaaryaColors.brand[500], text: '#FFFFFF', border: 'transparent', pressed: KaaryaColors.brand[600] },
  secondary: { bg: '#FFFFFF', text: KaaryaColors.brand[500], border: KaaryaColors.brand[500], pressed: KaaryaColors.brand[50] },
  ghost: { bg: 'transparent', text: KaaryaColors.brand[500], border: 'transparent', pressed: KaaryaColors.brand[50] },
  danger: { bg: KaaryaColors.danger, text: '#FFFFFF', border: 'transparent', pressed: '#DC2626' },
};

const SIZES: Record<Size, { py: number; px: number; fontSize: number }> = {
  sm: { py: 8, px: 16, fontSize: FontSizes.sm },
  md: { py: 12, px: 20, fontSize: FontSizes.base },
  lg: { py: 16, px: 24, fontSize: FontSizes.lg },
};

export function Button({ title, onPress, variant = 'primary', size = 'md', disabled = false, loading = false, style, fullWidth = false }: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const [pressed, setPressed] = React.useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border, borderWidth: variant === 'secondary' ? 2 : 0, paddingVertical: s.py, paddingHorizontal: s.px, opacity: disabled ? 0.5 : 1 },
        fullWidth && styles.fullWidth, style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.text} size="small" /> : <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  fullWidth: { width: '100%' },
  text: { fontWeight: '600', textAlign: 'center' },
});
