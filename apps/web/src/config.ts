// Bun inlines `process.env.PUBLIC_*` into the browser bundle (dev server via bunfig
// `[serve.static] env`, build via `--env 'PUBLIC_*'`) — but ONLY for variables that are
// actually set. An unset one survives verbatim into the bundle, and since `process` does
// not exist in a browser, merely reading it throws ReferenceError before any app code
// runs. Reading through this catch keeps the inlining (the substitution is syntactic, so
// `process.env.PUBLIC_X` below still becomes a literal when the var is set) while turning
// a missing var into `undefined` instead of a blank page.
//
// A `typeof process === 'undefined'` guard does NOT work here: the check survives into the
// bundle and is evaluated in the browser, where it is always true — so it would return
// undefined even for variables that WERE inlined. Verified against the bundler.
const readEnv = (read: () => string | undefined): string | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

// API base URL — provided via PUBLIC_API_URL (apps/web/.env; see .env.example).
const apiUrl = readEnv(() => process.env.PUBLIC_API_URL);
if (!apiUrl)
  throw new Error('Missing required env var: PUBLIC_API_URL (copy apps/web/.env.example to .env)');
export const API_URL = apiUrl;

// Service worker registration is opt-in per environment (see .env.example). Absent means
// off, which is what development wants: a service worker breaks hot reload.
export const ENABLE_SW = readEnv(() => process.env.PUBLIC_ENABLE_SW) === 'true';
