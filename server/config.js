// Email Chekkr API — settings, read from environment variables.
// Every setting has a safe default, so `npm start` works with no setup.

function int(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function list(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Builds the configuration.
 * @param {Record<string, string|undefined>} env  usually process.env
 */
export function loadConfig(env = process.env) {
  return {
    host: env.EMAIL_CHEKKR_HOST || '0.0.0.0',
    // Render, Railway, Fly and Cloud Run inject PORT
    port: int(env.PORT ?? env.EMAIL_CHEKKR_PORT, 8787, { min: 0, max: 65535 }),

    // API keys: comma-separated. Keys get the higher "key" limits and access to /mcp.
    apiKeys: new Set(list(env.EMAIL_CHEKKR_API_KEYS)),
    // When false, every request (except /health and /version) needs an API key.
    publicAccess: bool(env.EMAIL_CHEKKR_PUBLIC_ACCESS, true),

    // Browsers allowed to call the API. "*" allows any site.
    corsOrigins: list(env.EMAIL_CHEKKR_CORS_ORIGINS || 'https://nexoradev-stack.github.io,http://localhost:8080,http://127.0.0.1:8080'),

    limits: {
      windowMs: int(env.EMAIL_CHEKKR_RATE_WINDOW_MS, 60_000, { min: 1000 }),
      // Without a key (for example the website): requests per window, per IP address
      publicPerWindow: int(env.EMAIL_CHEKKR_PUBLIC_RATE_LIMIT, 30, { min: 1 }),
      publicBatchMax: int(env.EMAIL_CHEKKR_PUBLIC_BATCH_MAX, 50, { min: 1, max: 1000 }),
      // With an API key: requests per window, per key
      keyPerWindow: int(env.EMAIL_CHEKKR_KEY_RATE_LIMIT, 120, { min: 1 }),
      keyBatchMax: int(env.EMAIL_CHEKKR_KEY_BATCH_MAX, 500, { min: 1, max: 1000 }),
      maxBodyBytes: int(env.EMAIL_CHEKKR_MAX_BODY_BYTES, 1_000_000, { min: 1024 })
    },

    dns: {
      timeoutMs: int(env.EMAIL_CHEKKR_DNS_TIMEOUT_MS, 5000, { min: 500, max: 30_000 }),
      tries: int(env.EMAIL_CHEKKR_DNS_TRIES, 2, { min: 1, max: 5 }),
      // Optional: comma-separated DNS servers, e.g. "1.1.1.1,8.8.8.8". Empty = the system's servers.
      servers: list(env.EMAIL_CHEKKR_DNS_SERVERS),
      cacheTtlMs: int(env.EMAIL_CHEKKR_DNS_CACHE_TTL_MS, 10 * 60_000, { min: 0 }),
      cacheMax: int(env.EMAIL_CHEKKR_DNS_CACHE_MAX, 50_000, { min: 100 })
    },

    // How many lookups one batch runs at the same time
    concurrency: int(env.EMAIL_CHEKKR_CONCURRENCY, 10, { min: 1, max: 50 }),

    // Behind Render/Railway/Cloud Run the client IP comes from X-Forwarded-For
    trustProxy: bool(env.EMAIL_CHEKKR_TRUST_PROXY, true),

    disposablePath: env.EMAIL_CHEKKR_DISPOSABLE_PATH || null
  };
}
