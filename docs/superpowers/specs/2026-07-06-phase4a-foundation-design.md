# Fase 4a — Frontend Foundation — Design

- **Data:** 2026-07-06
- **Stato:** approvato (design) — pronto per il piano di implementazione. Decisioni confermate dall'utente: testing = component/logic + verifica manuale (Playwright E2E → Fase 5); connettività dev = direct cross-origin + `CORS_ORIGIN=http://localhost:3000` esplicito; header CSRF custom → 4b (con le prime mutation CRUD).
- **Repo target:** `gestione-casa` (branch di lavoro previsto: `feat/phase4a-foundation` off `master` @ 0ac8045, dopo il merge di PR #3)
- **Spec padre:** `docs/superpowers/specs/2026-07-01-gc-migration-design.md` §7, §11, §12
- **Natura:** migrazione tecnica. Porting che preserva il comportamento e il look (Bootstrap 5 invariato). Nessun redesign.

---

## 0. Contesto: Fase 4 scomposta in 4 sotto-fasi

Fase 4 (frontend React) è troppo grande per un solo piano. Scomposta (deciso con l'utente):

- **4a — Fondazione** (questo doc): scaffold bundler Bun + React 19, TanStack Router (code-based), TanStack Query, client Eden, auth via cookie (`useAuth` + login/logout), tema, layout/header, spinner+toast globali, error handling (401→refresh→redirect). **Deliverable: app che fa login e mostra una shell autenticata**, con le route degli schermi come stub.
- **4b — Andamento**: `lista` + `modifica` (React Hook Form + resolver TypeBox, date/currency/select).
- **4c — Statistiche**: 5 schermi, Recharts, toggle M/Y/A come search param tipizzati, loader.
- **4d — Profilo + PWA + rifiniture**: cambio password, `manifest.webmanifest` + icone, locale/formatting finali.

Ognuna: spec → piano → subagent-driven → PR. Questo doc copre **solo 4a**.

---

## 1. Obiettivo di 4a

Costruire la fondazione su cui i 9 schermi si innesteranno, e provarla end-to-end: **login → shell autenticata → logout**, con il client Eden tipizzato che parla all'API reale via cookie. È il pezzo più rischioso della migrazione frontend (bundler nativo Bun, integrazione Eden+Query, auth cookie cross-origin), quindi va isolato e verificato prima di costruirci sopra.

---

## 2. Architettura & struttura file

Bundler **nativo Bun** (nessun Vite/webpack): `bun ./index.html` (dev), `bun build ./index.html --outdir dist` (prod).

```
apps/web/
├── index.html                 # entry del bundler Bun; monta #root, importa src/main.tsx
├── package.json               # deps + script dev/build/typecheck
├── tsconfig.json              # estende base, jsx: react-jsx (SOSTITUISCE il placeholder)
└── src/
    ├── main.tsx               # ReactDOM.createRoot; provider (QueryClient, RouterProvider); import CSS bootstrap+bootswatch
    ├── config.ts              # API_URL (dev default http://localhost:5000; prod via env build-time)
    ├── api/
    │   └── client.ts          # createApiClient(): treaty<App>(API_URL, { fetch: { credentials: 'include' } })
    ├── auth/
    │   ├── useAuth.ts          # query ['me'] → { utente, isLoggedIn, isLoading }; login/logout mutations
    │   └── require-auth.ts     # helper beforeLoad/guard: se ['me'] fallisce → redirect /login
    ├── query/
    │   └── query-client.ts     # QueryClient + QueryCache/MutationCache onError (toast; 401→refresh→redirect)
    ├── theme/
    │   └── useTheme.ts         # dark/light → data-bs-theme + localStorage (invariato dall'originale)
    ├── layout/
    │   ├── Layout.tsx          # shell: header (titolo, toggle tema, logout) + <Outlet/> + spinner globale + <Toaster/>
    │   └── Spinner.tsx         # indicatore globale via useIsFetching()/useIsMutating()
    ├── routes/
    │   ├── router.tsx          # createRouter (code-based): rootRoute + route tree
    │   ├── login.route.tsx     # /login — form email/password (pubblica)
    │   └── home.route.tsx      # /home — protetta; stub in 4a (porta ListaComponent in 4b). '' → redirect /home; ** → /error
    └── login/
        └── LoginForm.tsx       # React Hook Form + validazione (email/password required)
```

**Sostituzioni dipendenze introdotte in 4a** (dal master spec §7, solo quelle che servono alla fondazione): React 19, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `@elysiajs/eden` (già in workspace), `react-bootstrap` + `bootstrap` + `bootswatch` (CSS, stesso tema dell'originale), `sonner` (toast), `react-hook-form` + resolver TypeBox (per il login; esteso agli altri form in 4b), `@fortawesome/react-fontawesome` + icone usate nell'header. `jwt-decode`, interceptor Bearer, `ngx-*` → **non** portati (auth via cookie; look via React-Bootstrap). `@gc/shared-types` e `type App` da `@gc/api` (import solo-tipo) già disponibili da Fase 3.

---

## 3. Connettività dev (deciso)

- Web dev su `localhost:3000`, API su `localhost:5000` → **origin diversi, stesso site** (`localhost`): il cookie `SameSite=Lax` fluisce con `credentials:'include'`. Topologia a due origin = **rispecchia la produzione** (`api.<d>`+`app.<d>`); niente proxy dev.
- **Fix CORS (obbligatorio):** l'API oggi ha `CORS_ORIGIN` default `'*'`, e `'*'`+`credentials` è rifiutato dai browser. In dev l'API va eseguita con **`CORS_ORIGIN=http://localhost:3000`**. 4a fornisce questo (dev env / script), senza cambiare il default di prod (Fase 6 imposterà l'origin di prod + `COOKIE_SECURE=true`). È l'item di backlog già previsto da Fase 2/3.
- Client Eden: `treaty<App>(API_URL, { fetch: { credentials: 'include' } })`. `AuthInterceptor` (Bearer) **eliminato** (cookie automatico).

---

## 4. Componenti chiave (data flow)

- **Auth = query `['me']`.** `useAuth()` legge `GET /utente/me` via Eden. `login` = mutation `POST /utente/login` → il server setta i cookie httpOnly → `invalidateQueries(['me'])`. `logout` = `POST /utente/logout` → invalida `['me']`. Nessun token in `localStorage` (differenza voluta dall'originale).
- **Guard.** Le route protette usano un `beforeLoad`/loader che assicura `['me']` (via `queryClient.ensureQueryData`); un 401 propaga al MutationCache/QueryCache handler.
- **Error handling globale** (sostituisce `GlobalInterceptor`): `QueryCache`/`MutationCache` `onError` → toast (sonner) del messaggio; su **401** → un tentativo di `POST /utente/refresh`, se ok refetch, altrimenti redirect `/login`. Spinner globale via `useIsFetching()`/`useIsMutating()`.
- **Tema** (`useTheme`): `data-bs-theme` su `<html>` + `localStorage`, identico all'originale (dark/light toggle nell'header).

Catena: `shared-types` (TypeBox) → `type App` → `treaty<App>` → hook TanStack Query → componenti React-Bootstrap.

---

## 5. Testing (confermato: component/logic + verifica manuale)

- **In 4a:** `bun test` + **React Testing Library** (happy-dom) su: render+validazione del `LoginForm`, `useTheme` (toggle + persistenza), logica error/401→refresh (client Eden mockato). Più **verifica manuale** del flusso login sull'app reale (skill `run`/`verify`): avvio api (`CORS_ORIGIN=localhost:3000`) + web, login, shell, logout.
- **Rimandato a Fase 5:** suite **Playwright E2E** completa (roadmap §5). *(Alternativa non scelta: uno smoke Playwright del login già in 4a — più confidenza ma anticipa l'harness a due server.)*
- Gate CI invariati: `bun install --frozen-lockfile`, `prettier --check`, `tsc --noEmit` su tutti i workspace (il web ora ha un tsconfig reale, non più il placeholder no-op), `bun test`, + `bun build` del web.

---

## 6. Rischi & mitigazioni

- **Bundler nativo Bun — HMR/Fast Refresh immaturo** (spec §11). Mitigazione: se l'HMR è instabile, si degrada a **full-reload in dev** (nessun bundler di fallback, vincolo esplicito). Da monitorare durante 4a; non blocca la fondazione.
- **Auth cookie cross-origin in dev.** Mitigata dal fix `CORS_ORIGIN` esplicito + `credentials:'include'` + same-site localhost. La verifica manuale del login in 4a la conferma prima di 4b.
- **`import.meta.env`/inlining env nel bundler Bun** incerto: `config.ts` usa un default hardcoded per dev e un define build-time per prod, evitando API di bundler non garantite.
- **TanStack Router code-based** (niente plugin di build) — più verboso ma compatibile col bundler Bun (vincolo §7).

---

## 7. Fuori scope 4a (→ 4b/4c/4d/5/6)

- Schermi andamento (4b), statistiche + Recharts (4c), profilo + PWA manifest (4d).
- Suite Playwright E2E completa (Fase 5).
- `CORS_ORIGIN` di prod esplicito + `COOKIE_SECURE=true` + `COOKIE_DOMAIN` (Fase 6 deploy).
- CSRF header custom sulle richieste mutanti (spec §6/§147) — **confermato in 4b** insieme alle prime mutation CRUD (server middleware su route mutanti + client che invia l'header). In 4a l'auth si affida a `SameSite=Lax`, che da solo già blocca la CSRF su fetch/XHR cross-site.
