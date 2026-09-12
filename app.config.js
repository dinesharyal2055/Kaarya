/**
 * Dynamic Expo configuration.
 *
 * The API base URL is resolved here (config layer) and exposed to the app via
 * Constants.expoConfig.extra.apiUrl (read in src/lib/api.ts). Keeping the URL
 * out of service code lets it be swapped per environment without editing source.
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
  extra: {
    ...(config.extra || {}),
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ||
      (isProduction ? PRODUCTION_API_URL : undefined),
  },
});