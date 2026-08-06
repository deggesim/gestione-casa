# Fase 4b — Andamento (lista + modifica) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the legacy Angular Andamento list + edit screens to React with full behaviour parity, and add the CSRF custom-header defense deferred from 4a.

**Architecture:** New `apps/web/src/andamento/` vertical slice (Query hooks → pure list utils → a modal form → the list screen) mounted at `/home` (replacing the 4a stub). All list logic (filter/sort/paginate) is client-side over one `GET /andamento`, exactly like the legacy resolver. A pure `assertCsrf(request)` wired into `buildApp()` rejects mutating requests without the `X-Requested-With` header; the Eden client sends it on every request.

**Tech Stack:** Bun, React 19, TanStack Query + Router, Eden Treaty, react-hook-form, react-bootstrap (`Modal`/`Pagination`), react-icons, sonner, Elysia + `@elysiajs/cors`, TypeBox (`@gc/shared-types`).

**Spec:** `docs/superpowers/specs/2026-07-09-phase4b-andamento-design.md`
**Branch:** `feat/phase4b-andamento` (already created off `master` @ 424dc85; the spec is committed at `e1a11d3`). Per-task commits are authorized; land via `gh pr create` to `master` at the end.

## Global Constraints

- **Runtime:** Bun (pinned `1.3.14` in CI). Use `bun`, never npm/node.
- **TS strict:** `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler` (from `tsconfig.base.json`). Use `import type` for type-only imports.
- **Style:** Prettier `singleQuote`, `trailingComma: all`, `printWidth: 100`. Named exports only, relative imports only, **arrow functions only** (no `function` keyword), **no `class`** (the sole exception is the `Error` subclasses in `apps/api/src/errors.ts`). English code/comments; **Italian domain vocabulary + all UI strings** (kept identical to the legacy app).
- **Config:** all runtime config in per-app `.env` (gitignored) + committed `.env.example`; never hardcode URLs/ports/secrets. Frontend vars must be `PUBLIC_*`. **A protocol constant (route path, CSRF header name) is NOT env config** — it lives in code/`@gc/shared-types`.
- **CSRF contract constant:** header name `X-Requested-With`, value `gc-web`. The server checks **presence** of the header on mutating methods (value not compared); the client sends name+value. Both import the name from `@gc/shared-types`.
- **Hardcoded category IDs (load-bearing coupling):** `1=spesa, 2=carburante, 3=bolletta, 7=casa`. The three quick-add prefills use `1` (Spesa), `2` (Carburante / "Gasolio Fiesta"), `7` (Casa / "Michela pulizie").
- **Eden call convention:** `apiClient.andamento.get()` (list); `apiClient.andamento.post(body)` (create); `apiClient.andamento({ id }).put(body)` / `.delete()`; `apiClient['tipo-spesa'].get()`. Every call returns `{ data, error, status, response }`; hooks `throw error` when `error` is truthy.
- **Auth:** cookie-based; the Eden client already sends `credentials: 'include'`. Errors are globally toasted by the 4a `QueryCache`/`MutationCache` handler; a 401 triggers refresh→retry/redirect. New mutations rely on that — do not add per-call error toasts, only success/parity toasts in `onSuccess`.

## Test environment (pass to every implementer that runs tests)

- Bun 1.3.14, Postgres on `localhost:5432`.
- **TEST DB (isolated, safe to TRUNCATE):** `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test`, `JWT_SECRET=test-secret`. **Never** point at the dev `postgres` DB (`apps/api/test/setup.ts` TRUNCATEs).
- API/shared test (single file): `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/<file>` (run from repo root).
- Web test (single file): `cd apps/web && bun test --preload ./happydom.ts test/<file>` — web tests MUST stay in their own happy-dom process (they override `Request`/`fetch`; mixing with api tests breaks both).
- Full suite (green gate): `bun run test` from root (runs api + shared-types, then web isolated).
- Typecheck: `bun run typecheck`. Lint: `bun run lint` (fix with `bunx prettier --write .`).

## Adjudication notes (pre-flight scan — GOVERN, do not "fix")

- **Parity quirks are intentional, not bugs:** filter applies only when the query length is **> 2** characters; pagination is shown only when the (filtered) list length **> 10**; the yearly/monthly prefill descriptions ("Gasolio Fiesta", "Michela pulizie") and category IDs (1/2/7) are verbatim-legacy. Tests lock these — do not "simplify" them away.
- **Native inputs are a decided simplification:** no popup calendar / live currency mask / searchable select. `<input type="date">`, `<input type="number">`, `<select>` are correct here by explicit user decision.
- **CSRF value is not compared** — the defense is the presence of a non-safelisted header name. Do not add value-equality checks.
- **The API is otherwise frozen:** the only backend change in 4b is the CSRF wiring (Task 1). Do not alter routes/services/schemas.

---

### Task 1: CSRF custom-header defense (backend + client + test ripple)

Introduce everything CSRF in one coherent commit so the suite never stays red: the shared header constant, the pure guard + error mapping, the `buildApp` wiring (incl. CORS), the web client header, and the updates to the 4 existing api test files that issue mutating requests.

**Files:**
- Create: `packages/shared-types/src/csrf.ts`
- Modify: `packages/shared-types/src/index.ts`
- Create: `apps/api/src/auth/csrf.ts`
- Modify: `apps/api/src/errors.ts`
- Modify: `apps/api/src/app.ts:10-17`
- Create: `apps/api/test/csrf.test.ts`
- Modify: `apps/api/test/andamento.test.ts:12-42` (the `login`/`req` helpers)
- Modify: `apps/api/test/utente.test.ts:16-26` (the `send` helper)
- Modify: `apps/api/test/tipo-spesa.test.ts:16-32` (the `login` helper)
- Modify: `apps/api/test/contract.test.ts:19` (the in-memory treaty client)
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `CSRF_HEADER = 'X-Requested-With'`, `CSRF_VALUE = 'gc-web'` (from `@gc/shared-types`); `assertCsrf(request: Request): void` (throws `ForbiddenError` on a mutating request lacking the header); `ForbiddenError` (→ 403).
- Consumes: nothing from other tasks.

- [ ] **Step 1: Add the shared CSRF constants**

Create `packages/shared-types/src/csrf.ts`:

```ts
// CSRF defense contract shared by api (enforces) and web (sends).
// The DEFENSE is the header NAME: it is not CORS-safelisted, so a cross-site
// page cannot set it without a preflight, which our strict CORS_ORIGIN denies.
// The value is arbitrary and is NOT compared server-side.
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'gc-web';
```

Add to `packages/shared-types/src/index.ts` (alongside the existing re-exports):

```ts
export * from './csrf';
```

- [ ] **Step 2: Write the failing pure-guard test**

Create `apps/api/test/csrf.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { assertCsrf } from '../src/auth/csrf';
import { buildApp } from '../src/app';

const reqOf = (method: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method, headers });

test('assertCsrf: safe methods pass without the header', () => {
  expect(() => assertCsrf(reqOf('GET'))).not.toThrow();
  expect(() => assertCsrf(reqOf('HEAD'))).not.toThrow();
  expect(() => assertCsrf(reqOf('OPTIONS'))).not.toThrow();
});

test('assertCsrf: mutating method without the header throws', () => {
  expect(() => assertCsrf(reqOf('POST'))).toThrow();
  expect(() => assertCsrf(reqOf('PUT'))).toThrow();
  expect(() => assertCsrf(reqOf('DELETE'))).toThrow();
});

test('assertCsrf: mutating method with the header passes', () => {
  expect(() => assertCsrf(reqOf('POST', { [CSRF_HEADER]: CSRF_VALUE }))).not.toThrow();
});

test('POST without the CSRF header → 403 (end-to-end through buildApp)', async () => {
  const res = await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.it', password: 'pw' }),
    }),
  );
  expect(res.status).toBe(403);
});

test('POST with the CSRF header is not blocked by CSRF', async () => {
  const res = await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'x@y.it', password: 'pw' }),
    }),
  );
  expect(res.status).not.toBe(403);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/csrf.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/csrf'` (and 403 assertions fail).

- [ ] **Step 4: Add `ForbiddenError` → 403**

Modify `apps/api/src/errors.ts` — add the class and the switch case:

```ts
import type { Elysia } from 'elysia';

export class BadRequestError extends Error {}
export class NotFoundError extends Error {}
export class AuthError extends Error {}
export class ForbiddenError extends Error {}

export const withErrorHandling = <T extends Elysia>(app: T) =>
  app
    .error({ BadRequestError, NotFoundError, AuthError, ForbiddenError })
    .onError(({ code, error, status }) => {
      switch (code) {
        case 'BadRequestError':
          return status(400, { message: error.message });
        case 'NotFoundError':
          return status(404, { message: error.message });
        case 'AuthError':
          return status(401, { message: error.message });
        case 'ForbiddenError':
          return status(403, { message: error.message });
        case 'VALIDATION':
          return status(400, { message: error.message });
      }
    });
```

- [ ] **Step 5: Create the pure guard**

Create `apps/api/src/auth/csrf.ts`:

```ts
import { CSRF_HEADER } from '@gc/shared-types';
import { ForbiddenError } from '../errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Reject state-changing requests that lack the custom CSRF header. Presence is
// the defense (see csrf.ts in shared-types); the value is not inspected.
export const assertCsrf = (request: Request): void => {
  if (!MUTATING.has(request.method)) return;
  const header = request.headers.get(CSRF_HEADER);
  if (!header) throw new ForbiddenError('Richiesta non consentita');
};
```

- [ ] **Step 6: Wire into `buildApp` (guard + CORS allowedHeaders)**

Modify `apps/api/src/app.ts` — import the guard and the constant, add the `.onRequest` guard, and make CORS explicitly allow the custom header (the browser sends it cross-origin in dev, triggering a preflight):

```ts
import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { CSRF_HEADER } from '@gc/shared-types';
import { env } from './env';
import { withErrorHandling } from './errors';
import { assertCsrf } from './auth/csrf';
import { tipoSpesaRoutes } from './tipo-spesa/tipo-spesa.routes';
import { andamentoRoutes } from './andamento/andamento.routes';
import { utenteRoutes } from './utente/utente.routes';
import { statisticheRoutes } from './statistiche/statistiche.routes';

export const buildApp = () =>
  withErrorHandling(new Elysia())
    .use(
      cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
        // The web client sends exactly these two non-safelisted request headers on
        // mutating JSON requests; the custom CSRF header must be allowed or the
        // cross-origin dev preflight (3000→5000) fails. Do NOT set `methods` — the
        // plugin default allows all verbs; an explicit list would silently break the
        // existing PATCH /utente/me route (added in Phase 2).
        allowedHeaders: ['content-type', CSRF_HEADER],
      }),
    )
    .onRequest(({ request }) => assertCsrf(request))
    .get('/health', () => ({ status: 'ok' }))
    .use(tipoSpesaRoutes)
    .use(andamentoRoutes)
    .use(utenteRoutes)
    .use(statisticheRoutes);

export type App = ReturnType<typeof buildApp>;
```

- [ ] **Step 7: Run the CSRF test → pass**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/csrf.test.ts`
Expected: PASS (all 5 tests). If the "403" end-to-end test still fails, confirm `.onRequest` runs before routing and that `ForbiddenError` is registered in `.error({...})`.

- [ ] **Step 8: Update the 4 api test files to send the header on mutating requests**

The guard now 403s every existing mutating request. Add the header to each file's request helper.

`apps/api/test/andamento.test.ts` — add the header to BOTH `login()` requests and the `req` helper:

```ts
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
// ...
const login = async () => {
  await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  const res = await buildApp().handle(
    new Request('http://localhost/utente/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  return cookieHeader(res);
};

const req = (path: string, init: RequestInit = {}) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie, [CSRF_HEADER]: CSRF_VALUE },
    }),
  );
```

`apps/api/test/utente.test.ts` — add the header to the `send` helper:

```ts
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
// ...
const send = (path: string, method: string, body?: unknown, cookie?: string) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        [CSRF_HEADER]: CSRF_VALUE,
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
```

`apps/api/test/tipo-spesa.test.ts` — add the header to BOTH `login()` requests (the `get` helper is GET-only, no change needed):

```ts
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
// ...
const login = async () => {
  await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  const res = await buildApp().handle(
    new Request('http://localhost/utente/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  return cookieHeader(res);
};
```

`apps/api/test/contract.test.ts` — the in-memory treaty client is the same shape as the browser client; give it the header globally (this doubles as verification of the client-side mechanism):

```ts
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
// ...
const api = treaty(buildApp(), { headers: { [CSRF_HEADER]: CSRF_VALUE } });
```

- [ ] **Step 9: Add the header to the web Eden client**

Modify `apps/web/src/api/client.ts`:

```ts
import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { API_URL } from '../config';

// Cookie-based auth: credentials:'include' sends the httpOnly access/refresh cookies.
// CSRF: a custom header on every request (mutating routes require it server-side).
export const apiClient = treaty<App>(API_URL, {
  fetch: { credentials: 'include' },
  headers: { [CSRF_HEADER]: CSRF_VALUE },
});
```

- [ ] **Step 10: Run the full api/shared suite + typecheck → green**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api packages/shared-types`
Expected: PASS (all previously-green files + the new `csrf.test.ts`). No 403 regressions.
Run: `bun run typecheck` → all workspaces exit 0.
Run: `bun run lint` (or `bunx prettier --write .`).

- [ ] **Step 11: Commit**

```bash
git add packages/shared-types/src/csrf.ts packages/shared-types/src/index.ts \
        apps/api/src/auth/csrf.ts apps/api/src/errors.ts apps/api/src/app.ts \
        apps/api/test/csrf.test.ts apps/api/test/andamento.test.ts \
        apps/api/test/utente.test.ts apps/api/test/tipo-spesa.test.ts \
        apps/api/test/contract.test.ts apps/web/src/api/client.ts
git commit -m "feat(api,web): CSRF custom-header defense (X-Requested-With) on mutating routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Data layer — `andamento/queries.ts`

TanStack Query hooks over the typed Eden client. Errors auto-toast via the 4a global handler; these hooks only fetch/mutate and invalidate.

**Files:**
- Create: `apps/web/src/andamento/queries.ts`
- Test: `apps/web/test/queries.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (`apps/web/src/api/client.ts`); `Andamento`, `AndamentoInput`, `TipoSpesa` (`@gc/shared-types`).
- Produces: `useAndamentoList()` → `UseQueryResult<Andamento[]>`; `useTipoSpesaList()` → `UseQueryResult<TipoSpesa[]>`; `useSaveAndamento()` → mutation taking `AndamentoInput` (POST when `id` is null/undefined, else PUT); `useDeleteAndamento()` → mutation taking `id: number`. Both mutations invalidate `['andamento']`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/queries.test.tsx`:

```tsx
import { test, expect, mock, afterAll } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const get = mock(async () => ({ data: [{ id: 1 }], error: null }));
const post = mock(async () => ({ data: { id: 9 }, error: null }));
const put = mock(async () => ({ data: { id: 5 }, error: null }));
const del = mock(async () => ({ data: { deleted: 1 }, error: null }));
const byId = mock((_args: { id: number }) => ({ put, delete: del }));
const andamento: Record<string, unknown> = Object.assign(byId, { get, post });

mock.module('../src/api/client', () => ({
  apiClient: {
    andamento,
    'tipo-spesa': { get: async () => ({ data: [{ id: 1, descrizione: 'spesa' }], error: null }) },
  },
}));

afterAll(() => mock.restore());

const wrapper =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

const freshQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

test('useAndamentoList fetches GET /andamento', async () => {
  const { useAndamentoList } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useAndamentoList(), { wrapper: wrapper(freshQc()) });
  await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
});

test('useSaveAndamento POSTs when id is absent, PUTs when present', async () => {
  post.mockClear();
  put.mockClear();
  byId.mockClear();
  const { useSaveAndamento } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useSaveAndamento(), { wrapper: wrapper(freshQc()) });

  result.current.mutate({ giorno: '2025-01-01', descrizione: 'x', costo: 5, tipoSpesa: { id: 1 } });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

  result.current.mutate({
    id: 5,
    giorno: '2025-01-01',
    descrizione: 'x',
    costo: 5,
    tipoSpesa: { id: 1 },
  });
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(byId).toHaveBeenCalledWith({ id: 5 });
});

test('useDeleteAndamento DELETEs by id', async () => {
  del.mockClear();
  byId.mockClear();
  const { useDeleteAndamento } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useDeleteAndamento(), { wrapper: wrapper(freshQc()) });
  result.current.mutate(7);
  await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
  expect(byId).toHaveBeenCalledWith({ id: 7 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/queries.test.tsx`
Expected: FAIL — `Cannot find module '../src/andamento/queries'`.

- [ ] **Step 3: Implement `queries.ts`**

Create `apps/web/src/andamento/queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AndamentoInput } from '@gc/shared-types';
import { apiClient } from '../api/client';

export const useAndamentoList = () =>
  useQuery({
    queryKey: ['andamento'],
    queryFn: async () => {
      const { data, error } = await apiClient.andamento.get();
      if (error) throw error;
      return data;
    },
  });

export const useTipoSpesaList = () =>
  useQuery({
    queryKey: ['tipo-spesa'],
    queryFn: async () => {
      const { data, error } = await apiClient['tipo-spesa'].get();
      if (error) throw error;
      return data;
    },
  });

// Create (no id) or update (id present) — mirrors the legacy `salva()`.
export const useSaveAndamento = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AndamentoInput) => {
      const { data, error } =
        input.id != null
          ? await apiClient.andamento({ id: input.id }).put(input)
          : await apiClient.andamento.post(input);
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['andamento'] }),
  });
};

export const useDeleteAndamento = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await apiClient.andamento({ id }).delete();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['andamento'] }),
  });
};
```

- [ ] **Step 4: Run it to verify it passes + typecheck**

Run: `cd apps/web && bun test --preload ./happydom.ts test/queries.test.tsx`
Expected: PASS (3 tests).
Run: `bun run typecheck` (from root) → exit 0. If the Eden `apiClient.andamento({ id }).put(...)` call does not typecheck, verify the treaty path-param syntax against the installed `@elysiajs/eden` (see `contract.test.ts`'s `api.statistiche.spesa({ interval }).get()` for the confirmed pattern) and adjust the call shape (not the return handling).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/andamento/queries.ts apps/web/test/queries.test.tsx
git commit -m "feat(web): andamento Query hooks (list, tipo-spesa, save, delete)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Form values/prefills + `AndamentoForm`

The modal body: a react-hook-form form with native inputs. The list (Task 5) wraps it in a `<Modal>`; here it is a standalone component so it renders/tests in isolation.

**Files:**
- Create: `apps/web/src/andamento/prefills.ts`
- Create: `apps/web/src/andamento/AndamentoForm.tsx`
- Test: `apps/web/test/prefills.test.ts`
- Test: `apps/web/test/AndamentoForm.test.tsx`

**Interfaces:**
- Consumes: `Andamento`, `AndamentoInput`, `TipoSpesa` (`@gc/shared-types`).
- Produces:
  - `FormValues = { id?: number | null; giorno: string; descrizione: string; costo: number | ''; tipoSpesaId: number | '' }`
  - `today(): string` (local `YYYY-MM-DD`); `emptyForm(): FormValues`; `prefillForm(p: { descrizione: string; tipoSpesaId: number }): FormValues`; `formFromAndamento(a: Andamento): FormValues`; `cloneForm(a: Andamento): FormValues`; `PREFILLS: Record<'spesa'|'carburante'|'pulizie', { titolo: string; descrizione: string; tipoSpesaId: number }>`.
  - `AndamentoForm` props: `{ titolo: string; initial: FormValues; tipiSpesa: TipoSpesa[]; submitting?: boolean; onSubmit: (input: AndamentoInput) => void; onCancel: () => void }`.

- [ ] **Step 1: Write the failing prefills test**

Create `apps/web/test/prefills.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  today,
  emptyForm,
  prefillForm,
  formFromAndamento,
  cloneForm,
  PREFILLS,
} from '../src/andamento/prefills';

test('today is a YYYY-MM-DD string', () => {
  expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('emptyForm defaults giorno to today and clears the rest', () => {
  const f = emptyForm();
  expect(f.giorno).toBe(today());
  expect(f.descrizione).toBe('');
  expect(f.costo).toBe('');
  expect(f.tipoSpesaId).toBe('');
  expect(f.id).toBeUndefined();
});

test('PREFILLS carry the legacy descriptions and category IDs', () => {
  expect(PREFILLS.spesa).toEqual({ titolo: 'Spesa', descrizione: 'Spesa', tipoSpesaId: 1 });
  expect(PREFILLS.carburante).toEqual({
    titolo: 'Carburante',
    descrizione: 'Gasolio Fiesta',
    tipoSpesaId: 2,
  });
  expect(PREFILLS.pulizie).toEqual({
    titolo: 'Pulizie casa',
    descrizione: 'Michela pulizie',
    tipoSpesaId: 7,
  });
});

test('prefillForm keeps today + prefilled descrizione/tipoSpesa, no id', () => {
  const f = prefillForm(PREFILLS.carburante);
  expect(f).toEqual({ giorno: today(), descrizione: 'Gasolio Fiesta', costo: '', tipoSpesaId: 2 });
});

const a = { id: 3, giorno: '2025-01-10', descrizione: 'spesa gen', costo: 100, tipoSpesa: { id: 1, descrizione: 'spesa' } };

test('formFromAndamento maps every field incl. id', () => {
  expect(formFromAndamento(a)).toEqual({
    id: 3,
    giorno: '2025-01-10',
    descrizione: 'spesa gen',
    costo: 100,
    tipoSpesaId: 1,
  });
});

test('cloneForm drops the id and resets giorno to today', () => {
  const f = cloneForm(a);
  expect(f.id).toBeUndefined();
  expect(f.giorno).toBe(today());
  expect(f.descrizione).toBe('spesa gen');
  expect(f.costo).toBe(100);
  expect(f.tipoSpesaId).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/prefills.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `prefills.ts`**

Create `apps/web/src/andamento/prefills.ts`:

```ts
import type { Andamento } from '@gc/shared-types';

export type FormValues = {
  id?: number | null;
  giorno: string; // YYYY-MM-DD (matches <input type="date">)
  descrizione: string;
  costo: number | '';
  tipoSpesaId: number | '';
};

// Local calendar date as YYYY-MM-DD (avoids UTC shift from toISOString()).
export const today = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const emptyForm = (): FormValues => ({
  giorno: today(),
  descrizione: '',
  costo: '',
  tipoSpesaId: '',
});

export const prefillForm = (p: { descrizione: string; tipoSpesaId: number }): FormValues => ({
  giorno: today(),
  descrizione: p.descrizione,
  costo: '',
  tipoSpesaId: p.tipoSpesaId,
});

export const formFromAndamento = (a: Andamento): FormValues => ({
  id: a.id,
  giorno: a.giorno,
  descrizione: a.descrizione,
  costo: a.costo,
  tipoSpesaId: a.tipoSpesa.id,
});

export const cloneForm = (a: Andamento): FormValues => ({
  giorno: today(),
  descrizione: a.descrizione,
  costo: a.costo,
  tipoSpesaId: a.tipoSpesa.id,
});

// Legacy quick-add presets (descriptions + category IDs are verbatim-legacy).
export const PREFILLS = {
  spesa: { titolo: 'Spesa', descrizione: 'Spesa', tipoSpesaId: 1 },
  carburante: { titolo: 'Carburante', descrizione: 'Gasolio Fiesta', tipoSpesaId: 2 },
  pulizie: { titolo: 'Pulizie casa', descrizione: 'Michela pulizie', tipoSpesaId: 7 },
} as const;
```

- [ ] **Step 4: Run prefills test → pass**

Run: `cd apps/web && bun test --preload ./happydom.ts test/prefills.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing form test**

Create `apps/web/test/AndamentoForm.test.tsx`:

```tsx
import { test, expect, mock } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AndamentoForm } from '../src/andamento/AndamentoForm';
import { emptyForm, formFromAndamento } from '../src/andamento/prefills';

const tipiSpesa = [
  { id: 1, descrizione: 'spesa' },
  { id: 2, descrizione: 'carburante' },
];

test('Salva is disabled until every required field is valid', async () => {
  render(
    <AndamentoForm
      titolo="Nuova voce di spesa"
      initial={emptyForm()}
      tipiSpesa={tipiSpesa}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  const salva = () => screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
  expect(salva().disabled).toBe(true);

  fireEvent.change(screen.getByLabelText(/descrizione/i), { target: { value: 'pane' } });
  fireEvent.change(screen.getByLabelText(/costo/i), { target: { value: '3.5' } });
  fireEvent.change(screen.getByLabelText(/tipo spesa/i), { target: { value: '1' } });
  // giorno is pre-filled by emptyForm(); all required fields now set
  await waitFor(() => expect(salva().disabled).toBe(false));
});

test('costo below 0.01 keeps the form invalid', async () => {
  render(
    <AndamentoForm
      titolo="x"
      initial={emptyForm()}
      tipiSpesa={tipiSpesa}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText(/descrizione/i), { target: { value: 'p' } });
  fireEvent.change(screen.getByLabelText(/tipo spesa/i), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/costo/i), { target: { value: '0' } });
  const salva = () => screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
  await waitFor(async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(salva().disabled).toBe(true);
  });
});

test('submit builds an AndamentoInput with tipoSpesa:{id}, numeric costo, and the id when editing', async () => {
  const onSubmit = mock((_input: unknown) => {});
  render(
    <AndamentoForm
      titolo="Modifica voce di spesa"
      initial={formFromAndamento({
        id: 3,
        giorno: '2025-01-10',
        descrizione: 'spesa gen',
        costo: 100,
        tipoSpesa: { id: 1, descrizione: 'spesa' },
      })}
      tipiSpesa={tipiSpesa}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit).toHaveBeenCalledWith({
    id: 3,
    giorno: '2025-01-10',
    descrizione: 'spesa gen',
    costo: 100,
    tipoSpesa: { id: 1 },
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoForm.test.tsx`
Expected: FAIL — `Cannot find module '../src/andamento/AndamentoForm'`.

- [ ] **Step 7: Implement `AndamentoForm.tsx`**

Create `apps/web/src/andamento/AndamentoForm.tsx`:

```tsx
import { useForm } from 'react-hook-form';
import type { AndamentoInput, TipoSpesa } from '@gc/shared-types';
import type { FormValues } from './prefills';

type Props = {
  titolo: string;
  initial: FormValues;
  tipiSpesa: TipoSpesa[];
  submitting?: boolean;
  onSubmit: (input: AndamentoInput) => void;
  onCancel: () => void;
};

const toInput = (v: FormValues): AndamentoInput => ({
  ...(v.id != null ? { id: v.id } : {}),
  giorno: v.giorno,
  descrizione: v.descrizione,
  costo: Number(v.costo),
  tipoSpesa: { id: Number(v.tipoSpesaId) },
});

// Edit/create form (native inputs). Rendered inside a Modal by AndamentoList.
// Mounted fresh per open, so defaultValues carry the right prefill — no reset needed.
export const AndamentoForm = ({
  titolo,
  initial,
  tipiSpesa,
  submitting,
  onSubmit,
  onCancel,
}: Props) => {
  const {
    register,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<FormValues>({ mode: 'onChange', defaultValues: initial });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toInput(v)))} noValidate>
      <div className="row">
        <div className="col-sm-6 mb-3">
          <label htmlFor="giorno" className="form-label">
            Giorno *
          </label>
          <input
            id="giorno"
            type="date"
            className={`form-control${errors.giorno ? ' is-invalid' : ''}`}
            {...register('giorno', { required: 'Il campo giorno è obbligatorio' })}
          />
          {errors.giorno && <div className="invalid-feedback">{errors.giorno.message}</div>}
        </div>

        <div className="col-sm-6 mb-3">
          <label htmlFor="tipoSpesa" className="form-label">
            Tipo spesa *
          </label>
          <select
            id="tipoSpesa"
            className={`form-select${errors.tipoSpesaId ? ' is-invalid' : ''}`}
            {...register('tipoSpesaId', {
              required: 'Il campo tipo spesa è obbligatorio',
              valueAsNumber: true,
            })}
          >
            <option value="">-- seleziona --</option>
            {tipiSpesa.map((t) => (
              <option key={t.id} value={t.id}>
                {t.descrizione}
              </option>
            ))}
          </select>
          {errors.tipoSpesaId && (
            <div className="invalid-feedback">{errors.tipoSpesaId.message}</div>
          )}
        </div>

        <div className="col-sm-6 mb-3">
          <label htmlFor="descrizione" className="form-label">
            Descrizione *
          </label>
          <input
            id="descrizione"
            type="text"
            className={`form-control${errors.descrizione ? ' is-invalid' : ''}`}
            {...register('descrizione', { required: 'Il campo descrizione è obbligatorio' })}
          />
          {errors.descrizione && (
            <div className="invalid-feedback">{errors.descrizione.message}</div>
          )}
        </div>

        <div className="col-sm-6 mb-3">
          <label htmlFor="costo" className="form-label">
            Costo *
          </label>
          <input
            id="costo"
            type="number"
            step="0.01"
            min="0.01"
            className={`form-control${errors.costo ? ' is-invalid' : ''}`}
            {...register('costo', {
              required: 'Il campo costo è obbligatorio',
              min: { value: 0.01, message: 'Il campo costo deve essere maggiore di zero' },
              valueAsNumber: true,
            })}
          />
          {errors.costo && <div className="invalid-feedback">{errors.costo.message}</div>}
        </div>
      </div>

      <div className="d-grid gap-2 d-sm-flex justify-content-sm-center mt-3">
        <button type="submit" className="btn btn-primary" disabled={!isValid || submitting}>
          Salva
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </form>
  );
};
```

> Note: `titolo` is a prop so the list can render it in the `Modal.Header`; the form itself does not render the title. If lint flags `titolo` as unused, render it as an `aria-label` on the `<form>` (`aria-label={titolo}`) rather than dropping the prop.

- [ ] **Step 8: Run the form test → pass**

Run: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoForm.test.tsx`
Expected: PASS (3 tests). Run typecheck: `bun run typecheck` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/andamento/prefills.ts apps/web/src/andamento/AndamentoForm.tsx \
        apps/web/test/prefills.test.ts apps/web/test/AndamentoForm.test.tsx
git commit -m "feat(web): AndamentoForm (native date/number/select) + form-value builders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: List read-path — utils + `AndamentoList` (table/filter/sort/pagination) + route swap

The read-only screen: fetch the list, format, filter (>2 chars), sort by column, paginate (>10). Pure logic in `list-utils.ts`; the component wires it. Swaps `/home` from the stub to the list.

**Files:**
- Create: `apps/web/src/andamento/list-utils.ts`
- Create: `apps/web/src/andamento/AndamentoList.tsx`
- Modify: `apps/web/src/routes/home.route.tsx`
- Test: `apps/web/test/list-utils.test.ts`
- Test: `apps/web/test/AndamentoList.test.tsx`

**Interfaces:**
- Consumes: `useAndamentoList` (Task 2); `Andamento` (`@gc/shared-types`).
- Produces:
  - `formatCosto(n: number): string` (`Intl` EUR, it-IT); `formatGiorno(iso: string): string` (`dd/MM/yyyy`);
  - `SortKey = 'giorno' | 'descrizione' | 'costo'`; `SortDir = 'asc' | 'desc'`;
  - `filterAndamenti(list: Andamento[], filtro: string): Andamento[]` (full list unless `filtro.length > 2`);
  - `sortAndamenti(list: Andamento[], key: SortKey, dir: SortDir): Andamento[]` (returns a new array);
  - `AndamentoList` component (default read path; Task 5 adds the write path).

- [ ] **Step 1: Write the failing utils test**

Create `apps/web/test/list-utils.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  formatCosto,
  formatGiorno,
  filterAndamenti,
  sortAndamenti,
} from '../src/andamento/list-utils';

const mk = (over: Partial<{ id: number; giorno: string; descrizione: string; costo: number; tipoSpesa: { id: number; descrizione: string } }>) => ({
  id: 1,
  giorno: '2025-01-10',
  descrizione: 'spesa gen',
  costo: 100,
  tipoSpesa: { id: 1, descrizione: 'spesa' },
  ...over,
});

test('formatGiorno renders dd/MM/yyyy without timezone drift', () => {
  expect(formatGiorno('2025-01-09')).toBe('09/01/2025');
});

test('formatCosto renders an it-IT EUR amount', () => {
  // Non-breaking spaces vary by ICU; assert the stable parts.
  const s = formatCosto(1234.5);
  expect(s).toContain('€');
  expect(s).toContain('1.234,50');
});

test('filterAndamenti: <=2 chars returns the full list', () => {
  const list = [mk({}), mk({ id: 2, descrizione: 'altro' })];
  expect(filterAndamenti(list, 'sp')).toHaveLength(2);
});

test('filterAndamenti: >2 chars matches descrizione OR tipoSpesa.descrizione, case-insensitive', () => {
  const list = [
    mk({ id: 1, descrizione: 'Pane', tipoSpesa: { id: 1, descrizione: 'spesa' } }),
    mk({ id: 2, descrizione: 'Diesel', tipoSpesa: { id: 2, descrizione: 'carburante' } }),
  ];
  expect(filterAndamenti(list, 'pan').map((a) => a.id)).toEqual([1]);
  expect(filterAndamenti(list, 'CARB').map((a) => a.id)).toEqual([2]);
});

test('sortAndamenti: costo ascending/descending is numeric', () => {
  const list = [mk({ id: 1, costo: 100 }), mk({ id: 2, costo: 50 })];
  expect(sortAndamenti(list, 'costo', 'asc').map((a) => a.costo)).toEqual([50, 100]);
  expect(sortAndamenti(list, 'costo', 'desc').map((a) => a.costo)).toEqual([100, 50]);
});

test('sortAndamenti: giorno/descrizione is lexicographic and does not mutate input', () => {
  const list = [mk({ id: 1, giorno: '2025-02-01' }), mk({ id: 2, giorno: '2025-01-01' })];
  expect(sortAndamenti(list, 'giorno', 'asc').map((a) => a.id)).toEqual([2, 1]);
  expect(list.map((a) => a.id)).toEqual([1, 2]); // original untouched
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/list-utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `list-utils.ts`**

Create `apps/web/src/andamento/list-utils.ts`:

```ts
import type { Andamento } from '@gc/shared-types';

export type SortKey = 'giorno' | 'descrizione' | 'costo';
export type SortDir = 'asc' | 'desc';

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const formatCosto = (n: number): string => eur.format(n);

// "YYYY-MM-DD" -> "dd/MM/yyyy" by string split (no Date -> no UTC shift).
export const formatGiorno = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Parity: filter only kicks in past 2 chars; matches descrizione OR category name.
export const filterAndamenti = (list: Andamento[], filtro: string): Andamento[] => {
  if (filtro.length <= 2) return list;
  const q = filtro.toLowerCase();
  return list.filter(
    (a) =>
      a.descrizione.toLowerCase().includes(q) ||
      a.tipoSpesa.descrizione.toLowerCase().includes(q),
  );
};

export const sortAndamenti = (list: Andamento[], key: SortKey, dir: SortDir): Andamento[] => {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === 'costo') return (a.costo - b.costo) * sign;
    const x = a[key];
    const y = b[key];
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
};
```

- [ ] **Step 4: Run utils test → pass**

Run: `cd apps/web && bun test --preload ./happydom.ts test/list-utils.test.ts`
Expected: PASS (6 tests). If `formatCosto` fails on the space between amount and `€`, keep the `toContain('1.234,50')` assertion (the test already avoids asserting the separator).

- [ ] **Step 5: Write the failing list render test**

Create `apps/web/test/AndamentoList.test.tsx`. **No `mock.module` here** — seed the `['andamento']` cache so `useAndamentoList` resolves from cache without a fetch. This is the 4a-proven leak-free pattern; the read component never calls the client and never navigates, so nothing needs mocking. (The happy-dom preload's `PUBLIC_API_URL` default keeps the transitive `client.ts` import safe.)

```tsx
import { test, expect } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AndamentoList } from '../src/andamento/AndamentoList';

const rows = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  giorno: `2025-01-${String(i + 1).padStart(2, '0')}`,
  descrizione: i === 0 ? 'Pane speciale' : `voce ${i + 1}`,
  costo: (i + 1) * 10,
  tipoSpesa: { id: 1, descrizione: 'spesa' },
}));

const renderList = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['andamento'], rows);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<AndamentoList />, { wrapper });
};

test('renders one page (10 rows) and shows pagination when >10 items', () => {
  renderList();
  expect(screen.getByText('Pane speciale')).toBeDefined();
  expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(11); // 1 header + 10 body
  expect(screen.getByLabelText(/paginazione/i)).toBeDefined();
});

test('filter (>2 chars) narrows the table', async () => {
  renderList();
  expect(screen.getByText('Pane speciale')).toBeDefined();
  fireEvent.change(screen.getByPlaceholderText('Filtro'), { target: { value: 'pane' } });
  await waitFor(() => expect(screen.queryByText('voce 2')).toBeNull());
  expect(screen.getByText('Pane speciale')).toBeDefined();
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoList.test.tsx`
Expected: FAIL — `Cannot find module '../src/andamento/AndamentoList'`.

- [ ] **Step 7: Implement `AndamentoList.tsx` (read path)**

Create `apps/web/src/andamento/AndamentoList.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Pagination } from 'react-bootstrap';
import { FaChevronDown, FaChevronUp, FaCircleChevronDown, FaCircleChevronUp, FaXmark } from 'react-icons/fa6';
import { useAndamentoList } from './queries';
import {
  filterAndamenti,
  formatCosto,
  formatGiorno,
  pageWindow,
  sortAndamenti,
  type SortDir,
  type SortKey,
} from './list-utils';

const PAGE_SIZE = 10;

export const AndamentoList = () => {
  const { data } = useAndamentoList();
  const lista = data ?? [];

  const [filtro, setFiltro] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterAndamenti(lista, filtro), [lista, filtro]);
  const sorted = useMemo(
    () => (sortKey ? sortAndamenti(filtered, sortKey, sortDir) : filtered),
    [filtered, sortKey, sortDir],
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const sortBy = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  };
  const active = (key: SortKey, dir: SortDir) => sortKey === key && sortDir === dir;

  const sortIcons = (key: SortKey) => (
    <span className="ms-1">
      <span role="button" aria-label={`Ordina per ${key} crescente`} onClick={() => sortBy(key, 'asc')}>
        {active(key, 'asc') ? <FaCircleChevronUp /> : <FaChevronUp />}
      </span>{' '}
      <span role="button" aria-label={`Ordina per ${key} decrescente`} onClick={() => sortBy(key, 'desc')}>
        {active(key, 'desc') ? <FaCircleChevronDown /> : <FaChevronDown />}
      </span>
    </span>
  );

  return (
    <div className="mt-3">
      <div className="d-flex flex-wrap gap-2 pb-3 justify-content-center">
        <div className="input-group" style={{ maxWidth: 320 }}>
          <input
            type="text"
            className="form-control"
            placeholder="Filtro"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Pulisci filtro"
            onClick={() => {
              setFiltro('');
              setPage(1);
            }}
          >
            <FaXmark />
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover" aria-label="andamento">
          <thead>
            <tr>
              <th>Giorno {sortIcons('giorno')}</th>
              <th>Descrizione {sortIcons('descrizione')}</th>
              <th className="text-end">Costo {sortIcons('costo')}</th>
              <th>Tipo spesa</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => (
              <tr key={a.id}>
                <td>{formatGiorno(a.giorno)}</td>
                <td>{a.descrizione}</td>
                <td className="text-end">{formatCosto(a.costo)}</td>
                <td>{a.tipoSpesa.descrizione}</td>
                <td className="text-nowrap">{/* actions added in Task 5 */}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <Pagination className="justify-content-center" aria-label="Paginazione">
          <Pagination.First disabled={current === 1} onClick={() => setPage(1)} />
          <Pagination.Prev disabled={current === 1} onClick={() => setPage(current - 1)} />
          {pageWindow(current, pageCount).map((p) => (
            <Pagination.Item key={p} active={p === current} onClick={() => setPage(p)}>
              {p}
            </Pagination.Item>
          ))}
          <Pagination.Next disabled={current === pageCount} onClick={() => setPage(current + 1)} />
          <Pagination.Last disabled={current === pageCount} onClick={() => setPage(pageCount)} />
        </Pagination>
      )}
    </div>
  );
};
```

> `react-icons/fa6` provides the FontAwesome 6 glyphs (`FaCircleChevronUp/Down` exist only in fa6, matching the legacy `circle-chevron-*`). Import per-glyph (tree-shakeable).

- [ ] **Step 8: Swap `/home` to render the list**

Modify `apps/web/src/routes/home.route.tsx`:

```tsx
import { AndamentoList } from '../andamento/AndamentoList';

// The Andamento list is the home screen (legacy: path 'home' -> ListaComponent).
export const HomePage = () => <AndamentoList />;
```

- [ ] **Step 9: Run list test + typecheck + build → pass**

Run: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoList.test.tsx`
Expected: PASS (2 tests).
Run (root): `bun run typecheck` → exit 0. `cd apps/web && bun build ./index.html --outdir /tmp/gc-web-build --minify` → succeeds (confirms `react-icons`/`react-bootstrap` bundle under the Bun bundler).
Run: `bun run lint` (fix with prettier if needed).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/andamento/list-utils.ts apps/web/src/andamento/AndamentoList.tsx \
        apps/web/src/routes/home.route.tsx apps/web/test/list-utils.test.ts \
        apps/web/test/AndamentoList.test.tsx
git commit -m "feat(web): andamento list (table, filter, column sort, pagination) at /home

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: List write-path — quick-add toolbar, row actions, form modal, delete confirm

Add the CRUD surface to `AndamentoList`: the four quick-add buttons, per-row edit/clone/delete, the `Modal`-wrapped `AndamentoForm`, and the delete-confirm `Modal`, with parity success toasts.

**Files:**
- Modify: `apps/web/src/andamento/AndamentoList.tsx`
- Test: `apps/web/test/AndamentoList.actions.test.tsx`

**Interfaces:**
- Consumes: `useSaveAndamento`, `useDeleteAndamento`, `useTipoSpesaList` (Task 2); `AndamentoForm` (Task 3); `emptyForm`, `prefillForm`, `formFromAndamento`, `cloneForm`, `PREFILLS`, `FormValues` (Task 3); `Andamento`, `AndamentoInput` (`@gc/shared-types`).
- Produces: the complete Andamento screen (no new exports).

- [ ] **Step 1: Write the failing actions test**

Create `apps/web/test/AndamentoList.actions.test.tsx`:

```tsx
import { test, expect, mock, afterAll } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rows = [
  { id: 1, giorno: '2025-01-10', descrizione: 'spesa gen', costo: 100, tipoSpesa: { id: 1, descrizione: 'spesa' } },
];
const post = mock(async () => ({ data: rows[0], error: null }));
const del = mock(async () => ({ data: { deleted: 1 }, error: null }));
const byId = mock((_a: { id: number }) => ({ put: async () => ({ data: rows[0], error: null }), delete: del }));
const andamento = Object.assign(byId, { get: async () => ({ data: rows, error: null }), post });

mock.module('../src/api/client', () => ({
  apiClient: {
    andamento,
    'tipo-spesa': { get: async () => ({ data: [{ id: 1, descrizione: 'spesa' }, { id: 2, descrizione: 'carburante' }, { id: 7, descrizione: 'casa' }], error: null }) },
  },
}));
mock.module('sonner', () => ({ toast: { success: () => {}, warning: () => {}, error: () => {} } }));
afterAll(() => mock.restore());

const renderList = async () => {
  const { AndamentoList } = await import('../src/andamento/AndamentoList');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<AndamentoList />, { wrapper });
  await waitFor(() => expect(screen.getByText('spesa gen')).toBeDefined());
};

test('"Nuova" opens the modal titled "Nuova voce di spesa"', async () => {
  await renderList();
  fireEvent.click(screen.getByRole('button', { name: /nuova voce di spesa/i }));
  await waitFor(() => expect(screen.getByText('Nuova voce di spesa')).toBeDefined());
});

test('quick-add "Spesa" prefills descrizione "Spesa"', async () => {
  await renderList();
  fireEvent.click(screen.getByRole('button', { name: 'Spesa' }));
  await waitFor(() =>
    expect((screen.getByLabelText(/descrizione/i) as HTMLInputElement).value).toBe('Spesa'),
  );
});

test('row delete → confirm → calls DELETE by id', async () => {
  del.mockClear();
  byId.mockClear();
  await renderList();
  fireEvent.click(screen.getByRole('button', { name: /elimina/i }));
  await waitFor(() => expect(screen.getByText('Elimina voce di spesa')).toBeDefined());
  // confirm button inside the dialog
  fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
  await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
  expect(byId).toHaveBeenCalledWith({ id: 1 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoList.actions.test.tsx`
Expected: FAIL — no "Nuova voce di spesa" button/modal yet.

- [ ] **Step 3: Add the write path to `AndamentoList.tsx`**

Replace `apps/web/src/andamento/AndamentoList.tsx` with the full version (read path + write path):

```tsx
import { useMemo, useState } from 'react';
import { Modal, Pagination } from 'react-bootstrap';
import { toast } from 'sonner';
import {
  FaCar,
  FaChevronDown,
  FaChevronUp,
  FaCircleChevronDown,
  FaCircleChevronUp,
  FaClone,
  FaPencil,
  FaPlus,
  FaShower,
  FaCartShopping,
  FaXmark,
  FaTrash,
} from 'react-icons/fa6';
import type { Andamento, AndamentoInput } from '@gc/shared-types';
import { useAndamentoList, useDeleteAndamento, useSaveAndamento, useTipoSpesaList } from './queries';
import { AndamentoForm } from './AndamentoForm';
import {
  cloneForm,
  emptyForm,
  formFromAndamento,
  PREFILLS,
  prefillForm,
  type FormValues,
} from './prefills';
import {
  filterAndamenti,
  formatCosto,
  formatGiorno,
  pageWindow,
  sortAndamenti,
  type SortDir,
  type SortKey,
} from './list-utils';

const PAGE_SIZE = 10;

type Editing = { titolo: string; initial: FormValues } | null;

export const AndamentoList = () => {
  const { data } = useAndamentoList();
  const { data: tipiSpesa } = useTipoSpesaList();
  const save = useSaveAndamento();
  const remove = useDeleteAndamento();
  const lista = data ?? [];

  const [filtro, setFiltro] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<Andamento | null>(null);

  const filtered = useMemo(() => filterAndamenti(lista, filtro), [lista, filtro]);
  const sorted = useMemo(
    () => (sortKey ? sortAndamenti(filtered, sortKey, sortDir) : filtered),
    [filtered, sortKey, sortDir],
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const sortBy = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  };
  const active = (key: SortKey, dir: SortDir) => sortKey === key && sortDir === dir;
  const sortIcons = (key: SortKey) => (
    <span className="ms-1">
      <span role="button" aria-label={`Ordina per ${key} crescente`} onClick={() => sortBy(key, 'asc')}>
        {active(key, 'asc') ? <FaCircleChevronUp /> : <FaChevronUp />}
      </span>{' '}
      <span role="button" aria-label={`Ordina per ${key} decrescente`} onClick={() => sortBy(key, 'desc')}>
        {active(key, 'desc') ? <FaCircleChevronDown /> : <FaChevronDown />}
      </span>
    </span>
  );

  const onSubmit = (input: AndamentoInput) =>
    save.mutate(input, {
      onSuccess: () => {
        toast.success(
          input.id != null ? 'Modifica voce di spesa' : 'Nuova voce di spesa',
          {
            description:
              input.id != null
                ? 'Voce di spesa modificata correttamente'
                : 'Nuova voce di spesa inserita correttamente',
          },
        );
        setEditing(null);
      },
    });

  const confirmDelete = () => {
    if (!toDelete?.id) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.warning('Voce di spesa eliminata', {
          description: 'La voce di spesa è stata eliminata correttamente',
        });
        setToDelete(null);
      },
    });
  };

  return (
    <div className="mt-3">
      <div className="d-flex flex-wrap gap-2 pb-3 justify-content-center">
        <div className="input-group" style={{ maxWidth: 320 }}>
          <input
            type="text"
            className="form-control"
            placeholder="Filtro"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPage(1);
            }}
          />
          <button type="button" className="btn btn-outline-secondary" aria-label="Pulisci filtro" onClick={() => { setFiltro(''); setPage(1); }}>
            <FaXmark />
          </button>
        </div>
        <button type="button" className="btn btn-primary" aria-label="Nuova voce di spesa" title="Nuova voce di spesa" onClick={() => setEditing({ titolo: 'Nuova voce di spesa', initial: emptyForm() })}>
          <FaPlus />
        </button>
        <button type="button" className="btn btn-primary" aria-label="Spesa" title="Spesa" onClick={() => setEditing({ titolo: PREFILLS.spesa.titolo, initial: prefillForm(PREFILLS.spesa) })}>
          <FaCartShopping />
        </button>
        <button type="button" className="btn btn-primary" aria-label="Carburante" title="Carburante" onClick={() => setEditing({ titolo: PREFILLS.carburante.titolo, initial: prefillForm(PREFILLS.carburante) })}>
          <FaCar />
        </button>
        <button type="button" className="btn btn-primary" aria-label="Pulizie" title="Pulizie" onClick={() => setEditing({ titolo: PREFILLS.pulizie.titolo, initial: prefillForm(PREFILLS.pulizie) })}>
          <FaShower />
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-hover" aria-label="andamento">
          <thead>
            <tr>
              <th>Giorno {sortIcons('giorno')}</th>
              <th>Descrizione {sortIcons('descrizione')}</th>
              <th className="text-end">Costo {sortIcons('costo')}</th>
              <th>Tipo spesa</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => (
              <tr key={a.id}>
                <td>{formatGiorno(a.giorno)}</td>
                <td>{a.descrizione}</td>
                <td className="text-end">{formatCosto(a.costo)}</td>
                <td>{a.tipoSpesa.descrizione}</td>
                <td className="text-nowrap">
                  <button type="button" className="btn btn-warning btn-sm me-2" aria-label="Modifica" title="Modifica" onClick={() => setEditing({ titolo: 'Modifica voce di spesa', initial: formFromAndamento(a) })}>
                    <FaPencil />
                  </button>
                  <button type="button" className="btn btn-success btn-sm me-2" aria-label="Clona" title="Clona" onClick={() => setEditing({ titolo: 'Clona voce di spesa', initial: cloneForm(a) })}>
                    <FaClone />
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" aria-label="Elimina" title="Elimina" onClick={() => setToDelete(a)}>
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <Pagination className="justify-content-center" aria-label="Paginazione">
          <Pagination.First disabled={current === 1} onClick={() => setPage(1)} />
          <Pagination.Prev disabled={current === 1} onClick={() => setPage(current - 1)} />
          {pageWindow(current, pageCount).map((p) => (
            <Pagination.Item key={p} active={p === current} onClick={() => setPage(p)}>
              {p}
            </Pagination.Item>
          ))}
          <Pagination.Next disabled={current === pageCount} onClick={() => setPage(current + 1)} />
          <Pagination.Last disabled={current === pageCount} onClick={() => setPage(pageCount)} />
        </Pagination>
      )}

      <Modal show={editing !== null} onHide={() => setEditing(null)} size="lg" backdrop="static">
        <Modal.Header>
          <Modal.Title>{editing?.titolo}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editing && (
            <AndamentoForm
              titolo={editing.titolo}
              initial={editing.initial}
              tipiSpesa={tipiSpesa ?? []}
              submitting={save.isPending}
              onSubmit={onSubmit}
              onCancel={() => setEditing(null)}
            />
          )}
        </Modal.Body>
      </Modal>

      <Modal show={toDelete !== null} onHide={() => setToDelete(null)}>
        <Modal.Header>
          <Modal.Title>Elimina voce di spesa</Modal.Title>
        </Modal.Header>
        <Modal.Body>Confermi l'eliminazione della voce di spesa?</Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={remove.isPending}>
            Elimina
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setToDelete(null)}>
            Annulla
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
```

> If `react-icons/fa6` does not export `FaPencil`/`FaCartShopping` under the installed version, use the equivalents (`FaPencilAlt`/`FaShoppingCart`) — verify the exact export names against the installed `react-icons` before finalizing.

- [ ] **Step 4: Run the actions test → pass**

Run: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoList.actions.test.tsx`
Expected: PASS (3 tests). Re-run the read-path test too: `cd apps/web && bun test --preload ./happydom.ts test/AndamentoList.test.tsx` → still PASS.

- [ ] **Step 5: Full suite + typecheck + build + lint → green**

Run (root): `bun run test` → api/shared + web all green (incl. the 6 new web test files + `csrf.test.ts`).
Run: `bun run typecheck` → exit 0. `cd apps/web && bun build ./index.html --outdir /tmp/gc-web-build --minify` → succeeds.
Run: `bun run lint` (fix with `bunx prettier --write .`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/andamento/AndamentoList.tsx apps/web/test/AndamentoList.actions.test.tsx
git commit -m "feat(web): andamento CRUD — quick-add, edit/clone/delete, form + confirm modals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final phase gate (after Task 5, before PR)

- [ ] **Manual verification (skill `run`/`verify`) — cross-origin CRUD in the browser.** Start api with `CORS_ORIGIN=http://localhost:3000` (dev script) + Postgres, then web on :3000. Log in, then confirm end-to-end: list renders; filter/sort/paginate work; **create, edit, clone, delete** all succeed (the CSRF preflight must pass — this is the only check the in-memory tests can't cover). Watch the network tab for a `403` (would mean CORS didn't allow `X-Requested-With`) or a failed preflight.
- [ ] **Whole-branch review** on the strongest model (per the SDD workflow) over `master..feat/phase4b-andamento`.
- [ ] **Push + open PR** to `master` with `gh pr create` (CI runs install/lint/typecheck/test on the PR).

## Self-Review (author check against the spec)

- **Spec coverage:** §2 contract → Task 2 hooks. §3 file structure → Tasks 2–5 create exactly those files. §4 list (toolbar, table, sort, filter, pagination, row actions) → Tasks 4 (read) + 5 (write). §5 form (native inputs, validation, submit shape, delete confirm) → Task 3 + Task 5 modal. §6 CSRF (ForbiddenError, guard, CORS, client header, test ripple) → Task 1. §7 testing (queries, list, form, CSRF, manual) → tests across all tasks + final gate. §1 routing (`/home` swap) → Task 4 Step 8. No spec section is left without a task.
- **Placeholder scan:** every code step contains complete code; the two `>` notes (form `titolo` fallback, `react-icons` export names) are contingency instructions with concrete alternatives, not deferrals.
- **Type consistency:** `FormValues`, `AndamentoInput`, `SortKey`/`SortDir` names are identical across Tasks 3/4/5; `useSaveAndamento` takes `AndamentoInput` (Task 2) and `AndamentoForm.onSubmit` emits `AndamentoInput` (Task 3) — matched. `CSRF_HEADER`/`CSRF_VALUE` names match between shared-types, api guard, api tests, and the web client (Task 1).
