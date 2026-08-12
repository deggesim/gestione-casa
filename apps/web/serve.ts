// Static server over the production build in dist/, with SPA fallback, and — in production
// — a proxy that forwards /api/* to the API over Railway's private network.
//
// The proxy is what makes the session cookies work at all: up.railway.app is a public
// suffix, so two Railway subdomains are two distinct *sites* and the httpOnly cookies
// (SameSite=Lax) would never be sent between them. One origin makes them first-party.
// See docs/superpowers/specs/2026-08-11-phase6-cutover-design.md §2.
//
// This file also exists because Bun's dev server (`bun ./index.html`) falls back to
// index.html for every unknown path: /sw.js and /icons/*.png answer 200 with the app's HTML
// inside, so the PWA is not verifiable there at all.
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser-facing prefix only: it is stripped before the request reaches the API, so the
// shared REST surface (/utente, /andamento, /statistiche) is unchanged. It must agree with
// the path in PUBLIC_API_URL — see apps/web/.env.example.
const API_PREFIX = '/api';

/** `apiInternalUrl` absent (development, tests, e2e) leaves the proxy inert. */
export const createHandler = (distUrl: URL, apiInternalUrl?: string) => {
  // Resolved once at startup, and deliberately allowed to throw if dist/ is missing: the
  // containment check below compares real on-disk paths, so the boundary must be a real
  // path too (dist/ may itself sit under a symlinked directory).
  const distReal = realpathSync(fileURLToPath(distUrl));

  // Parsed once, so a malformed API_INTERNAL_URL fails at boot rather than on the first
  // request, and so the proxy below has an authority it can compare against.
  const apiBase = apiInternalUrl === undefined ? undefined : new URL(apiInternalUrl);

  const indexHtml = () =>
    new Response(Bun.file(new URL('./index.html', distUrl)), {
      headers: { 'Content-Type': 'text/html' },
    });

  return async (req: Request) => {
    const { pathname, search } = new URL(req.url);

    // Method, headers (Cookie, Origin and the CSRF header included) and body all ride along
    // on `new Request(target, req)` — verified, streamed bodies included. redirect:'manual'
    // leaves any redirect for the browser to follow instead of following it here.
    if (apiBase && pathname.startsWith(API_PREFIX + '/')) {
      // The path is applied THROUGH the setter instead of being resolved against the base:
      // `new URL('//evil.com/x', base)` is a network-path reference, so it keeps only the
      // base's SCHEME and takes its authority from the path. A request for
      // /api//evil.com/x was therefore fetched from evil.com carrying the victim's session
      // cookies — httpOnly stops JavaScript, not a proxy. The setter cannot reach the
      // authority, so the host comes from API_INTERNAL_URL by construction. (A leading `\`
      // arrives here already normalized to `/` by the Request URL parse, so both
      // spellings are the same case.)
      const target = new URL(apiBase);
      target.pathname = pathname.slice(API_PREFIX.length);
      target.search = search;
      // Unreachable while the setter behaves as specified, and kept anyway: at a boundary
      // that forwards session cookies, a future parser change — or a rewrite back to
      // `new URL(path, base)` — must fail closed instead of leaking them.
      if (target.origin !== apiBase.origin) return new Response('Bad Gateway', { status: 502 });
      return await fetch(new Request(target, req), { redirect: 'manual' });
    }

    // Resolve to a real path BEFORE checking containment. Comparing URL pathnames instead
    // only looks like a containment check: `..` never survives `new URL`, but a symlink
    // inside dist/ pointing outside it passes any string prefix test and is then read
    // (verified: /leak.txt -> ../secret.txt served the secret). realpathSync collapses
    // symlinks, and throws for anything that does not exist — which includes every SPA
    // deep link, so a throw means "serve the app shell", not 404. fileURLToPath throws on
    // encoded slashes (/%2e%2e%2f…) for the same reason, which is also the right answer.
    let file: string;
    try {
      file = realpathSync(fileURLToPath(new URL(`.${pathname}`, distUrl)));
    } catch {
      return indexHtml();
    }
    if (file !== distReal && !file.startsWith(distReal + sep))
      return new Response('Forbidden', { status: 403 });

    // Directories resolve fine above but are not servable, so this still guards them.
    const body = Bun.file(file);
    if (!(await body.exists())) return indexHtml();
    // The browser must always revalidate the worker script, otherwise a stale sw.js
    // keeps serving an old app shell.
    const headers = pathname === '/sw.js' ? { 'Cache-Control': 'no-cache' } : undefined;
    return new Response(body, headers ? { headers } : undefined);
  };
};

// Guarded so the test can import createHandler without binding a port.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  // hostname '::' for the same reason as apps/api/src/index.ts: Railway reaches containers
  // over its IPv6 private network.
  Bun.serve({
    port,
    hostname: '::',
    fetch: createHandler(new URL('./dist/', import.meta.url), process.env.API_INTERNAL_URL),
  });
  console.log(`Serving dist on http://localhost:${port}`);
}
