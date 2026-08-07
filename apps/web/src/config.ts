// API base URL — provided via PUBLIC_API_URL (apps/web/.env; see .env.example).
// Inlined into the browser bundle at build time by Bun (bunfig serve.static env = "PUBLIC_*").
const apiUrl = process.env.PUBLIC_API_URL;
if (!apiUrl)
  throw new Error('Missing required env var: PUBLIC_API_URL (copy apps/web/.env.example to .env)');
export const API_URL = apiUrl;

// Service worker registration is opt-in per environment (see .env.example). Read here,
// not inline at the call site, so the build's --env inlining has one documented touch
// point. Anything unset at build time would survive as a literal `process.env.X` and
// throw in the browser, so package.json's build script always gives it a value.
export const ENABLE_SW = process.env.PUBLIC_ENABLE_SW === 'true';
