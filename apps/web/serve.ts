// Static server over the production build in dist/, with SPA fallback.
//
// This exists because Bun's dev server (`bun ./index.html`) falls back to index.html for
// every unknown path: /sw.js and /icons/*.png answer 200 with the app's HTML inside, so
// the PWA is not verifiable there at all. Fase 6 reuses this file to serve the SPA in
// production.
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const createHandler = (distUrl: URL) => {
  // Resolved once at startup, and deliberately allowed to throw if dist/ is missing: the
  // containment check below compares real on-disk paths, so the boundary must be a real
  // path too (dist/ may itself sit under a symlinked directory).
  const distReal = realpathSync(fileURLToPath(distUrl));

  const indexHtml = () =>
    new Response(Bun.file(new URL('./index.html', distUrl)), {
      headers: { 'Content-Type': 'text/html' },
    });

  return async (req: Request) => {
    const { pathname } = new URL(req.url);

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
  Bun.serve({ port, fetch: createHandler(new URL('./dist/', import.meta.url)) });
  console.log(`Serving dist on http://localhost:${port}`);
}
