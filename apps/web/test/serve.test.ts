import { test, expect, beforeAll, afterAll } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHandler } from '../serve';

// A real dist/ with a real symlink escaping it: the hole this guards was invisible to any
// string-level assertion, because it lives in the filesystem rather than in the URL.
let root: string;
let distUrl: URL;
let handler: (req: Request) => Promise<Response>;
let proxied: (req: Request) => Promise<Response>;
let upstream: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // happydom.ts replaces the global fetch with happy-dom's, which cannot proxy a Request
  // (verified: "NetworkError: ... Parse Error"). Nothing in this file needs a DOM, and the
  // `test` script runs with --isolate, so dropping the globals here is invisible to the
  // other files.
  await GlobalRegistrator.unregister();

  root = mkdtempSync(join(tmpdir(), 'gc-serve-'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'secret.txt'), 'TOP-SECRET');
  writeFileSync(join(root, 'dist', 'index.html'), '<html>app</html>');
  writeFileSync(join(root, 'dist', 'sw.js'), '// worker');
  symlinkSync('../secret.txt', join(root, 'dist', 'leak.txt'));

  // Echoes what it received into RESPONSE HEADERS, and sets two cookies: the proxy's whole
  // job is to relay both directions faithfully, and headers are the cheapest way to see it.
  upstream = Bun.serve({
    port: 0, // ephemeral: no port to collide with ./dev.sh or the e2e suite
    fetch: async (req) => {
      const url = new URL(req.url);
      const headers = new Headers({
        'x-saw-path': url.pathname + url.search,
        'x-saw-cookie': req.headers.get('cookie') ?? '',
        'x-saw-csrf': req.headers.get('x-requested-with') ?? '',
        'x-saw-body': req.method === 'GET' ? '' : await req.text(),
      });
      headers.append('set-cookie', 'access=A; Path=/; HttpOnly');
      headers.append('set-cookie', 'refresh=R; Path=/; HttpOnly');
      return new Response('upstream-body', { headers });
    },
  });

  // Trailing slash is required, or `new URL('./x', base)` resolves as a sibling of dist/
  // rather than inside it.
  distUrl = pathToFileURL(join(root, 'dist') + '/');
  handler = createHandler(distUrl);
  proxied = createHandler(distUrl, `http://localhost:${upstream.port}`);
});

afterAll(() => {
  upstream.stop(true);
  rmSync(root, { recursive: true, force: true });
});

const get = (path: string) => handler(new Request(`http://localhost${path}`));

// The shell is identified by the Content-Type indexHtml sets explicitly.
const isShell = (res: Response) =>
  res.status === 200 && res.headers.get('Content-Type') === 'text/html';

test('refuses a symlink that escapes dist', async () => {
  expect((await get('/leak.txt')).status).toBe(403);
});

test('falls back to the app shell for SPA deep links', async () => {
  // The containment fix has to keep this fallback: these paths do not exist on disk, so a
  // naive "does not resolve -> 404" would break every statistiche route.
  for (const path of ['/statistiche/spesa', '/home']) {
    expect(isShell(await get(path))).toBe(true);
  }
});

test('does not crash or escape on encoded traversal', async () => {
  // Encoded slashes make fileURLToPath throw; unhandled, that was a 500 on every request.
  for (const path of ['/%2e%2e%2fsecret.txt', '/..%2fsecret.txt', '/../secret.txt']) {
    expect(isShell(await get(path))).toBe(true);
  }
});

test('serves a real file and marks the service worker no-cache', async () => {
  const res = await get('/sw.js');
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('no-cache');
});

const viaProxy = (path: string, init?: RequestInit) =>
  proxied(new Request(`http://localhost${path}`, init));

test('strips the /api prefix before forwarding', async () => {
  const res = await viaProxy('/api/utente/me');
  expect(res.headers.get('x-saw-path')).toBe('/utente/me');
});

test('keeps the query string', async () => {
  const res = await viaProxy('/api/statistiche/spese?interval=M');
  expect(res.headers.get('x-saw-path')).toBe('/statistiche/spese?interval=M');
});

test('forwards the session cookie and the CSRF header upstream', async () => {
  // Without these two the API would answer 401 and 403 respectively, which is exactly the
  // failure the single-origin topology exists to avoid.
  const res = await viaProxy('/api/andamento', {
    headers: { cookie: 'access=FOO; refresh=BAR', 'x-requested-with': 'gc-web' },
  });
  expect(res.headers.get('x-saw-cookie')).toBe('access=FOO; refresh=BAR');
  expect(res.headers.get('x-saw-csrf')).toBe('gc-web');
});

test('returns BOTH Set-Cookie headers to the browser', async () => {
  // Login sets access and refresh together; a proxy that collapses the pair would log the
  // user in for 15 minutes and then out for good.
  const res = await viaProxy('/api/utente/login', { method: 'POST', body: '{}' });
  expect(res.headers.getSetCookie()).toHaveLength(2);
});

test('forwards a request body unchanged', async () => {
  const res = await viaProxy('/api/andamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"descrizione":"spesa","costo":1.5}',
  });
  expect(res.headers.get('x-saw-body')).toBe('{"descrizione":"spesa","costo":1.5}');
});

test('cannot be steered off the internal API', async () => {
  // A leading `//` after the prefix made the URL constructor read the rest of the path as an
  // authority, so /api//evil.com/x was fetched FROM evil.com with the victim's session
  // cookies attached — httpOnly stops JavaScript, not a proxy.
  //
  // Reaching this upstream AT ALL is the assertion: it only exists on an ephemeral localhost
  // port, so a header echoed back proves the host came from the base and not from the path.
  // `\` is covered by the same case — the Request URL parse normalizes it to `/` first. The
  // path arrives with its leading slashes collapsed, which is Bun's HTTP client and not a
  // defense: assert it so a change of behaviour is visible rather than load-bearing.
  for (const suffix of ['//evil.com/x', '///evil.com/x', '/\\evil.com/x', '/\\\\evil.com/x']) {
    const res = await viaProxy(`/api${suffix}`);
    expect(res.headers.get('x-saw-path')).toBe('/evil.com/x');
  }
});

test('does not intercept application routes', async () => {
  // /statistiche/casa is an SPA route AND an API path shape: only the /api prefix may be
  // proxied, or every deep link would be forwarded to the API and 404.
  expect(isShell(await proxied(new Request('http://localhost/statistiche/casa')))).toBe(true);
});

test('answers 502 when the API is unreachable, without leaking the crash page', async () => {
  // Shipped as a 500 in production: the rejected fetch reached Bun.serve, whose default error
  // page embeds the SOURCE of this proxy — 67KB of it, on the public host, and the whole blob
  // then landed in the app's error toast (api-error.ts lets a server body override the
  // message). Port 1 has nothing listening, which is the same ECONNREFUSED.
  const dead = createHandler(distUrl, 'http://127.0.0.1:1');
  const res = await dead(new Request('http://localhost/api/utente/me'));
  expect(res.status).toBe(502);
  expect(await res.text()).toBe('');
});

test('without API_INTERNAL_URL an /api path is just an SPA route', async () => {
  // Development and the e2e harness build the handler with one argument: the proxy must be
  // inert there, not half-configured.
  expect(isShell(await get('/api/utente/me'))).toBe(true);
});
