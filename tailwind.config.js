/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF1EB',
          100: '#FFE0CC',
          200: '#FFC9A3',
          300: '#FFAA75',
          400: '#FF8D4F',
          500: '#FF6B35', // primary
          600: '#E85A20',
          700: '#C44615',
          800: '#9E360F',
          900: '#7A2B0C',
        },
        success: '#4CAF50',
        warning: '#F59E0B',
        danger: '#EF4444',
        kathmandu: {
          bg: '#FAFAFA',
          card: '#FFFFFF',
          border: '#E5E7EB',
          muted: '#9CA3AF',
          text: '#111827',
          'text-secondary': '#6B7280',
        },
      },
      fontFamily: {
        sans: ['SpaceGrotesk', 'Inter', 'system-ui'],
        display: ['SpaceGrotesk', 'system-ui'],
        body: ['Inter', 'system-ui'],
        mono: ['JetBrainsMono', 'monospace'],
      },
    },
  },
  plugins: [],
};
