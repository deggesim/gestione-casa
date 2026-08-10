const required = (source: Record<string, string | undefined>, name: string): string => {
  const value = source[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

// Takes the source explicitly so the production branch below is unit-testable: this module
// is evaluated at import time, and Bun auto-loads apps/api/.env from the cwd, which would
// supply the very var a test wants missing.
export const readEnv = (source: Record<string, string | undefined>) => {
  // Set by the `start` script, not by the deploy config — a mode flag that can be forgotten
  // is a mode flag that disables its own check.
  const isProd = source['NODE_ENV'] === 'production';
  return {
    DATABASE_URL: required(source, 'DATABASE_URL'),
    JWT_SECRET: required(source, 'JWT_SECRET'),
    PORT: Number(source['PORT'] ?? 5000),
    // Both are permissive in dev and tests but mandatory in prod, because both fail
    // silently there: a missing CORS_ORIGIN falls back to '*', and a missing COOKIE_SECURE
    // ships the session cookies without the Secure flag. Presence is enforced, not the
    // value — setting COOKIE_SECURE=false in prod is a choice, forgetting it is a bug.
    CORS_ORIGIN: isProd ? required(source, 'CORS_ORIGIN') : (source['CORS_ORIGIN'] ?? '*'),
    COOKIE_SECURE:
      (isProd ? required(source, 'COOKIE_SECURE') : source['COOKIE_SECURE']) === 'true',
    // Cookies: Secure only over HTTPS (prod). Domain lets api.<d>/app.<d> share the cookie.
    COOKIE_DOMAIN: source['COOKIE_DOMAIN'] || undefined,
  };
};

export const env = readEnv(process.env);
