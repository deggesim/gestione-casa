# Fase 4d — Profilo, PWA e polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the last legacy screen (profilo utente), make the app installable as a PWA, and close the layout parity gaps (mobile hamburger, icons, breadcrumb).

**Architecture:** Frontend-only, all changes under `apps/web`. The PWA is a hand-written service worker with runtime caching (no precache manifest, no build-time asset list, no new dependency) plus a static `Bun.serve` preview server, needed because Bun's dev server cannot serve static files. The profilo screen reuses the react-bootstrap `Modal` + react-hook-form pattern already established by `AndamentoList`/`AndamentoForm` in Fase 4b.

**Tech Stack:** Bun 1.3.14, React 19, TanStack Router + Query, react-hook-form, react-bootstrap, react-icons (fa6), sonner, Eden Treaty, `bun test` + Testing Library + happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-07-phase4d-profilo-pwa-polish-design.md`
**Branch:** `feat/phase4d-profilo-pwa-polish` (already created, spec committed at `2576fa0`)

## Global Constraints

- **Runtime is Bun**, pinned to `1.3.14` in CI. Never npm/node.
- **Run only the web suite while implementing:** `bun run --filter '@gc/web' test` from the repo root, or `bun test --preload ./happydom.ts` from `apps/web`.
- **NEVER run the root `bun run test` without an explicit disposable `DATABASE_URL`.** `apps/api/test/setup.ts` runs `TRUNCATE` on the `gc` schema; in Fase 4b this wiped the development database. This phase is frontend-only and never needs the API suite.
- **No new `mock.module`.** It is process-global and `mock.restore()` does not undo it on this Bun, so a partial mock in one file breaks its siblings. Two files already mock `@tanstack/react-router` (`Layout.test.tsx`, `LoginForm.test.tsx`); when either grows an export, **both must be updated to the same complete superset**.
- **Code style:** named exports, arrow functions (no `function`, no `class`), relative imports, English comments and identifiers. Italian only in user-facing copy and domain names.
- **Prettier:** `singleQuote`, `trailingComma: all`, `printWidth: 100`. `apps/web/public/` is **not** in `.prettierignore`, so files there must be formatted. Fix with `bunx prettier --write .`.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- **All config comes from `.env` per app**, browser vars prefixed `PUBLIC_*`, mirrored in `.env.example`. Never hardcode config in source.
- **Gates before the PR:** `bun run lint`, `bun run typecheck`, and the web suite must all be green.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `apps/web/package.json` | build script env inlining + `preview` script | 1 |
| `apps/web/serve.ts` | static server over `dist/` with SPA fallback | 1 |
| `apps/web/tsconfig.json` | add `serve.ts` to `include` | 1 |
| `apps/web/src/config.ts` | add `ENABLE_SW` | 1 |
| `apps/web/.env.example` | document `PUBLIC_ENABLE_SW` | 1 |
| `apps/web/public/manifest.webmanifest` | PWA manifest, absolute paths | 2 |
| `apps/web/public/favicon.ico`, `public/icons/*.png` | icons copied from the legacy app | 2 |
| `apps/web/index.html` | manifest + icon links | 2 |
| `apps/web/public/sw.js` | service worker, runtime caching | 3 |
| `apps/web/src/pwa/update.ts` | pure update-detection logic | 3 |
| `apps/web/src/pwa/useSwUpdate.ts` | React binding: registration + modal state | 3 |
| `apps/web/src/utente/queries.ts` | `useSaveProfilo` | 4 |
| `apps/web/src/utente/ProfiloModal.tsx` | profile form in a modal | 4 |
| `apps/web/src/layout/breadcrumbs.ts` | pure `crumbsFromMatches` | 6 |
| `apps/web/src/layout/Breadcrumb.tsx` | breadcrumb rendering | 6 |
| `apps/web/src/routes/router.tsx` | per-route `staticData.crumbs` | 6 |
| `apps/web/src/layout/Layout.tsx` | wiring for tasks 3, 4, 5, 6 | 3–6 |

---

## Task 1: Build env inlining + preview server

Blocking prerequisite: today the built bundle keeps a literal `process.env.PUBLIC_API_URL`, so the built app dies in a browser with `ReferenceError: process is not defined`. Nothing else in this phase is verifiable until this is fixed.

**Files:**
- Modify: `apps/web/package.json` (scripts)
- Modify: `apps/web/src/config.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/tsconfig.json`
- Modify: `/home/deggesim/git/gc/gestione-casa/CLAUDE.md` (the env-inlining claim)
- Create: `apps/web/serve.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ENABLE_SW: boolean` exported from `src/config.ts`; `bun run preview` serving `dist/` on `PORT` (default 3000).

- [ ] **Step 1: Prove the bug before fixing it**

From `apps/web`:

```bash
rm -rf dist && bun run build >/dev/null && grep -oE 'process\.env\.[A-Za-z_]+' dist/index-*.js | sort -u
```

Expected: prints `process.env.PUBLIC_API_URL` — the literal survived into the bundle.

- [ ] **Step 2: Fix the build script**

In `apps/web/package.json`, replace the `build` script and add `preview`:

```json
"build": "PUBLIC_ENABLE_SW=${PUBLIC_ENABLE_SW:-false} bun build ./index.html --outdir dist --minify --env 'PUBLIC_*'",
"preview": "bun run build && bun serve.ts",
```

The shell default is not decoration: `--env 'PUBLIC_*'` inlines only variables that are **set**, and leaves an unset one as a literal `process.env.PUBLIC_ENABLE_SW` — reintroducing the exact `ReferenceError` this task removes. The default guarantees the variable always has a value at build time.

- [ ] **Step 3: Verify the fix**

```bash
rm -rf dist && bun run build >/dev/null && grep -c 'process\.env' dist/index-*.js
```

Expected: `0`.

- [ ] **Step 4: Add the service-worker flag to config**

Append to `apps/web/src/config.ts`:

```ts
// Service worker registration is opt-in per environment (see .env.example). Read here,
// not inline at the call site, so the build's --env inlining has one documented touch
// point. Anything unset at build time would survive as a literal `process.env.X` and
// throw in the browser, so package.json's build script always gives it a value.
export const ENABLE_SW = process.env.PUBLIC_ENABLE_SW === 'true';
```

Append to `apps/web/.env.example`:

```
# Register the service worker (PWA). Leave false in development: a service worker
# breaks hot reload, and the dev server cannot serve sw.js anyway.
PUBLIC_ENABLE_SW=false
```

- [ ] **Step 5: Write the preview server**

Create `apps/web/serve.ts`:

```ts
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
    // `new URL` normalises `..`, so this rejects traversal out of dist/.
    if (!target.pathname.startsWith(DIST.pathname)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(target);
    if (!(await file.exists())) return indexHtml();
    // The browser must always revalidate the worker script, otherwise a stale sw.js
    // keeps serving an old app shell.
    const headers = pathname === '/sw.js' ? { 'Cache-Control': 'no-cache' } : undefined;
    return new Response(file, headers ? { headers } : undefined);
  },
});

console.log(`Serving dist on http://localhost:${port}`);
```

In `apps/web/tsconfig.json`, add `serve.ts` to `include`:

```json
"include": ["src", "happydom.ts", "test", "serve.ts"]
```

- [ ] **Step 6: Verify the preview server**

```bash
bun run preview &
sleep 2
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/does-not-exist
kill %1
```

Expected: `200 text/html` for `/`, and `200` for the unknown path (SPA fallback).

- [ ] **Step 7: Correct CLAUDE.md**

In the "Configuration (strict convention)" section, the claim that Bun inlines `PUBLIC_*` "into the browser bundle at build time via `apps/web/bunfig.toml`" is wrong: `[serve.static]` configures the dev server only. Replace that sentence with:

```
- **Frontend env vars must be prefixed `PUBLIC_*`.** The dev server inlines them via `apps/web/bunfig.toml` (`[serve.static] env = "PUBLIC_*"`); `bun build` does **not** — its `--env` flag defaults to `disable`, so the `build` script passes `--env 'PUBLIC_*'` explicitly. A `PUBLIC_*` var that is unset at build time stays in the bundle as a literal `process.env.X`; `process` does not exist in the browser, so it throws `ReferenceError: process is not defined` at load.
```

- [ ] **Step 8: Gates and commit**

```bash
cd ../.. && bun run lint && bun run typecheck && bun run --filter '@gc/web' test
```

Expected: all green, web suite still 70/70.

```bash
git add apps/web/package.json apps/web/serve.ts apps/web/tsconfig.json apps/web/src/config.ts apps/web/.env.example CLAUDE.md
git commit -m "fix(web): inline PUBLIC_* vars into the production bundle

bun build defaults --env to 'disable', so the built bundle kept a
literal process.env.PUBLIC_API_URL and threw ReferenceError in the
browser. bunfig's [serve.static] env covers the dev server only.

Adds serve.ts + a preview script: the dev server falls back to
index.html for every unknown path, so the built output was never
actually served anywhere."
```

---

## Task 2: PWA manifest, icons and favicon

**Files:**
- Create: `apps/web/public/manifest.webmanifest`
- Create: `apps/web/public/favicon.ico`, `apps/web/public/icons/icon-{72,96,128,144,152,192,384,512}x{…}.png`
- Modify: `apps/web/index.html`
- Modify: `apps/web/package.json` (build copies the static assets)

**Interfaces:**
- Consumes: the `build` script from Task 1.
- Produces: `dist/icons/*.png` and a manifest reachable from the built app.

- [ ] **Step 1: Copy the assets from the legacy app**

```bash
mkdir -p apps/web/public/icons
cp /home/deggesim/git/gc/gc-frontend/src/assets/icons/*.png apps/web/public/icons/
cp /home/deggesim/git/gc/gc-frontend/src/favicon.ico apps/web/public/
ls apps/web/public/icons | wc -l
```

Expected: `8`.

- [ ] **Step 2: Write the manifest**

Create `apps/web/public/manifest.webmanifest` — the legacy manifest with **absolute** paths. They must be absolute: Bun rewrites `<link rel="manifest">` to a hashed URL (`./manifest-<hash>.webmanifest` in a build, `/_bun/asset/<hash>.webmanifest` in dev), so relative icon paths would resolve against that location and 404.

```json
{
  "name": "Gestione Casa",
  "short_name": "Gestione Casa",
  "theme_color": "#7FC1AD",
  "background_color": "#7FC1AD",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [
    { "src": "/icons/icon-72x72.png", "sizes": "72x72", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-96x96.png", "sizes": "96x96", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-128x128.png", "sizes": "128x128", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-144x144.png", "sizes": "144x144", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-152x152.png", "sizes": "152x152", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-384x384.png", "sizes": "384x384", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Link them from index.html**

In `apps/web/index.html`, add below the existing `theme-color` meta:

```html
    <link rel="icon" href="./public/favicon.ico" />
    <link rel="manifest" href="./public/manifest.webmanifest" />
```

- [ ] **Step 4: Copy the unreferenced assets at build time**

Bun emits only assets referenced from `index.html`; the icons are referenced from **inside** the manifest, which Bun does not parse. Update the `build` script in `apps/web/package.json`:

```json
"build": "PUBLIC_ENABLE_SW=${PUBLIC_ENABLE_SW:-false} bun build ./index.html --outdir dist --minify --env 'PUBLIC_*' && cp -R public/icons dist/",
```

- [ ] **Step 5: Verify**

```bash
cd apps/web && rm -rf dist && bun run build >/dev/null
ls dist/icons | wc -l
ls dist/*.webmanifest
grep -oE '<link rel="(manifest|icon)"[^>]*>' dist/index.html
```

Expected: `8` icons in `dist/icons/`, one hashed `.webmanifest` in `dist/`, and both links rewritten to hashed filenames.

- [ ] **Step 6: Gates and commit**

```bash
cd ../.. && bun run lint && bun run typecheck
git add apps/web/public apps/web/index.html apps/web/package.json
git commit -m "feat(web): PWA manifest, icons and favicon

Paths inside the manifest are absolute because Bun rewrites the
manifest link to a hashed URL, against which relative icon paths
would resolve and 404. The icons are referenced only from inside the
manifest, which the bundler does not parse, so the build copies them
explicitly."
```

---

## Task 3: Service worker, registration and update prompt

**Files:**
- Create: `apps/web/public/sw.js`
- Create: `apps/web/src/pwa/update.ts`
- Create: `apps/web/src/pwa/useSwUpdate.ts`
- Create: `apps/web/test/pwa-update.test.ts`
- Modify: `apps/web/src/layout/Layout.tsx`
- Modify: `apps/web/package.json` (build copies `sw.js`)

**Interfaces:**
- Consumes: `ENABLE_SW` from `src/config.ts` (Task 1).
- Produces:
  - `watchForUpdate(registration: UpdatableRegistration, hasController: boolean, onReady: (waiting: WaitingWorker) => void): void`
  - `useSwUpdate(): { updateReady: boolean; applyUpdate: () => void; dismiss: () => void }`

- [ ] **Step 1: Write the failing test for the pure update logic**

Create `apps/web/test/pwa-update.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { watchForUpdate } from '../src/pwa/update';

type Listener = () => void;

const fakeWorker = (state = 'installing') => {
  const listeners: Listener[] = [];
  return {
    worker: {
      state,
      postMessage: () => {},
      addEventListener: (_: 'statechange', cb: Listener) => listeners.push(cb),
    },
    setState(next: string) {
      this.worker.state = next;
      for (const cb of listeners) cb();
    },
  };
};

const fakeRegistration = (waiting: ReturnType<typeof fakeWorker>['worker'] | null = null) => {
  const listeners: Listener[] = [];
  return {
    registration: {
      waiting,
      installing: null as ReturnType<typeof fakeWorker>['worker'] | null,
      addEventListener: (_: 'updatefound', cb: Listener) => listeners.push(cb),
    },
    fireUpdateFound() {
      for (const cb of listeners) cb();
    },
  };
};

test('ignores the very first install (no controller yet)', () => {
  const { worker } = fakeWorker('installed');
  const { registration } = fakeRegistration(worker);
  let calls = 0;
  watchForUpdate(registration, false, () => calls++);
  expect(calls).toBe(0);
});

test('reports a worker that is already waiting', () => {
  const { worker } = fakeWorker('installed');
  const { registration } = fakeRegistration(worker);
  const seen: unknown[] = [];
  watchForUpdate(registration, true, (w) => seen.push(w));
  expect(seen).toEqual([worker]);
});

test('reports a worker that finishes installing later', () => {
  const { registration, fireUpdateFound } = fakeRegistration();
  const installing = fakeWorker();
  registration.installing = installing.worker;
  let calls = 0;
  watchForUpdate(registration, true, () => calls++);

  fireUpdateFound();
  expect(calls).toBe(0);
  installing.setState('installed');
  expect(calls).toBe(1);
});

test('does not report a worker that goes redundant', () => {
  const { registration, fireUpdateFound } = fakeRegistration();
  const installing = fakeWorker();
  registration.installing = installing.worker;
  let calls = 0;
  watchForUpdate(registration, true, () => calls++);

  fireUpdateFound();
  installing.setState('redundant');
  expect(calls).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/web`: `bun test --preload ./happydom.ts test/pwa-update.test.ts`

Expected: FAIL — cannot resolve `../src/pwa/update`.

- [ ] **Step 3: Implement the pure update logic**

Create `apps/web/src/pwa/update.ts`:

```ts
// Structural types, not the DOM's ServiceWorker*: happy-dom has no ServiceWorkerContainer,
// so this stays testable with plain fakes. The real registration satisfies these.
export type WaitingWorker = {
  state: string;
  postMessage: (message: string) => void;
  addEventListener: (type: 'statechange', cb: () => void) => void;
};

export type UpdatableRegistration = {
  waiting: WaitingWorker | null;
  installing: WaitingWorker | null;
  addEventListener: (type: 'updatefound', cb: () => void) => void;
};

// Calls onReady when a new worker is installed and waiting to take over. `hasController`
// distinguishes a real update from the very first install, which must not prompt: on a
// first visit there is no previous version to replace.
export const watchForUpdate = (
  registration: UpdatableRegistration,
  hasController: boolean,
  onReady: (waiting: WaitingWorker) => void,
) => {
  if (!hasController) return;
  if (registration.waiting) {
    onReady(registration.waiting);
    return;
  }
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') onReady(installing);
    });
  });
};
```

- [ ] **Step 4: Run the test to verify it passes**

From `apps/web`: `bun test --preload ./happydom.ts test/pwa-update.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the service worker**

Create `apps/web/public/sw.js`:

```js
// Hand-written service worker: runtime caching only, no generated precache list.
// Bun emits hashed asset names, so a precache manifest would need a post-build
// generation step; hashed assets are immutable by construction, which makes plain
// cache-first correct without one.
const CACHE = 'gc-v1';
const SHELL = '/';

// Bun's output is index-<hash>.js / index-<hash>.css. The hash IS the version, so a hit
// can never be stale.
const isImmutableAsset = (pathname) => /^\/index-[a-z0-9]+\.(js|css)$/.test(pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)));
  // Deliberately no skipWaiting() here: the app prompts the user first and only then
  // sends SKIP_WAITING. Activating immediately would swap the app under their feet.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // The API lives on another origin (PUBLIC_API_URL), so this excludes every API call.
  // ponytail: if Fase 6 ever puts web and api on the same domain, add an explicit
  // exclusion for /utente, /andamento, /tipo-spesa and /statistiche.
  if (url.origin !== self.location.origin) return;

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit ?? Response.error())),
    );
  }
});
```

Add it to the build copy in `apps/web/package.json`:

```json
"build": "PUBLIC_ENABLE_SW=${PUBLIC_ENABLE_SW:-false} bun build ./index.html --outdir dist --minify --env 'PUBLIC_*' && cp -R public/icons public/sw.js dist/",
```

- [ ] **Step 6: Write the React binding**

Create `apps/web/src/pwa/useSwUpdate.ts`:

```ts
import { useEffect, useState } from 'react';
import { ENABLE_SW } from '../config';
import { watchForUpdate, type WaitingWorker } from './update';

// Registers the worker (when enabled for this environment) and exposes the state the
// update prompt needs. Mirrors the legacy AppUpdateService + "Aggiornamento app
// disponibile" popup.
export const useSwUpdate = () => {
  const [waiting, setWaiting] = useState<WaitingWorker | null>(null);

  useEffect(() => {
    if (!ENABLE_SW || !('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      // Guard against the reload loop: controllerchange also fires on first activation.
      if (reloading) return;
      reloading = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      watchForUpdate(registration, navigator.serviceWorker.controller !== null, setWaiting);
    });
    // If tsc rejects this call, it is the structural match between the DOM's overloaded
    // addEventListener and the narrow one in UpdatableRegistration — not a logic error.
    // Narrow with `registration as unknown as UpdatableRegistration`; the fakes in
    // test/pwa-update.test.ts define the contract that actually matters.

    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return {
    updateReady: waiting !== null,
    applyUpdate: () => waiting?.postMessage('SKIP_WAITING'),
    dismiss: () => setWaiting(null),
  };
};
```

- [ ] **Step 7: Render the prompt in Layout**

In `apps/web/src/layout/Layout.tsx`, add the imports:

```tsx
import { Modal } from 'react-bootstrap';
import { useSwUpdate } from '../pwa/useSwUpdate';
```

Inside the component, next to the other hooks:

```tsx
const update = useSwUpdate();
```

And immediately before the closing `</>`, after `<Toaster … />`:

```tsx
      <Modal show={update.updateReady} onHide={update.dismiss}>
        <Modal.Header>
          <Modal.Title>Aggiornamento app disponibile</Modal.Title>
        </Modal.Header>
        <Modal.Footer>
          <button type="button" className="btn btn-primary" onClick={update.applyUpdate}>
            Aggiorna
          </button>
          <button type="button" className="btn btn-secondary" onClick={update.dismiss}>
            Annulla
          </button>
        </Modal.Footer>
      </Modal>
```

- [ ] **Step 8: Verify nothing regressed**

`ENABLE_SW` is false under `bun test` (`PUBLIC_ENABLE_SW` is unset there), so `useSwUpdate` returns immediately and the modal never shows.

From the repo root: `bun run --filter '@gc/web' test`

Expected: PASS, 74 tests (70 existing + 4 new).

- [ ] **Step 9: Gates and commit**

```bash
bun run lint && bun run typecheck
git add apps/web/public/sw.js apps/web/src/pwa apps/web/test/pwa-update.test.ts apps/web/src/layout/Layout.tsx apps/web/package.json
git commit -m "feat(web): service worker with runtime caching + update prompt

Cache-first on hashed assets (the hash is the version, so a hit is
never stale), network-first on navigation with an offline app-shell
fallback, everything else untouched. Cross-origin requests are skipped,
which excludes every API call.

The worker never calls skipWaiting on install: it waits for the user to
confirm through the 'Aggiornamento app disponibile' modal, matching the
legacy AppUpdateService. Detection lives in a pure function because
happy-dom has no ServiceWorkerContainer to test against."
```

---

## Task 4: Profilo utente

**Files:**
- Create: `apps/web/src/utente/queries.ts`
- Create: `apps/web/src/utente/ProfiloModal.tsx`
- Create: `apps/web/test/ProfiloModal.test.tsx`
- Modify: `apps/web/src/layout/Layout.tsx`

**Interfaces:**
- Consumes: `apiClient` from `../api/client`, `useMe` from `../auth/useAuth`.
- Produces:
  - `useSaveProfilo(): UseMutationResult<…, unknown, { email: string; password: string }>`
  - `ProfiloModal({ show, onHide }: { show: boolean; onHide: () => void })`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/ProfiloModal.test.tsx`. It seeds the `['me']` cache rather than mocking `useAuth`, exactly as `Layout.test.tsx` does, and does **not** introduce a new `mock.module`.

```tsx
import { test, expect, afterEach } from 'bun:test';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfiloModal } from '../src/utente/ProfiloModal';

afterEach(cleanup);

const renderModal = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(['me'], { id: 1, email: 'utente@example.it' });
  return render(
    <QueryClientProvider client={qc}>
      <ProfiloModal show onHide={() => {}} />
    </QueryClientProvider>,
  );
};

const typeIn = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

test('prefills the email of the current user', () => {
  renderModal();
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('utente@example.it');
});

test('rejects mismatched passwords with a field error and keeps Salva disabled', async () => {
  renderModal();
  typeIn('Nuova password', 'segreto1');
  typeIn('Conferma password', 'segreto2');

  await waitFor(() => expect(screen.getByText('Le password non coincidono')).toBeDefined());
  expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(true);
});

test('clears the mismatch error when the first password is corrected', async () => {
  renderModal();
  typeIn('Nuova password', 'segreto1');
  typeIn('Conferma password', 'segreto2');
  await waitFor(() => expect(screen.getByText('Le password non coincidono')).toBeDefined());

  // Regression guard: react-hook-form only revalidates the field that changed, so without
  // deps: ['confirmPassword'] on newPassword this error would stay on screen forever.
  typeIn('Nuova password', 'segreto2');

  await waitFor(() => expect(screen.queryByText('Le password non coincidono')).toBeNull());
  expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/web`: `bun test --preload ./happydom.ts test/ProfiloModal.test.tsx`

Expected: FAIL — cannot resolve `../src/utente/ProfiloModal`.

- [ ] **Step 3: Write the mutation hook**

Create `apps/web/src/utente/queries.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// PATCH /utente/me revokes every refresh token server-side (utente.service.ts) and clears
// the session cookies, so a successful save always logs the user out. The caller is
// responsible for sending them to /login.
export const useSaveProfilo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data, error } = await apiClient.utente.me.patch(input);
      if (error) throw error;
      return data;
    },
    // Clear rather than invalidate: the cookie is gone, so a refetch would only 401.
    // Same reasoning as useLogout in auth/useAuth.ts.
    onSuccess: () => qc.setQueryData(['me'], null),
  });
};
```

- [ ] **Step 4: Write the modal**

Create `apps/web/src/utente/ProfiloModal.tsx`:

```tsx
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useMe } from '../auth/useAuth';
import { useSaveProfilo } from './queries';

type FormValues = { email: string; newPassword: string; confirmPassword: string };

type Props = { show: boolean; onHide: () => void };

// Port of the legacy user-profile component. One deliberate change: the legacy compared
// the two passwords inside its submit handler and raised a toast on mismatch; here it is
// a field-level validation, so the form simply stays invalid and Salva stays disabled.
export const ProfiloModal = ({ show, onHide }: Props) => {
  const me = useMe();
  const save = useSaveProfilo();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: { email: me.data?.email ?? '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = (v: FormValues) =>
    save.mutate(
      { email: v.email, password: v.newPassword },
      {
        onSuccess: () => {
          onHide();
          toast.success('Utente modificato correttamente');
          toast.warning('Effettua di nuovo il login');
          void navigate({ to: '/login' });
        },
      },
    );

  return (
    <Modal show={show} onHide={onHide} backdrop="static">
      <Modal.Header>
        <Modal.Title>Profilo utente</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form onSubmit={handleSubmit(onSubmit)} aria-label="Profilo utente" noValidate>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              className={`form-control${errors.email ? ' is-invalid' : ''}`}
              {...register('email', { required: 'Il campo email è obbligatorio' })}
            />
            {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
          </div>

          <div className="mb-3">
            <label htmlFor="newPassword" className="form-label">
              Nuova password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className={`form-control${errors.newPassword ? ' is-invalid' : ''}`}
              {...register('newPassword', {
                required: 'Il campo Nuova password è obbligatorio',
                // Without this, correcting newPassword leaves a stale mismatch error on
                // confirmPassword: RHF only revalidates the field that changed.
                deps: ['confirmPassword'],
              })}
            />
            {errors.newPassword && (
              <div className="invalid-feedback">{errors.newPassword.message}</div>
            )}
          </div>

          <div className="mb-3">
            <label htmlFor="confirmPassword" className="form-label">
              Conferma password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={`form-control${errors.confirmPassword ? ' is-invalid' : ''}`}
              {...register('confirmPassword', {
                required: 'Il campo Conferma password è obbligatorio',
                validate: (value, values) =>
                  value === values.newPassword || 'Le password non coincidono',
              })}
            />
            {errors.confirmPassword && (
              <div className="invalid-feedback">{errors.confirmPassword.message}</div>
            )}
          </div>

          <div className="d-grid gap-2 d-sm-flex justify-content-sm-center mt-3 pb-3">
            <button type="submit" className="btn btn-primary" disabled={!isValid || save.isPending}>
              Salva
            </button>
            <button type="button" className="btn btn-primary" onClick={onHide}>
              Annulla
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
};
```

Note: `formState.isValid` is safe here, unlike in `AndamentoForm`. That form opened already-valid when editing an existing record, which exposed RHF's stale-on-mount `isValid`; this one always opens with two empty required password fields, so it starts invalid and `isValid` only ever transitions after a change.

- [ ] **Step 5: Run the test to verify it passes**

From `apps/web`: `bun test --preload ./happydom.ts test/ProfiloModal.test.tsx`

Expected: PASS, 3 tests.

If `useNavigate` is unresolved at import time, remember `LoginForm.test.tsx` already mocks `@tanstack/react-router` process-globally with `{ useNavigate }`. Do **not** add another mock: if the test file needs the router seam, rely on the existing mocks and keep them supersets (see Global Constraints).

- [ ] **Step 6: Wire it into the navbar**

In `apps/web/src/layout/Layout.tsx`, import it and add the state:

```tsx
import { ProfiloModal } from '../utente/ProfiloModal';
```

```tsx
const [profiloOpen, setProfiloOpen] = useState(false);
```

Inside the logged-in section of the navbar, next to the Logout button:

```tsx
          <button className="btn btn-outline-light btn-sm" onClick={() => setProfiloOpen(true)}>
            Profilo Utente
          </button>
```

And before the closing `</>`:

```tsx
      <ProfiloModal show={profiloOpen} onHide={() => setProfiloOpen(false)} />
```

- [ ] **Step 7: Run the whole web suite**

From the repo root: `bun run --filter '@gc/web' test`

Expected: PASS, 77 tests.

- [ ] **Step 8: Gates and commit**

```bash
bun run lint && bun run typecheck
git add apps/web/src/utente apps/web/test/ProfiloModal.test.tsx apps/web/src/layout/Layout.tsx
git commit -m "feat(web): profilo utente modal

Ports the last unmigrated legacy screen. The password mismatch is a
field-level validation instead of the legacy submit-time toast, so the
form stays invalid and Salva stays disabled.

Saving revokes every session (Fase 2's removeAllTokens plus cleared
cookies), so a successful save clears the ['me'] cache and redirects to
/login. The legacy kept the user signed in because the old backend
revoked nothing."
```

---

## Task 5: Layout polish — icons and mobile hamburger

**Files:**
- Modify: `apps/web/src/layout/Layout.tsx`
- Modify: `apps/web/test/Layout.test.tsx`

**Interfaces:**
- Consumes: everything wired in Tasks 3 and 4.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test for the hamburger**

Append to `apps/web/test/Layout.test.tsx`:

```tsx
test('the mobile toggler shows and hides the navbar content', () => {
  const { container } = renderLayout({ id: 1 });
  const collapse = container.querySelector('.navbar-collapse');
  if (!collapse) throw new Error('navbar collapse not rendered');
  expect(collapse.classList.contains('show')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
  expect(collapse.classList.contains('show')).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
  expect(collapse.classList.contains('show')).toBe(false);
});

test('clicking a statistiche entry closes the mobile menu', () => {
  const { container } = renderLayout({ id: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
  fireEvent.click(screen.getByRole('button', { name: /statistiche/i }));

  fireEvent.click(screen.getByText('Spese medie'));

  const collapse = container.querySelector('.navbar-collapse');
  expect(collapse?.classList.contains('show')).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From `apps/web`: `bun test --preload ./happydom.ts test/Layout.test.tsx`

Expected: FAIL — no button named "Apri il menu", no `.navbar-collapse`.

- [ ] **Step 3: Implement the hamburger and swap in the icons**

In `apps/web/src/layout/Layout.tsx`:

Extend the react-icons import:

```tsx
import { FaChartPie, FaHouse, FaMoon, FaRightFromBracket, FaCircleUser, FaSun } from 'react-icons/fa6';
```

Add the collapse state next to `statsOpen`:

```tsx
  // Hand-rolled like the dropdown above, and for the same reason: react-bootstrap's
  // Navbar mounts Popper, which is awkward to assert on under happy-dom.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => {
    setNavOpen(false);
    setStatsOpen(false);
  };
```

Replace the brand's text content with the icon (keep the accessible name):

```tsx
        <Link className="navbar-brand" to={me.data ? '/home' : '/login'} aria-label="Gestione Casa">
          <FaHouse />
        </Link>
```

Add the toggler right after the brand, rendered only when logged in — the legacy shows it only inside its `*ngIf="isLoggedIn$"` block:

```tsx
        {me.data ? (
          <button
            type="button"
            className="navbar-toggler"
            aria-label="Apri il menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="navbar-toggler-icon" />
          </button>
        ) : null}
```

Wrap the existing `<ul className="navbar-nav">` and the right-hand button group in the collapse container:

```tsx
        <div className={`collapse navbar-collapse${navOpen ? ' show' : ''}`}>
```

Every statistiche entry's `onClick` becomes `closeNav` instead of `() => setStatsOpen(false)`.

Swap the theme toggle's emoji for icons and give the two buttons their glyphs:

```tsx
            {isDark ? <FaSun /> : <FaMoon />}
```

```tsx
            <FaRightFromBracket className="me-2" />
            Logout
```

```tsx
            <FaCircleUser className="me-2" />
            Profilo Utente
```

The Logout and Profilo click handlers must also call `closeNav()`, matching the legacy `(click)="isCollapsed = true; …"`.

- [ ] **Step 4: Fix the brand assertion in the existing test**

The first existing test asserts `screen.getByText('Gestione Casa')`, which no longer matches now that the brand is an icon. Change that line to:

```tsx
  expect(screen.getByLabelText('Gestione Casa')).toBeDefined();
```

The theme-toggle assertion (`getByLabelText('Cambia tema')`) still holds — keep the `aria-label` on that button.

- [ ] **Step 5: Run the tests to verify they pass**

From `apps/web`: `bun test --preload ./happydom.ts test/Layout.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 6: Run the whole web suite, gates, commit**

```bash
cd ../.. && bun run --filter '@gc/web' test && bun run lint && bun run typecheck
```

Expected: PASS, 79 tests.

```bash
git add apps/web/src/layout/Layout.tsx apps/web/test/Layout.test.tsx
git commit -m "feat(web): mobile hamburger and header icons

The navbar had no toggler at all, so on a narrow screen the menu
entries were unreachable. Hand-rolled like the existing dropdown,
because react-bootstrap's Navbar mounts Popper.

Replaces the placeholder emoji theme toggle and the text brand with
react-icons fa6 glyphs, closing the parity item deferred in Fase 4a."
```

---

## Task 6: Breadcrumb

**Files:**
- Create: `apps/web/src/layout/breadcrumbs.ts`
- Create: `apps/web/src/layout/Breadcrumb.tsx`
- Create: `apps/web/test/breadcrumbs.test.ts`
- Modify: `apps/web/src/routes/router.tsx`
- Modify: `apps/web/src/layout/Layout.tsx`
- Modify: `apps/web/test/Layout.test.tsx` (router mock superset)
- Modify: `apps/web/test/LoginForm.test.tsx` (router mock superset)

**Interfaces:**
- Consumes: `useMatches` from `@tanstack/react-router`.
- Produces:
  - `type Crumb = { label: string; to?: string }`
  - `crumbsFromMatches(matches: { staticData?: { crumbs?: Crumb[] } }[]): Crumb[]`
  - `Breadcrumb()` — reads `useMatches()` and renders.

- [ ] **Step 1: Write the failing test for the pure part**

Create `apps/web/test/breadcrumbs.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { crumbsFromMatches } from '../src/layout/breadcrumbs';

test('collects the chain declared by the matched routes', () => {
  expect(
    crumbsFromMatches([
      {},
      { staticData: { crumbs: [{ label: 'Spese medie', to: '/statistiche' }, { label: 'Spesa' }] } },
    ]),
  ).toEqual([{ label: 'Spese medie', to: '/statistiche' }, { label: 'Spesa' }]);
});

test('ignores matches without crumbs', () => {
  expect(crumbsFromMatches([{}, { staticData: {} }])).toEqual([]);
});

test('keeps a single-entry chain intact', () => {
  expect(crumbsFromMatches([{ staticData: { crumbs: [{ label: 'Home' }] } }])).toEqual([
    { label: 'Home' },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/web`: `bun test --preload ./happydom.ts test/breadcrumbs.test.ts`

Expected: FAIL — cannot resolve `../src/layout/breadcrumbs`.

- [ ] **Step 3: Implement the pure part**

Create `apps/web/src/layout/breadcrumbs.ts`:

```ts
export type Crumb = { label: string; to?: string };

// The statistiche routes are flat siblings rather than a nested tree (see router.tsx), so
// a match cannot inherit its parent's crumb the way the legacy ActivatedRoute walk did.
// Each route therefore declares its whole chain, and this only flattens what matched.
export const crumbsFromMatches = (matches: { staticData?: { crumbs?: Crumb[] } }[]): Crumb[] =>
  matches.flatMap((match) => match.staticData?.crumbs ?? []);
```

- [ ] **Step 4: Run the test to verify it passes**

From `apps/web`: `bun test --preload ./happydom.ts test/breadcrumbs.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Declare the crumbs on every route**

In `apps/web/src/routes/router.tsx`, add the module augmentation next to the existing `Register` one:

```ts
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    crumbs?: Crumb[];
  }
}
```

with `import type { Crumb } from '../layout/breadcrumbs';` at the top.

Then add `staticData` to each route:

| Route | `staticData` |
| --- | --- |
| `loginRoute` | `{ crumbs: [{ label: 'Login' }] }` |
| `homeRoute` | `{ crumbs: [{ label: 'Home' }] }` |
| `statisticheRoute` | `{ crumbs: [{ label: 'Spese medie' }] }` |
| `speseFrequentiRoute` | `{ crumbs: [{ label: 'Spese medie', to: '/statistiche' }, { label: 'Spese frequenti' }] }` |

For the four bar routes, the label differs per kind, so build it inside the existing `.map`:

```tsx
  const BARRE_LABELS = {
    spesa: 'Spesa',
    carburante: 'Carburante',
    bolletta: 'Bollette',
    casa: 'Casa',
  } as const;
```

and inside the `createRoute` call for each:

```tsx
      staticData: {
        crumbs: [
          { label: 'Spese medie', to: '/statistiche' },
          { label: BARRE_LABELS[kind] },
        ],
      },
```

Note the two deliberate label decisions: `spese-frequenti` reads **"Spese frequenti"**, correcting the legacy's `Lista`; `bolletta` keeps the legacy's plural **"Bollette"** on a singular route, the same quirk already accepted for the navbar in Fase 4c.

- [ ] **Step 6: Write the component**

Create `apps/web/src/layout/Breadcrumb.tsx`:

```tsx
import { Link, useMatches } from '@tanstack/react-router';
import { crumbsFromMatches } from './breadcrumbs';

// Legacy parity: every entry carries breadcrumb-item active, the last one is plain text
// and the earlier ones are links.
export const Breadcrumb = () => {
  const crumbs = crumbsFromMatches(useMatches());
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="breadcrumb">
      <ol className="breadcrumb bg-dark">
        {crumbs.map((crumb, i) => (
          <li className="breadcrumb-item active" key={crumb.label}>
            {i === crumbs.length - 1 || !crumb.to ? (
              <span>{crumb.label}</span>
            ) : (
              <Link to={crumb.to}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
```

- [ ] **Step 7: Render it and keep both router mocks in sync**

In `apps/web/src/layout/Layout.tsx`, import `Breadcrumb` and render it immediately after the closing `</nav>` of the navbar, before `<div className="container-fluid">`.

`Layout` now pulls `useMatches` through `Breadcrumb`, so **both** files that mock `@tanstack/react-router` must expose it — otherwise whichever mock registers last leaves the other file with a missing export, which is exactly how the sonner mock broke CI in Fase 4b.

In `apps/web/test/Layout.test.tsx`:

```tsx
mock.module('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Outlet: () => null,
  useNavigate: () => () => {},
  useMatches: () => [],
}));
```

In `apps/web/test/LoginForm.test.tsx`, replace the partial mock with the identical superset:

```tsx
mock.module('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Outlet: () => null,
  useNavigate: () => () => {},
  useMatches: () => [],
}));
```

adding `import type { ReactNode } from 'react';` if it is not already imported there.

- [ ] **Step 8: Run the whole web suite, gates, commit**

```bash
cd ../.. && bun run --filter '@gc/web' test && bun run lint && bun run typecheck
```

Expected: PASS, 82 tests.

```bash
git add apps/web/src/layout/breadcrumbs.ts apps/web/src/layout/Breadcrumb.tsx apps/web/test/breadcrumbs.test.ts apps/web/src/routes/router.tsx apps/web/src/layout/Layout.tsx apps/web/test/Layout.test.tsx apps/web/test/LoginForm.test.tsx
git commit -m "feat(web): breadcrumb

The routes are flat siblings, so a match cannot inherit its parent's
crumb the way the legacy ActivatedRoute walk did: each route declares
its whole chain in staticData and the component only flattens what
matched.

Corrects the legacy 'Lista' label to 'Spese frequenti'. Both files that
mock the router now expose the same superset, including useMatches."
```

---

## Manual verification (before the PR)

Automated tests cannot cover any of this: Recharts renders nothing under happy-dom, and happy-dom has no service worker.

- [ ] **1. The built app boots.** `cd apps/web && PUBLIC_ENABLE_SW=true bun run preview`, open `http://localhost:3000` — no `ReferenceError: process is not defined` in the console. This is the regression check for Task 1.
- [ ] **2. PWA installability.** DevTools → Application → Manifest: name, colours and all 8 icons resolve; the service worker is registered and activated; Chrome offers to install the app.
- [ ] **3. Offline.** Reload once, then DevTools → Network → Offline and reload: the app shell still renders.
- [ ] **4. Update prompt.** With the preview running, edit `apps/web/public/sw.js` (e.g. bump `CACHE` to `gc-v2`), rebuild, reload: the "Aggiornamento app disponibile" modal appears; `Aggiorna` reloads onto the new version, `Annulla` dismisses it.
- [ ] **5. Profilo.** Mismatched passwords → the field error appears and `Salva` stays disabled; correcting the first password clears it; a valid save redirects to `/login` and the new password works.
- [ ] **6. Hamburger and breadcrumb** at a narrow viewport and at desktop width, across `/home`, `/login` and all six `/statistiche/*` routes.
- [ ] **7. The six statistiche screens actually render their charts** — still outstanding from Fase 4c, where the suite could not see them.

## Landing

- [ ] Whole-branch review by a subagent (`MERGE_BASE=1abf449`), per the user's chosen hybrid execution.
- [ ] Apply the review's findings.
- [ ] `git push -u origin feat/phase4d-profilo-pwa-polish && gh pr create --base master`.
- [ ] Wait for CI green; the user merges.
