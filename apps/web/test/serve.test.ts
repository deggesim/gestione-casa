import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHandler } from '../serve';

// A real dist/ with a real symlink escaping it: the hole this guards was invisible to any
// string-level assertion, because it lives in the filesystem rather than in the URL.
let root: string;
let handler: (req: Request) => Promise<Response>;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gc-serve-'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'secret.txt'), 'TOP-SECRET');
  writeFileSync(join(root, 'dist', 'index.html'), '<html>app</html>');
  writeFileSync(join(root, 'dist', 'sw.js'), '// worker');
  symlinkSync('../secret.txt', join(root, 'dist', 'leak.txt'));
  // Trailing slash is required, or `new URL('./x', base)` resolves as a sibling of dist/
  // rather than inside it.
  handler = createHandler(pathToFileURL(join(root, 'dist') + '/'));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const get = (path: string) => handler(new Request(`http://localhost${path}`));

// happydom.ts is preloaded for the component suite, and happy-dom's global Response
// stringifies a BunFile body to "[object Blob]" — so bodies are not readable here.
// Everything below asserts on status and headers, which survive both runtimes and are
// where the security property lives anyway: a 403 has no body to leak, and the shell is
// identified by the Content-Type indexHtml sets explicitly.
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
