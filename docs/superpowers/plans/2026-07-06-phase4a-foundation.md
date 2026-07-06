# Fase 4a — Frontend Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la fondazione del frontend React in `apps/web` e provarla end-to-end: **login → shell autenticata → logout**, con client Eden tipizzato che parla all'API via cookie.

**Architecture:** Bundler nativo Bun (entrypoint `index.html`), React 19, TanStack Router (code-based) + TanStack Query, client Eden (`treaty<App>`, `credentials:'include'`). Auth = query `['me']` (niente token/localStorage/Bearer — cookie httpOnly di Fase 2). Error handling globale via callback QueryCache/MutationCache (toast sonner + 401→refresh→redirect). Look Bootstrap 5 "Minty" invariato, tema via `data-bs-theme` su `<html>`.

**Tech Stack:** Bun 1.3.14, React 19, `@tanstack/react-router` v1, `@tanstack/react-query` v5, `@elysiajs/eden` 1.4.x, `react-bootstrap` v2 + `bootstrap`/`bootswatch` 5.3.3 (Minty), `react-hook-form` v7 + `@hookform/resolvers` (TypeBox), `sonner`, `@fortawesome/react-fontawesome`, `@happy-dom/global-registrator` + `@testing-library/react` per i test.

**Design:** `docs/superpowers/specs/2026-07-06-phase4a-foundation-design.md`

## Prerequisiti (una volta, prima di Task 1)

```bash
cd gestione-casa
git switch master && git pull --ff-only        # prende il merge di Fase 3 (PR #3, 0ac8045)
git switch -c feat/phase4a-foundation
```

## Global Constraints

- **apps/web** è l'unico package toccato (eccezione: il dev script di `apps/api` per CORS — Task 6). Nessuna modifica a route/service/schemi dell'API.
- **Auth = cookie**, NON Bearer: nessun token in `localStorage`, nessun header `Authorization`, nessun `jwt-decode`. Il client Eden usa `fetch: { credentials: 'include' }`. Lo stato di login deriva dalla query `['me']` (`GET /utente/me`), non da un token client-side.
- **Parità comportamento/look** col vecchio frontend Angular: stringhe in **italiano** identiche; tema **Minty** (bootswatch 5.3.3); tema in `localStorage` chiave `theme` (valori `light`/`dark`), applicato come `data-bs-theme` su `document.documentElement`, **default `light`**; icona toggle: tema light → `moon`, tema dark → `sun`. Login: campo email `type="text"` + password, entrambi **solo `required`** (nessun validatore formato email); bottone "Login" disabilitato se form invalido; messaggi `.invalid-feedback` "Il campo email è obbligatorio" / "Il campo password è obbligatorio". Toast login success: titolo "Login", messaggio "Login effettuato correttamente".
- **Mappa errori→toast** (da `SharedService.notifyError`, italiano): 401 "Utente non loggato"/"L'utente non è loggato o la sessione è scaduta"; 403 "Utente non autorizzato"/"L'utente non è autorizzato ad eseguire l'operazione richiesta"; 400 "Errore nella richiesta"/"I dati inseriti sono errati"; 422 "Errori nella validazione"/(testo server); 500 "Errore server"/"Si è verificato un errore imprevisto"; default "Problema generico"/"Si è verificato un errore imprevisto".
- **Connettività dev:** web su `localhost:3000`, api su `localhost:5000`, direct cross-origin; api va eseguita con `CORS_ORIGIN=http://localhost:3000` (fix del default `'*'` incompatibile con `credentials`). Cookie `SameSite=Lax` fluisce (stesso site localhost).
- **TS:** strict, `verbatimModuleSyntax` (usa `import type` per i tipi; con `jsx: react-jsx` non serve `import React`), `noUncheckedIndexedAccess` (guarda gli accessi indicizzati). `bun run --filter '*' typecheck` verde.
- **Stile:** arrow function ovunque, niente `class`, named export, import relativi tra file dello stesso package (`@gc/shared-types`/`@gc/api` sono workspace package). Prettier `--check` verde.
- **Test:** `bun test` + `@testing-library/react` su happy-dom. I test web girano in un **processo separato** con happy-dom preloadato (happy-dom registra globali DOM/fetch che romperebbero i test API basati su `Request` nativo se condivisi nello stesso processo). Playwright E2E → **Fase 5**.
- **API-esterne version-sensitive:** dove il codice qui sotto tocca API di TanStack Router/Query, del bundler Bun o di Eden, è la **forma intesa**; se non compila/gira contro la versione installata, adattala all'API reale (usa Context7/docs) e annotalo nel report — non restare bloccato.
- **Commit per-task** autorizzati in blocco all'avvio (confermare una volta, poi filo dritto).

---

## File Structure

- `apps/web/package.json` — deps + scripts (dev/build/typecheck/test).
- `apps/web/index.html` — entrypoint bundler: `#root` + `<script src="./src/main.tsx">`.
- `apps/web/tsconfig.json` — estende base, `jsx: react-jsx`, `lib` DOM (SOSTITUISCE il placeholder no-op).
- `apps/web/happydom.ts` — registra happy-dom (preload dei test web).
- `apps/web/src/main.tsx` — bootstrap: import CSS, crea router + queryClient, monta `<RouterProvider>`.
- `apps/web/src/config.ts` — `API_URL`.
- `apps/web/src/theme/useTheme.ts` — hook tema.
- `apps/web/src/api/client.ts` — `apiClient` Eden.
- `apps/web/src/query/api-error.ts` — `apiErrorMessage(status, body?)` (mappa pura).
- `apps/web/src/query/query-client.ts` — `createQueryClient(navigate)`.
- `apps/web/src/auth/useAuth.ts` — `useMe`/`useLogin`/`useLogout`.
- `apps/web/src/auth/require-auth.ts` — guard loader.
- `apps/web/src/login/LoginForm.tsx` — form login.
- `apps/web/src/layout/Layout.tsx` — shell + header.
- `apps/web/src/layout/Spinner.tsx` — spinner globale.
- `apps/web/src/routes/router.tsx` — router code-based.
- `apps/web/src/routes/home.route.tsx` — stub `/home`.
- `apps/web/src/styles.css` — regole custom (overlay spinner, padding navbar).
- `apps/api/package.json` — dev script con `CORS_ORIGIN` (Task 6).

---

## Task 1: Scaffold — bundler Bun + React 19

**Files:** Create `apps/web/index.html`, `apps/web/tsconfig.json`, `apps/web/src/main.tsx`, `apps/web/src/config.ts`; Modify `apps/web/package.json`.

**Interfaces:**
- Produces: app buildabile/servibile; `API_URL` da `./config`.

- [ ] **Step 1: Deps + scripts in `apps/web/package.json`**

```bash
cd apps/web
bun add react@^19 react-dom@^19
bun add -d @types/react@^19 @types/react-dom@^19
cd ../..
```

Poi imposta gli script in `apps/web/package.json` (sostituendo il `typecheck` placeholder):

```json
{
  "name": "@gc/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun ./index.html --port 3000",
    "build": "bun build ./index.html --outdir dist --minify",
    "typecheck": "tsc --noEmit",
    "test": "bun test --preload ./happydom.ts"
  }
}
```

- [ ] **Step 2: `apps/web/tsconfig.json`** (sostituisce il placeholder)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["react", "react-dom", "bun"],
    "noEmit": true
  },
  "include": ["src", "happydom.ts"]
}
```

- [ ] **Step 3: `apps/web/index.html`**

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#7FC1AD" />
    <title>Gestione Casa</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: `apps/web/src/config.ts`**

```ts
// API base URL. Dev default localhost:5000; prod via build-time env (Fase 6).
export const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:5000';
```

- [ ] **Step 5: `apps/web/src/main.tsx`** (minimo per verificare lo scaffold; ampliato in Task 6)

```tsx
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(<h1>Gestione Casa</h1>);
```

- [ ] **Step 6: Verifica scaffold**

Run: `bun run --filter '@gc/web' typecheck`  → Expected: exit 0.
Run: `cd apps/web && bun build ./index.html --outdir dist --minify && ls dist && cd ../..` → Expected: `dist/index.html` + un bundle JS.
Run (manuale, opzionale): `cd apps/web && bun ./index.html --port 3000` → apri http://localhost:3000, vedi "Gestione Casa". Ctrl-C.
*(Se `bun ./index.html` non avvia il dev server come atteso sulla versione installata, verifica la sintassi del frontend dev server di Bun e adatta lo script `dev`; annota nel report.)*

- [ ] **Step 7: Commit**

```bash
echo "dist/" >> apps/web/.gitignore
git add apps/web/package.json apps/web/tsconfig.json apps/web/index.html apps/web/src/main.tsx apps/web/src/config.ts apps/web/.gitignore bun.lock
git commit -m "feat(web): scaffold React 19 on Bun bundler (index.html entrypoint)"
```

---

## Task 2: CSS Minty + tema + harness di test

**Files:** Create `apps/web/happydom.ts`, `apps/web/src/theme/useTheme.ts`, `apps/web/src/styles.css`, `apps/web/test/useTheme.test.tsx`; Modify `apps/web/src/main.tsx`, `apps/web/package.json` (deps).

**Interfaces:**
- Produces: `useTheme(): { theme, isDark, toggle }` da `./theme/useTheme`; harness happy-dom.

- [ ] **Step 1: Deps**

```bash
cd apps/web
bun add bootstrap@^5.3.3 bootswatch@^5.3.3
bun add -d @happy-dom/global-registrator @testing-library/react @testing-library/dom
cd ../..
```

- [ ] **Step 2: `apps/web/happydom.ts`** (preload test web)

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
```

- [ ] **Step 3: Scrivi il test di `useTheme` (RED)** — `apps/web/test/useTheme.test.tsx`

```tsx
import { test, expect, beforeEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../src/theme/useTheme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-bs-theme');
});

test('defaults to light and applies data-bs-theme on <html>', () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('light');
  expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  expect(result.current.isDark).toBe(false);
});

test('toggle flips theme, persists to localStorage, updates the attribute', () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.toggle());
  expect(result.current.theme).toBe('dark');
  expect(result.current.isDark).toBe(true);
  expect(localStorage.getItem('theme')).toBe('dark');
  expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
});

test('reads persisted theme on init', () => {
  localStorage.setItem('theme', 'dark');
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('dark');
});
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/useTheme.test.tsx` → Expected: FAIL (module `../src/theme/useTheme` missing).

- [ ] **Step 4: `apps/web/src/theme/useTheme.ts`**

```ts
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const read = (): Theme => (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');

// Theme state + persistence: mirrors the Angular app — localStorage key "theme",
// applied as data-bs-theme on <html>, default light, toggled from the header.
export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return {
    theme,
    isDark: theme === 'dark',
    toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
  };
};
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/useTheme.test.tsx` → Expected: PASS (3 tests).

- [ ] **Step 5: `apps/web/src/styles.css`** (regole custom portate dal vecchio `styles.scss`, senza SCSS)

```css
/* Clear the fixed navbar (was body{padding-top:4rem}). */
body {
  padding-top: 4rem;
}

/* Global loading overlay (was _loading.scss): full-viewport, above modals. */
.loading-div {
  position: fixed;
  inset: 0;
  z-index: 1081;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 6: Importa i CSS in `main.tsx`** (aggiungi in cima)

```tsx
import 'bootswatch/dist/minty/bootstrap.min.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
// ...resto invariato
```

- [ ] **Step 7: Verifica + commit**

Run: `bun run --filter '@gc/web' typecheck` → exit 0.
Run: `cd apps/web && bun test --preload ./happydom.ts && cd ../..` → 3 pass.

```bash
bunx prettier --write apps/web/src apps/web/test apps/web/happydom.ts
git add apps/web/src apps/web/test apps/web/happydom.ts apps/web/package.json bun.lock
git commit -m "feat(web): Minty CSS + useTheme hook + happy-dom test harness"
```

---

## Task 3: Client Eden + Query client + error handling globale

**Files:** Create `apps/web/src/api/client.ts`, `apps/web/src/query/api-error.ts`, `apps/web/src/query/query-client.ts`, `apps/web/test/api-error.test.ts`, `apps/web/test/query-client.test.ts`; Modify `apps/web/package.json` (deps).

**Interfaces:**
- Consumes: `type App` da `@gc/api`, `API_URL` da `../config`.
- Produces: `apiClient` (treaty) da `../api/client`; `apiErrorMessage(status, body?): { title: string; message: string }` da `../query/api-error`; `createQueryClient(navigate: (path: string) => void): QueryClient` da `../query/query-client`.

- [ ] **Step 1: Deps**

```bash
cd apps/web
bun add @tanstack/react-query@^5 sonner @elysiajs/eden@^1.4.0
bun add @gc/shared-types@workspace:* @gc/api@workspace:*
cd ../..
```

- [ ] **Step 2: `apps/web/src/api/client.ts`**

```ts
import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';
import { API_URL } from '../config';

// Cookie-based auth: credentials:'include' sends the httpOnly access/refresh cookies.
export const apiClient = treaty<App>(API_URL, {
  fetch: { credentials: 'include' },
});
```
*(Verifica la firma di `treaty` client-side contro `@elysiajs/eden@1.4.x`; se le opzioni fetch hanno forma diversa, adatta e annota.)*

- [ ] **Step 3: Test mappa errori (RED)** — `apps/web/test/api-error.test.ts`

```ts
import { test, expect } from 'bun:test';
import { apiErrorMessage } from '../src/query/api-error';

test('maps known statuses to the Italian title/message pairs', () => {
  expect(apiErrorMessage(401)).toEqual({
    title: 'Utente non loggato',
    message: "L'utente non è loggato o la sessione è scaduta",
  });
  expect(apiErrorMessage(400)).toEqual({
    title: 'Errore nella richiesta',
    message: 'I dati inseriti sono errati',
  });
  expect(apiErrorMessage(500)).toEqual({
    title: 'Errore server',
    message: 'Si è verificato un errore imprevisto',
  });
});

test('falls back to the generic pair for unknown statuses', () => {
  expect(apiErrorMessage(418)).toEqual({
    title: 'Problema generico',
    message: 'Si è verificato un errore imprevisto',
  });
});

test('422 prefers the server-provided body text as message', () => {
  expect(apiErrorMessage(422, 'costo troppo basso').message).toBe('costo troppo basso');
});
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/api-error.test.ts` → FAIL (module missing).

- [ ] **Step 4: `apps/web/src/query/api-error.ts`**

```ts
type Msg = { title: string; message: string };

const MAP: Record<number, Msg> = {
  401: { title: 'Utente non loggato', message: "L'utente non è loggato o la sessione è scaduta" },
  403: {
    title: 'Utente non autorizzato',
    message: "L'utente non è autorizzato ad eseguire l'operazione richiesta",
  },
  400: { title: 'Errore nella richiesta', message: 'I dati inseriti sono errati' },
  422: { title: 'Errori nella validazione', message: 'Si è verificato un errore imprevisto' },
  500: { title: 'Errore server', message: 'Si è verificato un errore imprevisto' },
};

const GENERIC: Msg = { title: 'Problema generico', message: 'Si è verificato un errore imprevisto' };

// Mirrors the Angular SharedService.notifyError mapping. `body` (server error text),
// when present, overrides the default message (matches the original 422 behavior).
export const apiErrorMessage = (status: number, body?: string): Msg => {
  const base = MAP[status] ?? GENERIC;
  return body ? { title: base.title, message: body } : base;
};
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/api-error.test.ts` → PASS.

- [ ] **Step 5: Test del 401-handler (RED)** — `apps/web/test/query-client.test.ts`

```ts
import { test, expect, mock } from 'bun:test';
import { handleUnauthorized } from '../src/query/query-client';

test('handleUnauthorized: refresh ok → invalidate me, no redirect', async () => {
  const refresh = mock(async () => ({ error: null }));
  const invalidate = mock(async () => {});
  const navigate = mock(() => {});
  await handleUnauthorized({ refresh, invalidateMe: invalidate, navigate });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
});

test('handleUnauthorized: refresh fails → redirect /login', async () => {
  const refresh = mock(async () => ({ error: { status: 401 } }));
  const invalidate = mock(async () => {});
  const navigate = mock(() => {});
  await handleUnauthorized({ refresh, invalidateMe: invalidate, navigate });
  expect(navigate).toHaveBeenCalledWith('/login');
  expect(invalidate).not.toHaveBeenCalled();
});
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/query-client.test.ts` → FAIL.

- [ ] **Step 6: `apps/web/src/query/query-client.ts`**

```ts
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { apiErrorMessage } from './api-error';

type EdenError = { status?: number; value?: unknown } | null;
const statusOf = (error: unknown): number | undefined =>
  (error as { status?: number } | null)?.status;

// Extracted for unit testing without a live client/router.
export const handleUnauthorized = async (deps: {
  refresh: () => Promise<{ error: EdenError }>;
  invalidateMe: () => Promise<void>;
  navigate: (path: string) => void;
}) => {
  const { error } = await deps.refresh();
  if (error) deps.navigate('/login');
  else await deps.invalidateMe();
};

const notify = (error: unknown) => {
  const status = statusOf(error) ?? 0;
  const { message } = apiErrorMessage(status);
  toast.error(message);
};

// One QueryClient with global error handling: toast every error; on 401, try one
// refresh then either refetch (['me']) or redirect to /login. Mirrors GlobalInterceptor.
export const createQueryClient = (navigate: (path: string) => void): QueryClient => {
  const onError = (error: unknown) => {
    notify(error);
    if (statusOf(error) === 401) {
      void handleUnauthorized({
        refresh: () => apiClient.utente.refresh.post(),
        invalidateMe: () => qc.invalidateQueries({ queryKey: ['me'] }),
        navigate,
      });
    }
  };
  const qc: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false } },
  });
  return qc;
};
```
*(Verifica i tipi di `QueryCache`/`MutationCache` onError e la forma del ritorno di `apiClient.utente.refresh.post()` contro le versioni installate; adatta `EdenError`/`statusOf` se differiscono.)*

Run: `cd apps/web && bun test --preload ./happydom.ts test/query-client.test.ts` → PASS.

- [ ] **Step 7: Verifica + commit**

Run: `bun run --filter '@gc/web' typecheck` → exit 0.

```bash
bunx prettier --write apps/web/src apps/web/test
git add apps/web/src apps/web/test apps/web/package.json bun.lock
git commit -m "feat(web): Eden client + QueryClient with global error handling (toast + 401→refresh/redirect)"
```

---

## Task 4: Auth — `useAuth` + guard

**Files:** Create `apps/web/src/auth/useAuth.ts`, `apps/web/src/auth/require-auth.ts`, `apps/web/test/useAuth.test.tsx`; Modify `apps/web/package.json` (deps).

**Interfaces:**
- Consumes: `apiClient` (`../api/client`), QueryClient.
- Produces: `useMe()`, `useLogin()`, `useLogout()` da `../auth/useAuth`; `requireAuth(queryClient)` da `../auth/require-auth`.

- [ ] **Step 1: Dep router**

```bash
cd apps/web && bun add @tanstack/react-router && cd ../..
```

- [ ] **Step 2: Test `useAuth` (RED)** — `apps/web/test/useAuth.test.tsx`

```tsx
import { test, expect, mock, beforeEach } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMe } from '../src/auth/useAuth';

// mock the Eden client module
mock.module('../src/api/client', () => ({
  apiClient: {
    utente: { me: { get: async () => ({ data: { id: 1, email: 'a@b.it' }, error: null }) } },
  },
}));

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {});

test('useMe resolves the current user from GET /utente/me', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMe(), { wrapper: wrapper(qc) });
  await waitFor(() => expect(result.current.data).toEqual({ id: 1, email: 'a@b.it' }));
});
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/useAuth.test.tsx` → FAIL.

- [ ] **Step 3: `apps/web/src/auth/useAuth.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// Current user via GET /utente/me. A 401 (no cookie) surfaces as error → not logged in.
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await apiClient.utente.me.get();
      if (error) throw error;
      return data;
    },
  });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const { data, error } = await apiClient.utente.login.post(creds);
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.utente.logout.post();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/useAuth.test.tsx` → PASS.

- [ ] **Step 4: `apps/web/src/auth/require-auth.ts`** (guard per route protette)

```ts
import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// beforeLoad guard: ensures ['me'] is loadable; a failed fetch → redirect to /login.
export const requireAuth = (queryClient: QueryClient) => async () => {
  try {
    await queryClient.ensureQueryData({
      queryKey: ['me'],
      queryFn: async () => {
        const { data, error } = await apiClient.utente.me.get();
        if (error) throw error;
        return data;
      },
    });
  } catch {
    throw redirect({ to: '/login' });
  }
};
```
*(Verifica `redirect`/`ensureQueryData` contro le versioni installate; adatta se le firme differiscono.)*

- [ ] **Step 5: Commit**

Run: `bun run --filter '@gc/web' typecheck` → exit 0.

```bash
bunx prettier --write apps/web/src apps/web/test
git add apps/web/src apps/web/test apps/web/package.json bun.lock
git commit -m "feat(web): useAuth (me/login/logout) + route auth guard"
```

---

## Task 5: Schermo di login

**Files:** Create `apps/web/src/login/LoginForm.tsx`, `apps/web/test/LoginForm.test.tsx`; Modify `apps/web/package.json` (deps).

**Interfaces:**
- Consumes: `useLogin` (`../auth/useAuth`).
- Produces: `<LoginForm />` (default-esporta? NO — named) da `../login/LoginForm`.

- [ ] **Step 1: Deps form**

```bash
cd apps/web && bun add react-hook-form @hookform/resolvers react-bootstrap && cd ../..
```

- [ ] **Step 2: Test `LoginForm` (RED)** — `apps/web/test/LoginForm.test.tsx`

```tsx
import { test, expect, mock } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from '../src/login/LoginForm';

mock.module('@tanstack/react-router', () => ({ useNavigate: () => () => {} }));

const renderForm = () => {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LoginForm />
    </QueryClientProvider>,
  );
};

test('renders email + password fields and a disabled submit while empty', () => {
  renderForm();
  expect(screen.getByLabelText(/email/i)).toBeDefined();
  expect(screen.getByLabelText(/password/i)).toBeDefined();
  const btn = screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
});
```

Run: `cd apps/web && bun test --preload ./happydom.ts test/LoginForm.test.tsx` → FAIL.

- [ ] **Step 3: `apps/web/src/login/LoginForm.tsx`**

```tsx
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useLogin } from '../auth/useAuth';

type Fields = { email: string; password: string };

// Login form: email (type=text) + password, both required only (parity with the
// Angular form — no email-format validator). Errors surface via GlobalInterceptor-style
// toasts (query error handler); success → toast + navigate /home.
export const LoginForm = () => {
  const {
    register,
    handleSubmit,
    formState: { isValid },
  } = useForm<Fields>({ mode: 'onChange' });
  const login = useLogin();
  const navigate = useNavigate();

  const onSubmit = (values: Fields) =>
    login.mutate(values, {
      onSuccess: () => {
        toast.success('Login effettuato correttamente');
        void navigate({ to: '/home' });
      },
    });

  return (
    <form className="w-100" style={{ maxWidth: 360, margin: '2rem auto' }} onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-3">
        <label htmlFor="email" className="form-label">Email</label>
        <input id="email" type="text" autoComplete="username" className="form-control"
          {...register('email', { required: true })} />
      </div>
      <div className="mb-3">
        <label htmlFor="password" className="form-label">Password</label>
        <input id="password" type="password" autoComplete="current-password" className="form-control"
          {...register('password', { required: true })} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!isValid}>Login</button>
    </form>
  );
};
```
*(`@hookform/resolvers` è installato per l'uso in 4b con lo schema TypeBox; qui i validatori sono inline `required` per parità. `react-bootstrap` importato ma i controlli usano classi Bootstrap dirette — coerente col markup originale.)*

Run: `cd apps/web && bun test --preload ./happydom.ts test/LoginForm.test.tsx` → PASS.

- [ ] **Step 4: Commit**

Run: `bun run --filter '@gc/web' typecheck` → exit 0.

```bash
bunx prettier --write apps/web/src apps/web/test
git add apps/web/src apps/web/test apps/web/package.json bun.lock
git commit -m "feat(web): login screen (react-hook-form, required fields, parity)"
```

---

## Task 6: Router + Layout + wiring + verifica manuale

**Files:** Create `apps/web/src/routes/router.tsx`, `apps/web/src/routes/home.route.tsx`, `apps/web/src/layout/Layout.tsx`, `apps/web/src/layout/Spinner.tsx`; Modify `apps/web/src/main.tsx`, `apps/api/package.json`; check `.github/workflows/ci.yml` and root `package.json`.

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: app montata; flusso login→shell→logout funzionante.

- [ ] **Step 1: `apps/web/src/layout/Spinner.tsx`**

```tsx
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

// Global overlay while any query/mutation is in flight (replaces the request-counter spinner).
export const Spinner = () => {
  const busy = useIsFetching() + useIsMutating() > 0;
  if (!busy) return null;
  return (
    <div className="loading-div">
      <div className="spinner-border text-primary" role="status" aria-label="Caricamento" />
    </div>
  );
};
```

- [ ] **Step 2: `apps/web/src/layout/Layout.tsx`** (header + shell)

```tsx
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Toaster, toast } from 'sonner';
import { useTheme } from '../theme/useTheme';
import { useMe, useLogout } from '../auth/useAuth';
import { Spinner } from './Spinner';

// App shell: fixed navbar (brand → /home, theme toggle, logout when logged in) + routed outlet.
export const Layout = () => {
  const { isDark, toggle } = useTheme();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.warning('Logout effettuato correttamente');
        void navigate({ to: '/login' });
      },
    });

  return (
    <>
      <nav className="navbar navbar-expand-sm navbar-dark bg-primary fixed-top px-3">
        <Link className="navbar-brand" to={me.data ? '/home' : '/login'}>Gestione Casa</Link>
        <div className="ms-auto d-flex gap-2">
          <button className="btn btn-outline-light btn-sm" onClick={toggle} aria-label="Cambia tema">
            {isDark ? '☀' : '☾'}
          </button>
          {me.data ? (
            <button className="btn btn-outline-light btn-sm" onClick={onLogout}>Logout</button>
          ) : null}
        </div>
      </nav>
      <div className="container-fluid">
        <Outlet />
      </div>
      <Spinner />
      <Toaster richColors position="top-right" />
    </>
  );
};
```
*(Icone FontAwesome sole/luna → in 4a uso i glifi unicode ☀/☾ per non introdurre subito la dep icone; la sostituzione con `@fortawesome/react-fontawesome` avviene quando l'header cresce in 4c. Header completo — dropdown statistiche, breadcrumb, profilo — arriva in 4c/4d.)*

- [ ] **Step 3: `apps/web/src/routes/home.route.tsx`** (stub protetto)

```tsx
// Placeholder for the andamento list (ported in Fase 4b).
export const HomePage = () => <h2 className="mt-3">Home — andamento (in arrivo, Fase 4b)</h2>;
```

- [ ] **Step 4: `apps/web/src/routes/router.tsx`** (code-based)

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Layout } from '../layout/Layout';
import { LoginForm } from '../login/LoginForm';
import { HomePage } from './home.route';
import { requireAuth } from '../auth/require-auth';

// Code-based route tree (no file-based plugin — Bun-bundler compatible).
export const buildRouter = (queryClient: QueryClient) => {
  const rootRoute = createRootRoute({ component: Layout });

  const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginForm });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    beforeLoad: requireAuth(queryClient),
    component: HomePage,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: () => { throw redirect({ to: '/home' }); },
  });
  const errorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/error',
    component: () => <h2 className="mt-3">Pagina di errore</h2>,
  });

  const routeTree = rootRoute.addChildren([indexRoute, loginRoute, homeRoute, errorRoute]);
  return createRouter({ routeTree, defaultNotFoundComponent: () => <h2 className="mt-3">Pagina di errore</h2> });
};
```
*(Verifica l'API `createRootRoute`/`createRoute`/`createRouter`/`redirect` contro `@tanstack/react-router` installato; è l'area più version-sensitive. Se serve `declare module` per il type-safety del router, aggiungilo in `main.tsx` o qui e annota.)*

- [ ] **Step 5: Riscrivi `apps/web/src/main.tsx`** (wiring completo)

```tsx
import 'bootswatch/dist/minty/bootstrap.min.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createQueryClient } from './query/query-client';
import { buildRouter } from './routes/router';

const router = buildRouter(undefined as never); // set below once queryClient exists
const queryClient = createQueryClient((path) => router.navigate({ to: path }));
const realRouter = buildRouter(queryClient);

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={realRouter} />
  </QueryClientProvider>,
);
```
*(Nota il ciclo router↔queryClient: il queryClient serve al guard del router, e il router serve al `navigate` del queryClient. Risolvilo pulito — es. crea prima il `queryClient` con un `navigate` che legge un ref al router assegnato dopo, oppure passa `queryClient` al router e usa `router.navigate` nel queryClient via un setter. Il codice sopra è la forma da ripulire: elimina il doppio `buildRouter` usando un `let navigateRef` o creando il queryClient con una funzione che rimanda a `realRouter.navigate`. Implementa la versione pulita e verifica che typecheck + build passino.)*

- [ ] **Step 6: Fix CORS dev nell'API** — `apps/api/package.json`, cambia lo script `dev`:

```json
    "dev": "CORS_ORIGIN=http://localhost:3000 bun run --watch src/index.ts",
```

(Lo script `start` di prod resta invariato: l'origin di prod si imposta in Fase 6.)

- [ ] **Step 7: Verifica CI/test runner** — controlla `.github/workflows/ci.yml` e la `test` di root `package.json`.

I test web richiedono il preload happy-dom in un processo separato dai test API (happy-dom sovrascrive globali che romperebbero i test `Request`-based dell'API). Assicura che il runner esegua **entrambi**:
- root `package.json` `test` → `bun test apps/api packages/shared-types && bun run --filter '@gc/web' test`
- se `ci.yml` invoca `bun test` direttamente, cambialo in `bun run test` (così usa lo script sopra) e aggiungi `bun run --filter '@gc/web' build` allo step di build.

Verifica: `bun run test` da root → tutti i test verdi (API 35 + shared-types + web).

- [ ] **Step 8: Verifica end-to-end + typecheck + prettier**

Run: `bun run --filter '*' typecheck` → tutti exit 0.
Run: `cd apps/web && bun build ./index.html --outdir dist --minify && cd ../..` → build ok.
Run: `bunx prettier --check .` → verde.

**Verifica manuale del flusso (deliverable della fase):**
1. Terminale A: `bun run --filter '@gc/api' dev` (parte con `CORS_ORIGIN=http://localhost:3000`; richiede Postgres + `DATABASE_URL`/`JWT_SECRET` reali dell'ambiente dev).
2. Terminale B: `bun run --filter '@gc/web' dev` → http://localhost:3000.
3. Nel browser: naviga a `/login`, registra/login con un utente, verifica che dopo il login vieni portato a `/home` (shell autenticata, bottone Logout visibile), il cookie `access` è settato (DevTools → Application → Cookies, httpOnly), e `GET /utente/me` risponde 200. Fai Logout → torni a `/login` e `/home` reindirizza a `/login`.
4. Se l'HMR del bundler Bun è instabile, annota nel report (fallback: full-reload in dev; nessun blocco).

- [ ] **Step 9: Commit**

```bash
bunx prettier --write apps/web/src apps/api/package.json
git add apps/web/src apps/api/package.json .github/workflows/ci.yml package.json bun.lock
git commit -m "feat(web): router + layout shell + app wiring; api dev CORS for web"
```

---

## Self-Review (eseguita in scrittura)

- **Spec coverage:** scaffold bundler+React → T1; CSS Minty+tema → T2; client Eden+Query+error handling (401→refresh→redirect, toast italiani) → T3; auth `['me']`+guard → T4; login screen (parità form) → T5; router code-based + layout/header + spinner + toaster + wiring + CORS dev + verifica manuale → T6. Testing component/logic (bun test + Testing Library, happy-dom) presente; Playwright E2E fuori scope (Fase 5) ✓. `apps/web` only (+ api dev script) ✓. Cookie auth, no Bearer/localStorage token ✓.
- **Punti version-sensitive segnalati** (verifica contro versione installata): bundler Bun dev server (T1), forma opzioni `treaty` (T3), `QueryCache/MutationCache onError` + ritorno `refresh.post()` (T3), `ensureQueryData`/`redirect` (T4), API `createRoute`/`createRouter` + `declare module` (T4/T6), ciclo router↔queryClient da ripulire (T6 Step 5).
- **Type consistency:** `apiErrorMessage(status, body?)`, `createQueryClient(navigate)`, `handleUnauthorized({refresh,invalidateMe,navigate})`, `useMe/useLogin/useLogout`, `requireAuth(queryClient)`, `buildRouter(queryClient)` coerenti tra i task.
- **Rischio noto:** l'happy-dom deve restare isolato dai test API (processi separati, T6 Step 7) — se i test API iniziano a fallire con errori su `Request`/`fetch`, è happy-dom che ha invaso il loro processo.

## Note di chiusura fase (dopo Task 6)

Whole-branch review sul modello più forte, poi push + PR verso `master`. Aggiornare ledger e memoria. Poi 4b (Andamento).
