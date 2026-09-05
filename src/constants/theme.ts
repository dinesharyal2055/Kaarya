/**
 * Kaarya Design System — brand colors, spacing, and typography tokens
 * These match the Tailwind config for consistency between code and styles
 */

export const KaaryaColors = {
  brand: {
    50: '#FFF1EB',
    100: '#FFE0CC',
    200: '#FFC9A3',
    300: '#FFAA75',
    400: '#FF8D4F',
    500: '#FF6B35', // primary — warm orange
    600: '#E85A20',
    700: '#C44615',
    800: '#9E360F',
    900: '#7A2B0C',
  },
  success: '#4CAF50',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#FAFAFA',
  card: '#FFFFFF',
  border: '#E5E7EB',
  muted: '#9CA3AF',
  text: '#111827',
  textSecondary: '#6B7280',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
