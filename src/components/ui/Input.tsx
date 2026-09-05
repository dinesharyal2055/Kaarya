import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { KaaryaColors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, helper, leftIcon, rightIcon, containerStyle, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;
  const borderColor = hasError ? KaaryaColors.danger : focused ? KaaryaColors.brand[500] : KaaryaColors.border;
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputRow, { borderColor, borderWidth: 1.5, backgroundColor: KaaryaColors.card }]}>
        {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
        <TextInput
          {...props}
          style={[styles.input, { paddingLeft: leftIcon ? 0 : Spacing.md }, props.style as any]}
          placeholderTextColor={KaaryaColors.muted}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        />
        {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {helper && !error && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md },
  label: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, marginBottom: Spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.md, overflow: 'hidden' },
  input: { flex: 1, fontSize: FontSizes.base, color: KaaryaColors.text, paddingVertical: Spacing.sm + 4, paddingRight: Spacing.md },
  iconLeft: { paddingLeft: Spacing.md },
  iconRight: { paddingRight: Spacing.md },
  error: { fontSize: FontSizes.xs, color: KaaryaColors.danger, marginTop: 4 },
  helper: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4 },
});
