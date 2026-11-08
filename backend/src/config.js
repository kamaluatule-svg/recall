// Reads and validates environment configuration once at startup (fail fast).

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadConfig(env = process.env) {
  const required = ['FIREBASE_PROJECT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return {
    port: int(env.PORT, 8080),
    env: env.NODE_ENV || 'development',
    firebaseProjectId: env.FIREBASE_PROJECT_ID,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 120),
    maxDecksPerUser: int(env.MAX_DECKS_PER_USER, 100),
    maxCardsPerDeck: int(env.MAX_CARDS_PER_DECK, 1000),
  };
}
