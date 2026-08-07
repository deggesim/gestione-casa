// Static server over the production build in dist/, with SPA fallback.
//
// This exists because Bun's dev server (`bun ./index.html`) falls back to index.html for
// every unknown path: /sw.js and /icons/*.png answer 200 with the app's HTML inside, so
// the PWA is not verifiable there at all. Fase 6 reuses this file to serve the SPA in
// production.
const DIST = new URL('./dist/', import.meta.url);
const port = Number(process.env.PORT ?? 3000);

const indexHtml = () =>
  new Response(Bun.file(new URL('./index.html', DIST)), {
    headers: { 'Content-Type': 'text/html' },
  });

Bun.serve({
  port,
  fetch: async (req) => {
    const { pathname } = new URL(req.url);
    const target = new URL(`.${pathname}`, DIST);
    // Belt and braces. `new URL(req.url)` already collapses `..` before we get here, so a
    // plain traversal never reaches this line — but this server is what Fase 6 exposes
    // publicly, so the containment check is stated rather than assumed.
    if (!target.pathname.startsWith(DIST.pathname))
      return new Response('Forbidden', { status: 403 });
    const file = Bun.file(target);
    if (!(await file.exists())) return indexHtml();
    // The browser must always revalidate the worker script, otherwise a stale sw.js
    // keeps serving an old app shell.
    const headers = pathname === '/sw.js' ? { 'Cache-Control': 'no-cache' } : undefined;
    return new Response(file, headers ? { headers } : undefined);
  },
});

console.log(`Serving dist on http://localhost:${port}`);
