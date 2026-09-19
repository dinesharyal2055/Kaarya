/**
 * Dynamic Expo configuration.
 *
 * The API base URL is resolved here (config layer) and exposed to the app via
 * Constants.expoConfig.extra.apiUrl (read in src/lib/api.ts). Keeping the URL
 * out of service code lets it be swapped per environment without editing source.
 *
 * The Expo/EAS project ID (used by expo-notifications to mint push tokens) is
 * likewise injected from EXPO_PUBLIC_EAS_PROJECT_ID and read by the app via
 * Constants.expoConfig.extra.eas.projectId. It is a public identifier, not a
 * secret, but keeping it environment-driven mirrors the apiUrl approach.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL env var — overrides everything (set via .env,
 *      .env.local, shell, or EAS secrets)
 *   2. Production API URL — default for non-dev Expo CLI runs (expo export,
 *      EAS build/update, release builds where NODE_ENV is production)
 *   3. Unset during `expo start` (dev server) — src/lib/api.ts then falls back
 *      to its local DEV_API_URL, so local development is unchanged
 */
const PRODUCTION_API_URL = 'https://kaarya-4qft.onrender.com/api';

const isProduction = process.env.NODE_ENV === 'production';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    '@react-native-community/datetimepicker',
  ],
  extra: {
    ...(config.extra || {}),
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ||
      (isProduction ? PRODUCTION_API_URL : undefined),
    eas: {
      ...(config.extra && config.extra.eas),
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined,
    },
  },
});