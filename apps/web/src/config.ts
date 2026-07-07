// API base URL — provided via PUBLIC_API_URL (apps/web/.env; see .env.example).
// Inlined into the browser bundle at build time by Bun (bunfig serve.static env = "PUBLIC_*").
const apiUrl = process.env.PUBLIC_API_URL;
if (!apiUrl) throw new Error('Missing required env var: PUBLIC_API_URL (copy apps/web/.env.example to .env)');
export const API_URL = apiUrl;
