# Fase 6 — Cutover: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portare `apps/api` e `apps/web` in produzione su Railway con una topologia a
**origin singola** — un solo host pubblico serve la SPA e inoltra `/api/*` all'api sulla
rete privata — accanto allo stack legacy che resta acceso.

**Architecture:** il servizio `web` esegue `apps/web/serve.ts`, che già serve `dist/` con
fallback SPA e guardia anti-symlink; guadagna un proxy di ~15 righe attivo solo quando
`API_INTERNAL_URL` è definita. Il servizio `api` esegue Elysia invariato, con l'unica
modifica di fare bind su `::` (la rete privata Railway è IPv6-only). Il build è dichiarato in
due Dockerfile, perché Railpack non rileva i progetti Bun. Nessuna modifica allo schema del
database, alle rotte, al client Eden, alla CORS o alla difesa CSRF.

**Tech Stack:** Bun 1.3.14 · Elysia · React 19 (bundler HTML di Bun) · Railway (Docker
builder, rete privata IPv6, Postgres esistente)

**Spec:** `docs/superpowers/specs/2026-08-11-phase6-cutover-design.md`
**Branch:** `feat/phase6-cutover` (già creato, contiene il commit della spec `ff963d6`)

---

## Global Constraints

- **Runtime Bun, mai npm/node.** Versione pinnata `1.3.14` (`.github/workflows/ci.yml`).
  I Dockerfile devono usare lo stesso pin: `oven/bun:1.3.14-alpine`.
- **Prettier**: `singleQuote`, `trailingComma: all`, `printWidth: 100`. `bun run lint` è
  `prettier --check .` e **è un gate della CI**. `.prettierignore` salta `*.md`, `docs`,
  `bun.lock`; Prettier non formatta i Dockerfile.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Export nominati,
  import relativi, arrow function, **commenti e codice in inglese**.
- **Nessuna configurazione fissata nel codice** — unica eccezione deliberata di questa fase:
  l'hostname di bind `'::'` (motivata nel Task 2, §5 della spec).
- ⚠️ **Sicurezza del database di test.** `apps/api/test/setup.ts` esegue `TRUNCATE` sullo
  schema `gc`. Ogni comando che avvia i test dell'api o il gate di root **deve** passare
  esplicitamente il DB usa-e-getta:
  `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret`.
  Mai il `DATABASE_URL` di `apps/api/.env` (è il DB di sviluppo, copia della produzione).
  I task 1 e 3 sono **solo web**: eseguono unicamente la suite web.
- **Commit per task**, messaggi in italiano nello stile del repository
  (`feat(web): …`, `fix(api): …`, `docs: …`), con i trailer di co-autore già usati nella
  storia del branch.

---

## File Structure

| File | Responsabilità | Task |
|---|---|---|
| `apps/web/serve.ts` | server statico + fallback SPA **+ proxy `/api/*`** | 1 |
| `apps/web/test/serve.test.ts` | test dell'handler, casi statici esistenti + nuovi casi proxy | 1 |
| `apps/api/src/index.ts` | entrypoint api: bind `::` | 2 |
| `apps/web/public/sw.js` | correzione del commento `ponytail:` (nessuna modifica di codice) | 3 |
| `apps/api/.env.example`, `apps/web/.env.example` | documentazione delle variabili di produzione | 3 |
| `apps/web/package.json` | `NODE_ENV=production` nello script `build` | 4 |
| `apps/web/smoke.ts` | asserzione che il bundle contenga React di produzione | 4 |
| `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore` | build di produzione | 5 |
| `README.md` | runbook di deploy (variabili, sequenza, rollback, convivenza) | 6 |

---

## Correzioni alla spec emerse durante la pianificazione

Da applicare al file della spec nel Task 6, così il documento resta la fonte affidabile:

1. **§1 sbaglia sull'healthcheck.** `apps/api/src/app.ts:27` espone già
   `GET /health → {status:'ok'}`, non autenticato (`assertCsrf` riguarda solo i metodi
   mutanti) e usato da `e2e/harness.ts:64`. L'healthcheck Railway dell'api è quindi gratuito:
   `healthcheckPath = /health`. Va rimossa la voce «Healthcheck sull'api» da *Fuori scope*.
2. **§5 chiede una modifica di codice a `sw.js` che non serve.** Nel gestore `fetch`, dopo il
   controllo di origin, il worker risponde **solo** se `isImmutableAsset(pathname)` (regex
   `^\/index-[a-z0-9]+\.(js|css)$`) o se `request.mode === 'navigate'`. Una chiamata Eden a
   `/api/...` non soddisfa né l'una né l'altra condizione: nessun `respondWith`, quindi la
   richiesta va in rete e **non viene mai messa in cache**, anche a origin condivisa. Resta
   da correggere il commento `ponytail:`, che altrimenti indurrebbe qualcuno ad aggiungere
   codice morto.
3. **§8 propone `e2e/proxy.test.ts`: si taglia.** `PUBLIC_API_URL` è inlineata a build time e
   `e2e/harness.ts` costruisce il bundle **una volta sola** con l'URL cross-origin
   (`harness.ts:50-54`); un test del proxy nel browser richiederebbe un secondo build con un
   `PUBLIC_API_URL` diverso, duplicando i flag di `bun build` fuori dallo script `build`. Al
   suo posto: i casi proxy del Task 1 (che coprono il contratto del proxy) più la **verifica
   locale della topologia di produzione** del Task 7, che usa lo script `preview` esistente e
   dà un browser reale contro l'api reale senza una riga di codice nuova.
4. **§3 e §7 vanno estese al servizio web**: anche `serve.ts` fa bind su `::` (Task 2). Il
   proxy pubblico di Railway raggiunge i container attraverso la rete privata, quindi
   ascoltare solo su IPv4 è un rischio per entrambi i servizi, non solo per l'api.
5. **§5 e §11 non conoscono il guasto di `NODE_ENV`** — non un errore della spec ma una
   scoperta successiva, del 2026-08-12, nata da una domanda dell'utente sul perché una
   variabile `NODE_ENV` esista in un progetto interamente su Bun: il bundle di produzione
   contiene React in modalità sviluppo, 300 KB in più su ogni primo caricamento. Aggiungere
   `apps/web/package.json` e `apps/web/smoke.ts` alla tabella delle modifiche e all'elenco dei
   file, e citare la misura 1,2 M → 900 K. Prove e ragionamento nel Task 4.
6. **§4 descrive il proxy in una forma vulnerabile.** La spec (e questo piano, nella sua prima
   stesura) componeva il bersaglio con `new URL(path, apiInternalUrl)`. È una **SSRF**: un path
   che inizia con `//` è un riferimento network-path, quindi `new URL` ne tiene solo lo *schema*
   e prende l'autorità dal path. `GET /api//evil.com/x` veniva inoltrata a `evil.com` **con i
   cookie di sessione della vittima** — `Cookie` viaggia con `new Request(target, req)`, e
   `httpOnly` protegge da JavaScript, non da un proxy che li rispedisce. Il proxy vive dentro la
   rete privata di Railway, quindi la stessa falla raggiunge gli altri servizi interni. Riscrivere
   §4 con il setter di `pathname` più la guardia sull'origin, e citare i quattro vettori
   (`//`, `///`, `\`, `\\`; il backslash arriva già normalizzato in `/` da `new URL(req.url)`).
   Segnalata da una review di sicurezza automatica il 2026-08-12 e confermata sperimentalmente.

---

## Task 1: Proxy `/api/*` in `serve.ts`

Il cuore della fase. Test prima dell'implementazione.

**Files:**
- Modify: `apps/web/serve.ts` (firma di `createHandler`, ~15 righe nuove)
- Test: `apps/web/test/serve.test.ts` (aggiunta di un upstream finto e 8 casi, uno di sicurezza)

**Interfaces:**
- Consumes: niente da altri task.
- Produces: `createHandler(distUrl: URL, apiInternalUrl?: string) => (req: Request) => Promise<Response>`.
  Il secondo parametro è **opzionale**: i due chiamanti esistenti
  (`apps/web/test/serve.test.ts:22` e `e2e/harness.ts:68`) continuano a passare un solo
  argomento e non cambiano comportamento. Il Task 5 si appoggia al blocco `import.meta.main`
  che legge `process.env.API_INTERNAL_URL`.

### ⚠️ Vincolo di ambiente scoperto negli spike, da rispettare alla lettera

La suite web viene eseguita con `--preload ./happydom.ts`, che **sostituisce la `fetch`
globale con quella di happy-dom**. Un proxy che usa `fetch` fallisce lì con
`NetworkError: … Parse Error` (verificato: entrambi i test del proxy fallivano). La
soluzione è chiamare `await GlobalRegistrator.unregister()` in `beforeAll` di
`serve.test.ts`: ripristina la `fetch` di Bun, e poiché lo script di test usa `--isolate`
(registro dei moduli e globali per file) **non contamina gli altri 22 file** — verificato
eseguendo la suite completa: 92 pass su 23 file, 0 fail.

Nessun test di questo file ha bisogno del DOM: asseriscono su status, header e corpo.

- [ ] **Step 1: Aggiungere l'upstream finto e disattivare il DOM in `serve.test.ts`**

Sostituire le righe 1-6 (import) e il blocco `beforeAll`/`afterAll` (righe 13-25) con:

```ts
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
let handler: (req: Request) => Promise<Response>;
let proxied: (req: Request) => Promise<Response>;
let upstream: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // happydom.ts replaces the global fetch with happy-dom's, which cannot proxy a Request
  // (verified: "NetworkError: … Parse Error"). Nothing in this file needs a DOM, and the
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
  const distUrl = pathToFileURL(join(root, 'dist') + '/');
  handler = createHandler(distUrl);
  proxied = createHandler(distUrl, `http://localhost:${upstream.port}`);
});

afterAll(() => {
  upstream.stop(true);
  rmSync(root, { recursive: true, force: true });
});
```

Poi eliminare il commento sull'illeggibilità dei corpi (righe 29-33 attuali), che valeva solo
sotto happy-dom, mantenendo l'helper `isShell`:

```ts
const get = (path: string) => handler(new Request(`http://localhost${path}`));

// The shell is identified by the Content-Type indexHtml sets explicitly.
const isShell = (res: Response) =>
  res.status === 200 && res.headers.get('Content-Type') === 'text/html';
```

- [ ] **Step 2: Eseguire i test esistenti per verificare che sopravvivano alla rimozione del DOM**

```bash
cd apps/web && bun test --isolate --preload ./happydom.ts test/serve.test.ts
```

Atteso: **4 pass, 0 fail** (i quattro test statici già presenti). Se qualcuno fallisce,
`unregister()` ha effetti collaterali non previsti: fermarsi e riferire, non aggirare.

- [ ] **Step 3: Scrivere gli otto casi proxy (falliranno)**

Appendere a `serve.test.ts`:

```ts
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

test('without API_INTERNAL_URL an /api path is just an SPA route', async () => {
  // Development and the e2e harness build the handler with one argument: the proxy must be
  // inert there, not half-configured.
  expect(isShell(await get('/api/utente/me'))).toBe(true);
});
```

- [ ] **Step 4: Eseguire i test per verificare che falliscano**

```bash
cd apps/web && bun test --isolate --preload ./happydom.ts test/serve.test.ts
```

Atteso: **6 pass, 6 fail** su 12. Dei 4 statici passano tutti; degli 8 nuovi ne falliscono 6,
perché `createHandler` ignora il secondo argomento e serve il guscio SPA invece di inoltrare
(`x-saw-path` sarà `null`). I 2 che passano già — `does not intercept application routes` e
`without API_INTERNAL_URL an /api path is just an SPA route` — sono test **di confine**: dicono
che il proxy *non* deve attivarsi, e il loro valore è che continuino a passare dopo. Non è un
errore di conteggio: sapere in anticipo quali test sono di regressione e quali di sviluppo
evita di inseguire un falso problema a questo step.

- [ ] **Step 5: Implementare il proxy in `serve.ts`**

Modificare l'intestazione del file, la firma e il corpo dell'handler:

```ts
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
```

Subito dopo `const distReal = …`, la base parsata una volta sola:

```ts
  // Parsed once, so a malformed API_INTERNAL_URL fails at boot rather than on the first
  // request, and so the proxy below has an authority it can compare against.
  const apiBase = apiInternalUrl === undefined ? undefined : new URL(apiInternalUrl);
```

Dentro l'handler restituito, sostituire la destrutturazione e inserire il ramo proxy come
**prima** cosa, prima di ogni accesso al filesystem:

```ts
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
```

⚠️ **Non ricomporre l'URL con `new URL(path, base)`.** È la forma con cui questo task era
stato scritto in origine, ed è una SSRF: `/api//evil.com/x` veniva inoltrata a `evil.com` **con
i cookie di sessione della vittima**, perché `Cookie` viaggia con `new Request(target, req)` e
`httpOnly` ferma JavaScript, non un proxy. Il proxy vive inoltre dentro la rete privata di
Railway, quindi la stessa falla raggiunge gli altri servizi interni. Il test dello Step 3 e i
mutanti dello Step 7 esistono per questo.

Il resto del corpo (fallback SPA, `realpathSync`, controllo di contenimento, `no-cache` su
`/sw.js`) resta **identico**.

- [ ] **Step 6: Eseguire i test per verificare che passino**

```bash
cd apps/web && bun test --isolate --preload ./happydom.ts test/serve.test.ts
```

Atteso: **12 pass, 0 fail**.

- [ ] **Step 7: Verificare i tre mutanti**

Uno per volta, ripristinando ogni volta.

1. **Query string.** Rimuovere `target.search = search;`.
   Atteso: fallisce **solo** `keeps the query string`. Se passa tutto, quel test è decorativo.
2. **Composizione vulnerabile senza guardia.** Sostituire le tre righe di `target` con
   `const target = new URL(pathname.slice(API_PREFIX.length) + search, apiBase);` **e**
   rimuovere la riga della guardia.
   Atteso: fallisce `cannot be steered off the internal API`, e **impiega centinaia di
   millisecondi** invece di frazioni: quel tempo è il test che esce davvero in rete verso
   `evil.com`, cioè l'exploit che avviene. Misurato: 393 ms contro 0,16 ms.
3. **Composizione vulnerabile con la guardia.** Come sopra, ma lasciando la guardia.
   Atteso: fallisce lo stesso test, ma **in frazioni di millisecondo** — la guardia scatta
   prima di aprire un socket. È la prova che è fail-closed e non codice morto.

- [ ] **Step 8: Eseguire la suite web completa, lint e typecheck**

```bash
bun run --filter '@gc/web' test
bun run lint
bun run typecheck
```

Atteso: web **98 pass** (90 esistenti + 8), lint pulito, typecheck 3/3. Se `lint` segnala
`serve.ts` o `serve.test.ts`, eseguire `bunx prettier --write apps/web/serve.ts apps/web/test/serve.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/serve.ts apps/web/test/serve.test.ts
git commit -F - <<'EOF'
feat(web): proxy /api/* in serve.ts per la topologia a origin singola

Un solo host pubblico serve dist/ e inoltra /api/* all'api: up.railway.app
e' un suffisso pubblico, quindi due sottodomini Railway sono due site
distinti e i cookie SameSite=Lax non viaggerebbero tra loro.

Il proxy e' inerte se API_INTERNAL_URL non e' definita, quindi sviluppo,
test e harness e2e non cambiano comportamento.

Il path viene applicato con il setter di pathname e non risolto contro la
base: new URL('//evil.com/x', base) e' un riferimento network-path, tiene
solo lo SCHEMA della base e prende l'autorita' dal path, quindi
/api//evil.com/x veniva inoltrata a evil.com con i cookie di sessione
della vittima (httpOnly ferma JavaScript, non un proxy) e, vivendo il
proxy nella rete privata di Railway, raggiungeva gli altri servizi
interni. Col setter l'host viene da API_INTERNAL_URL per costruzione; la
guardia sull'origin resta come fail-closed.

serve.test.ts chiama GlobalRegistrator.unregister() in beforeAll: sotto
happy-dom la fetch globale non e' quella di Bun e va in Parse Error. Con
--isolate la rinuncia ai globali resta confinata a questo file.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Bind su `::` nei due entrypoint

**Files:**
- Modify: `apps/api/src/index.ts` (4 righe → 5)
- Modify: `apps/web/serve.ts` (solo il blocco `import.meta.main`)

**Interfaces:**
- Consumes: il `createHandler` a due parametri del Task 1.
- Produces: niente per i task successivi; è il presupposto della raggiungibilità sulla rete
  privata usata dal Task 5.

**Perché non c'è un test.** L'asserzione sarebbe «un socket su `::` accetta anche IPv4», che
richiede di occupare una porta reale in una suite che gira in parallelo a `./dev.sh` e alla
suite e2e (`SO_REUSEPORT` rende una collisione silenziosa, vedi `e2e/harness.ts:18-33`). Il
comportamento è stato verificato manualmente durante la stesura della spec e la sua garanzia
operativa è la riga di log all'avvio più il primo `curl` della checklist del Task 7.

- [ ] **Step 1: Modificare l'entrypoint dell'api**

`apps/api/src/index.ts` diventa:

```ts
import { buildApp } from './app';
import { env } from './env';

// hostname '::' and not the default 0.0.0.0: Railway's private network is IPv6-only on
// environments created before 2025-10-16, so an IPv4-only listener is reachable from the
// public edge and invisible to the web service's proxy — a healthy deploy that answers
// ECONNREFUSED. Verified dual-stack on Linux: a ::-bound server also answers on 127.0.0.1,
// so development, `bun test` and the e2e suite are unaffected.
//
// Deliberately fixed here instead of in an env var: a variable that can be forgotten would
// reproduce exactly the fault this line prevents (same reasoning as env.ts on NODE_ENV).
buildApp().listen({ port: env.PORT, hostname: '::' });
console.log(`API listening on port ${env.PORT} (dual-stack)`);
```

- [ ] **Step 2: Modificare il blocco `import.meta.main` di `serve.ts`**

```ts
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
```

- [ ] **Step 3: Verificare che l'api si avvii e risponda su IPv4**

In un terminale, con l'api di sviluppo **non** già in esecuzione:

```bash
cd apps/api && bun run dev
```

In un altro:

```bash
curl -s http://127.0.0.1:5000/health
```

Atteso: `{"status":"ok"}` — un indirizzo IPv4 verso un listener `::`. Fermare l'api.

- [ ] **Step 4: Verificare che la suite completa non regredisca**

```bash
DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun run test
bun run typecheck
bun run lint
```

Atteso: api/shared **49 pass**, web **98 pass**, typecheck 3/3, lint pulito.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/web/serve.ts
git commit -F - <<'EOF'
fix(api): bind su :: per la rete privata IPv6 di Railway

.listen(port) fa bind su 0.0.0.0, quindi solo IPv4: la rete privata di
Railway risolve *.railway.internal solo su IPv6 negli ambienti creati
prima del 2025-10-16, e il servizio risulterebbe sano e raggiungibile
dall'edge pubblico ma invisibile al proxy interno.

Verificato dual-stack su Linux: un server su :: risponde anche a
127.0.0.1, quindi dev, bun test ed e2e non cambiano. Stesso bind nel
blocco import.meta.main di serve.ts, che Railway raggiunge allo stesso
modo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Variabili documentate e commento `ponytail:` corretto

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `apps/api/.env.example`
- Modify: `apps/web/public/sw.js` (solo commento)

**Interfaces:**
- Consumes: il nome `API_INTERNAL_URL` e il prefisso `/api` del Task 1.
- Produces: i valori che il runbook del Task 6 e la dashboard Railway devono riprodurre.

**Solo web e documentazione: non eseguire la suite api né il gate di root.**

- [ ] **Step 1: Estendere `apps/web/.env.example`**

Appendere:

```
# Production topology (Fase 6): the web service is the only public host and proxies /api/*
# to the API over Railway's private network, so PUBLIC_API_URL points at THIS host with an
# /api prefix. The prefix must match API_PREFIX in serve.ts.
#   PUBLIC_API_URL=https://gestione-casa.up.railway.app/api
#
# RUNTIME (not PUBLIC_*, and deliberately so: it must never reach the browser bundle).
# Absent means the proxy in serve.ts stays inert, which is what development wants.
#   API_INTERNAL_URL=http://api.railway.internal:5000
#
# To reproduce the production shape locally, with the API running on 5000:
#   PUBLIC_API_URL=http://localhost:3000/api API_INTERNAL_URL=http://localhost:5000 \
#     bun run --filter '@gc/web' preview
# API_INTERNAL_URL=
```

- [ ] **Step 2: Estendere il commento di produzione in `apps/api/.env.example`**

Sostituire il blocco finale con:

```
# Optional in dev, REQUIRED in production (the `start` script sets NODE_ENV=production,
# and readEnv refuses to boot without them — see apps/api/src/env.ts).
# COOKIE_SECURE=true
#
# COOKIE_DOMAIN is deliberately LEFT UNSET in production: web and api share one origin
# behind the proxy in apps/web/serve.ts, so the cookies are host-only. It could not be set
# to a Railway subdomain anyway — up.railway.app is a public suffix.
# COOKIE_DOMAIN=example.com
#
# In production CORS_ORIGIN is the single public host, e.g.
#   CORS_ORIGIN=https://gestione-casa.up.railway.app
# PORT is set explicitly there (5000) because the web service's API_INTERNAL_URL names it.
```

- [ ] **Step 3: Correggere il commento `ponytail:` in `sw.js`**

Sostituire le righe 35-38 con:

```js
  // Same-origin API calls need no exclusion, and this is worth stating because Fase 6 put
  // web and api on one origin, which is exactly when an exclusion looks necessary: below,
  // the worker only responds for isImmutableAsset (/index-<hash>.js|css) or for a
  // navigation. An Eden fetch to /api/... is neither, so it falls through both branches and
  // goes to the network uncached. Add an explicit /api/ exclusion only if a catch-all
  // caching branch is ever introduced.
  if (url.origin !== self.location.origin) return;
```

**Nessuna modifica di codice in questo file.** Se sembra necessaria, rileggere il Task 3
delle *Correzioni alla spec* prima di procedere.

- [ ] **Step 4: Verificare che nulla si sia rotto**

```bash
bun run --filter '@gc/web' test
bun run lint
```

Atteso: **98 pass**, lint pulito. (`sw.js` è in `public/`, non entra nel bundle come modulo:
il solo test che lo riguarda verifica che `serve.ts` lo serva con `Cache-Control: no-cache`.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/.env.example apps/web/.env.example apps/web/public/sw.js
git commit -F - <<'EOF'
docs: variabili di produzione e correzione del commento in sw.js

Documenta API_INTERNAL_URL (runtime, deliberatamente senza prefisso
PUBLIC_) e il PUBLIC_API_URL con prefisso /api, piu' il comando per
riprodurre la topologia di produzione in locale.

Il commento ponytail: in sw.js prevedeva di dover escludere quattro
prefissi di rotta a origin condivisa. Non serve: dopo il controllo di
origin il worker risponde solo per gli asset immutabili o per una
navigazione, e una chiamata Eden non e' ne' l'una ne' l'altra. Il
commento ora dice questo, invece di indurre codice morto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: `NODE_ENV=production` nel build del web

Il bundle di produzione spedisce oggi **React in modalità sviluppo**. Non è un rischio
teorico: è misurato su questo repository il 2026-08-12, con gli stessi flag dello script
`build` attuale.

| Build | Peso | `Minified React error` (produzione) | `Each child in a list…` (sviluppo) |
|---|---|---|---|
| script `build` attuale | **1,2 M** | 0 | 1 |
| `NODE_ENV=production` + gli stessi flag | **900 K** | 1 | 0 |
| `--define process.env.NODE_ENV="production"` | **900 K** | 1 | 0 |

Nel bundle attuale `process.env.NODE_ENV` non compare (0 occorrenze): il bundler di Bun la
sostituisce comunque, e in assenza della variabile d'ambiente ci mette `"development"`. Il
ramo di sviluppo di React resta quindi vivo — messaggi di invariant completi, controllo delle
`key`, `Invalid hook call` — per **300 KB in più su ogni primo caricamento**, il 25% del
bundle.

**Files:**
- Modify: `apps/web/package.json` (lo script `build`)
- Modify: `apps/web/smoke.ts` (una asserzione, dopo la riga 35)

**Interfaces:**
- Consumes: niente.
- Produces: uno script `build` che possiede la propria `NODE_ENV`. Il Dockerfile del web
  (Task 5) si appoggia a questo e **non** deve dichiarare `ENV NODE_ENV=production`.

**Perché nello script e non altrove.** Tre ragioni, tutte verificate:

1. `smoke` gira sotto `bun run` (ambiente `NODE_ENV` **undefined**) ed `e2e` sotto `bun test`
   (che Bun imposta a **`"test"`**). Un valore preso dall'ambiente sarebbe quindi sbagliato in
   entrambi i casi; l'assegnazione inline nello script vince su tutto ed è l'unico punto
   affidabile.
2. Nel Dockerfile, la produzione costruirebbe un artefatto diverso da quello che `smoke`,
   `preview`, `e2e` e la CI verificano — la classe di guasto esatta per cui il passo `smoke`
   esiste.
3. `bun run dev` non è toccato: il server di sviluppo continua a servire React in dev-mode,
   che è quello che si vuole.

Nessun rischio lato installazione: a differenza di npm, **`bun install` non salta le
`devDependencies` con `NODE_ENV=production`** (verificato installando un pacchetto di prova).

- [ ] **Step 1: Scrivere l'asserzione in `smoke.ts` (fallirà)**

Inserire subito **dopo** la riga 35 (`const code = await Bun.file(…).text();`):

```ts
// 2. The bundle must carry React's PRODUCTION build. Bun's bundler substitutes
// process.env.NODE_ENV at build time and falls back to "development" when the ambient
// variable is unset, which leaves React's dev branch alive: ~300 KB of invariant messages,
// key checks and hook-order checks shipped to every visitor, on a build that looks fine.
// Assert the PRESENCE of the production marker rather than the absence of dev warnings:
// production React replaces its messages with numeric codes, so the good bundle is the one
// carrying the cryptic string. Should React ever rename it, this fails loudly — the safe
// direction for a check whose whole job is to notice a silent downgrade.
if (!code.includes('Minified React error'))
  fail('bundle ships development React — the build script must set NODE_ENV=production');
```

Poi rinumerare il commento del controllo successivo, da `// 2. The bundle must boot without
`process`.` a `// 3. The bundle must boot without `process`.`, e aggiornare la riga finale:

```ts
console.log('smoke: OK — assets absolute, React in production, boots and renders without `process`');
```

- [ ] **Step 2: Eseguire lo smoke per verificare che fallisca**

```bash
bun run --filter '@gc/web' smoke
```

Atteso: `smoke: FAIL — bundle ships development React …`, exit 1.

- [ ] **Step 3: Correggere lo script `build`**

In `apps/web/package.json`, lo script `build` diventa (una sola aggiunta, `NODE_ENV=production`
davanti a `bun build`):

```json
"build": "rm -rf dist && NODE_ENV=production bun build ./index.html --outdir dist --minify --env 'PUBLIC_*' --public-path=/ && cp -R public/icons public/sw.js dist/",
```

`--env 'PUBLIC_*'` resta necessario e invariato: `NODE_ENV` non è una variabile `PUBLIC_*`, e
il bundler la sostituisce per conto proprio — la build di confronto qui sopra lo dimostra,
avendo prodotto il bundle di produzione con lo stesso `--env`.

- [ ] **Step 4: Eseguire lo smoke per verificare che passi, e misurare**

```bash
bun run --filter '@gc/web' smoke
du -h apps/web/dist/index-*.js
```

Atteso: `smoke: OK — assets absolute, React in production, boots and renders without
`process``, e un bundle intorno ai **900 K** (era 1,2 M).

- [ ] **Step 5: Verificare il mutante**

Rimuovere temporaneamente `NODE_ENV=production` dallo script e rieseguire `smoke`.

Atteso: torna a fallire. Se passa, l'asserzione non sta misurando nulla. Ripristinare.

- [ ] **Step 6: Verificare che la suite web non regredisca**

```bash
bun run --filter '@gc/web' test
bun run lint
bun run typecheck
```

Atteso: **98 pass** (gli 8 casi proxy del Task 1 sono già dentro), lint pulito, typecheck 3/3.

I test unitari non toccano il bundle: girano sui sorgenti sotto happy-dom, quindi React resta
in dev-mode lì e nulla cambia. L'`e2e`, invece, costruisce l'artefatto e da ora gira contro
React di produzione — nessuna asserzione della suite dipende dai warning di sviluppo, e il
gate completo del Task 7 lo conferma.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/smoke.ts
git commit -F - <<'EOF'
fix(web): build di produzione con NODE_ENV=production

Il bundler di Bun sostituisce process.env.NODE_ENV a build time e, se la
variabile non e' definita nell'ambiente, ci mette "development": il
bundle di produzione conteneva quindi il ramo di sviluppo di React, con i
messaggi di invariant completi e i controlli delle key. 1,2 M -> 900 K,
il 25% in meno su ogni primo caricamento.

Assegnata nello script build e non nel Dockerfile: smoke gira sotto bun
run (NODE_ENV undefined) ed e2e sotto bun test (che Bun imposta a
"test"), quindi l'ambiente non e' affidabile, e un valore che vive solo
nel Dockerfile farebbe verificare in locale un artefatto diverso da
quello di produzione. bun run dev non e' toccato.

smoke.ts asserisce la PRESENZA del marker di produzione invece
dell'assenza dei warning: React di produzione sostituisce i messaggi con
codici numerici, quindi il bundle buono e' quello con la stringa
criptica. Il guasto era invisibile alla suite perche' un bundle in
dev-mode si avvia perfettamente: e' piu' grande, non rotto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: I due Dockerfile

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `API_INTERNAL_URL` letta da `serve.ts` (Task 1), il bind `::` (Task 2).
- Produces: le immagini che il runbook del Task 6 configura via `RAILWAY_DOCKERFILE_PATH`.

**Perché Dockerfile e non configurazione di build.** La guida Bun di Railway dichiara che
Railpack **non rileva** i progetti Bun e chiede un Dockerfile. Il pin
`oven/bun:1.3.14-alpine` (tag verificato esistente) allinea la produzione al `bun-version`
di `ci.yml`.

**Perché il contesto è la radice del repo.** I workspace Bun hanno bisogno del
`package.json` e del `bun.lock` di radice: `apps/api` dipende da `@gc/shared-types` con
`workspace:*`, quindi isolare la root directory su `apps/api` romperebbe l'installazione. La
*root directory* dei due servizi Railway resta `/`.

- [ ] **Step 1: Creare `.dockerignore`**

```
node_modules
apps/*/node_modules
packages/*/node_modules
apps/web/dist
e2e/.artifacts
.git
```

Serve a una build locale (`docker build .`): senza di esso il contesto porterebbe dentro i
`node_modules` dell'host, che un `bun install` successivo troverebbe già popolati e
potenzialmente incoerenti con l'architettura dell'immagine.

- [ ] **Step 2: Creare `apps/api/Dockerfile`**

```dockerfile
# Railpack does not detect Bun projects (Railway's own Bun guide), so the build is explicit.
# The tag pins the same Bun as .github/workflows/ci.yml, so production and CI agree.
FROM oven/bun:1.3.14-alpine

WORKDIR /app

# Build context is the repo root: apps/api depends on @gc/shared-types through
# `workspace:*`, which needs the root package.json and bun.lock.
COPY . .

# ponytail: installs every workspace dependency, test tooling and the other app included.
# Switch to `bun install --filter '@gc/api'` if build time starts to matter.
RUN bun install --frozen-lockfile

# The `start` script is what sets NODE_ENV=production, which is what makes env.ts refuse to
# boot without CORS_ORIGIN and COOKIE_SECURE. Do not inline `bun run src/index.ts` here:
# that would silently disable both checks.
CMD ["bun", "run", "--filter", "@gc/api", "start"]
```

- [ ] **Step 3: Creare `apps/web/Dockerfile`**

```dockerfile
# See apps/api/Dockerfile for why a Dockerfile and why this tag.
FROM oven/bun:1.3.14-alpine

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

# PUBLIC_* variables are inlined into the bundle at BUILD time, so they must be build args:
# supplied at runtime they would arrive too late, leaving a literal `process.env.PUBLIC_API_URL`
# in the bundle, which throws in a browser (there is no `process`) before any app code runs.
# Railway exposes service variables to the build; ARG is what lets the RUN below read them.
ARG PUBLIC_API_URL
ARG PUBLIC_ENABLE_SW

# No `ENV NODE_ENV=production` here on purpose: the build script owns it (Task 4), so local,
# CI and production emit the identical artifact. Setting it here would make the one thing
# smoke/preview/e2e verify differ from the one thing users get.
RUN bun run --filter '@gc/web' build

# serve.ts resolves dist/ relative to its own file, so the working directory does not matter.
# At RUNTIME it reads PORT (injected by Railway) and API_INTERNAL_URL (the private address of
# the api service) — neither belongs in the bundle.
CMD ["bun", "apps/web/serve.ts"]
```

- [ ] **Step 4: Verificare che le immagini si costruiscano davvero**

Se Docker è disponibile in locale:

```bash
docker build -f apps/api/Dockerfile -t gc-api-test .
docker build -f apps/web/Dockerfile \
  --build-arg PUBLIC_API_URL=http://localhost:3000/api \
  --build-arg PUBLIC_ENABLE_SW=true -t gc-web-test .
```

Atteso: entrambe le build terminano con successo, e nel log della seconda compare l'output
del bundler di Bun.

Verificare che la variabile sia stata inlineata davvero, che è il guasto più probabile:

```bash
docker run --rm gc-web-test sh -c "grep -c 'localhost:3000/api' apps/web/dist/index-*.js"
```

Atteso: un numero ≥ 1. Se è 0, l'`ARG` non ha raggiunto il build.

Se Docker non è disponibile: **saltare questo step e dichiararlo nel commit**, annotando che
la prima build reale avverrà su Railway (dove il log di build è la verifica).

- [ ] **Step 5: Verificare che i file nuovi non rompano i gate**

```bash
bun run lint
```

Atteso: pulito (Prettier non formatta i Dockerfile né `.dockerignore`, ma il comando deve
comunque passare).

- [ ] **Step 6: Commit**

```bash
git add apps/api/Dockerfile apps/web/Dockerfile .dockerignore
git commit -F - <<'EOF'
build: Dockerfile per i due servizi Railway

Railpack non rileva i progetti Bun (guida Bun di Railway), quindi il
build va dichiarato. oven/bun:1.3.14-alpine pinna la stessa versione di
ci.yml, cosi' produzione e CI girano sullo stesso runtime.

Contesto alla radice del repo: apps/api dipende da @gc/shared-types con
workspace:*, quindi la root directory dei servizi resta / e il Dockerfile
si seleziona con RAILWAY_DOCKERFILE_PATH.

Il Dockerfile del web dichiara PUBLIC_API_URL e PUBLIC_ENABLE_SW come
ARG: sono inlineate nel bundle a build time, e a runtime arriverebbero
troppo tardi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Runbook nel README e correzioni alla spec

**Files:**
- Modify: `README.md` (oggi 3 righe)
- Modify: `docs/superpowers/specs/2026-08-11-phase6-cutover-design.md`

**Interfaces:**
- Consumes: i nomi delle variabili dei Task 1-5.
- Produces: la documentazione operativa che il Task 7 esegue.

- [ ] **Step 1: Applicare al file della spec le quattro correzioni**

Elencate in *Correzioni alla spec emerse durante la pianificazione*, in testa a questo piano:

1. §1 — rimuovere «Healthcheck sull'api» da *Fuori scope*; §9 — aggiungere
   `healthcheckPath = /health` al servizio api nella sequenza di deploy.
2. §5 — la riga di `sw.js` diventa «correzione del commento, nessuna modifica di codice»,
   con la motivazione strutturale.
3. §8 — sostituire `e2e/proxy.test.ts` con la verifica locale della topologia di produzione;
   §11 — togliere il file dai *Nuovi*.
4. §3 e §7 — il bind `::` riguarda entrambi i servizi; §11 — aggiungere `.dockerignore` ai
   *Nuovi*.

- [ ] **Step 2: Scrivere il runbook nel README**

Il README ha oggi 3 righe. Aggiungere una sezione `## Deploy (Railway)` che contenga:

- il diagramma di topologia della spec §3;
- le due tabelle di variabili della spec §7, **complete di valori**, con
  `RAILWAY_DOCKERFILE_PATH` e l'annotazione build-time / runtime;
- `healthcheckPath`: `/health` per l'api, `/` per il web, e la nota che `/api/health`
  attraverso il proxy è il primo controllo manuale dopo il deploy (non l'healthcheck del
  servizio web, per non far dipendere il deploy del web dallo stato dell'api);
- root directory `/` per entrambi i servizi, con il perché (workspace);
- la sequenza di deploy in sei punti (spec §9);
- il rollback: i servizi legacy restano accesi, non c'è nulla da ripristinare;
- la convivenza: `gc.utente` e `gc.token` sono condivisi, quindi un cambio password sullo
  stack nuovo disconnette la sessione legacy; i `JWT_SECRET` sono diversi per scelta;
- la dismissione del legacy, per quando servirà;
- il comando di riproduzione locale della topologia di produzione (Task 7, Step 1).

- [ ] **Step 3: Verificare i gate**

```bash
bun run lint
```

Atteso: pulito. `.prettierignore` salta `*.md` e `docs`, quindi la formattazione del README
non è vincolata da Prettier — ma il comando deve passare.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-11-phase6-cutover-design.md
git commit -F - <<'EOF'
docs: runbook di deploy nel README e correzioni alla spec della Fase 6

Il runbook e' l'unica documentazione della configurazione che vive solo
nella dashboard Railway: variabili con valori, healthcheck, root
directory, sequenza di deploy, rollback, convivenza dei due stack sullo
stesso database, dismissione del legacy.

Quattro correzioni alla spec emerse pianificando: GET /health esiste gia'
(app.ts:27, usato da harness.ts) quindi l'healthcheck dell'api e' gratis;
sw.js non ha bisogno di modifiche di codice; e2e/proxy.test.ts e'
sostituito dalla verifica locale con lo script preview, perche'
PUBLIC_API_URL e' inlineata a build time e l'harness costruisce il bundle
una volta sola; il bind :: riguarda entrambi i servizi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Verifica della topologia di produzione, gate di chiusura, PR

**Files:** nessuno (verifica ed esecuzione).

- [ ] **Step 1: Riprodurre la topologia di produzione in locale, in un browser reale**

È il sostituto di `e2e/proxy.test.ts` e copre più di quanto coprirebbe: browser vero, api
vera, cookie veri, un solo origin. Non richiede una riga di codice.

Terminale 1 — api di sviluppo:

```bash
bun run --filter '@gc/api' dev
```

Terminale 2 — bundle di produzione servito **con il proxy attivo**:

```bash
cd apps/web && PUBLIC_API_URL=http://localhost:3000/api API_INTERNAL_URL=http://localhost:5000 \
  PUBLIC_ENABLE_SW=true bun run preview
```

Aprire `http://localhost:3000` e verificare:

- [ ] il login riesce, e in DevTools → Application → Cookies i cookie `access` e `refresh`
      sono su `localhost:3000` (**non** su `:5000`), con `HttpOnly` e **senza** `Domain`;
- [ ] in DevTools → Network le chiamate vanno a `http://localhost:3000/api/...` e **non
      c'è nessun preflight `OPTIONS`** — la prova che l'origin è una sola;
- [ ] un reload mantiene la sessione;
- [ ] CRUD andamento completo: creazione, modifica, clonazione, eliminazione;
- [ ] i sei schermi `statistiche` disegnano i grafici;
- [ ] deep link diretto su `http://localhost:3000/statistiche/casa`: carica l'app, non 404;
- [ ] `curl -s http://localhost:3000/api/health` → `{"status":"ok"}` (il proxy inoltra);
- [ ] `curl -s "http://localhost:3000/api//example.com/"` → la risposta d'errore **dell'api**
      (404 di Elysia), **non** il contenuto di example.com: è la SSRF del Task 1, verificata
      end-to-end oltre che nei test;
- [ ] il service worker si registra e, in Application → Cache Storage, **nessuna** risposta
      `/api/*` è in cache.

Se il login fallisce qui, **non proseguire al deploy**: è lo stesso guasto che si
manifesterebbe in produzione, con un ciclo di diagnosi molto più breve.

- [ ] **Step 2: Gate completo**

```bash
DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun run test
bun run typecheck
bun run lint
bun run --filter '@gc/web' smoke
bun run e2e
```

Atteso: api/shared **49 pass**, web **98 pass**, typecheck 3/3, lint pulito, smoke ok, e2e
**17 pass** (i cinque file esistenti restano validi: descrivono la faccia cross-origin
dell'api, che il dominio pubblico dell'api mantiene reale).

⚠️ `bun run e2e` richiede un browser Chromium e il database `gc_test`, e non gira in CI.

- [ ] **Step 3: Push e apertura della PR**

Il branch è già su origin con l'upstream configurato (spec `ff963d6` + piano `e91329d`),
quindi basta:

```bash
git push
gh pr create --base master --title "Fase 6 — Cutover: deploy su Railway a origin singola" --body "..."
```

Il corpo della PR deve contenere: il motivo della deviazione dal dominio custom (suffisso
pubblico), l'elenco delle modifiche, il guadagno del Task 4 (bundle 1,2 M → 900 K, React di
produzione), il fatto che la CI **non** costruisce le immagini Docker (quindi la prima build
reale è su Railway), e la checklist di verifica post-deploy della spec §9 come elenco di
spunta per il revisore.

- [ ] **Step 4: Attendere la CI verde e fermarsi**

Il deploy su Railway richiede le credenziali dell'utente: creazione dei due servizi,
variabili, domini. Non tentare di automatizzarlo. Al verde della CI, riferire e fermarsi.

---

## Self-Review

**Copertura della spec.** §2 (motivazione) → Task 1 e 6. §3 topologia → Task 2 e 5. §4
proxy → Task 1. §5 modifiche al codice → Task 1, 2, 3 (con la correzione su `sw.js`). §6
artefatti → Task 5. §7 variabili → Task 3 e 6. §8 test → Task 1 (con `e2e/proxy.test.ts`
sostituito, motivato). §9 runbook e verifica → Task 6 e 7. §10 rischi → coperti dai passi di
verifica corrispondenti. §12 definizione di completo → Task 7, tranne i punti 3 e 4 (deploy e
checklist su Railway), che richiedono le credenziali dell'utente e restano fuori dal branch.

**Fuori spec, aggiunto su richiesta dell'utente.** Task 4 (`NODE_ENV=production` nel build):
non discende da nessuna sezione della spec — è un guasto di produzione trovato il 2026-08-12
mentre si rispondeva a una domanda, e l'utente ha chiesto di farlo entrare nella fase prima
dei Dockerfile. Chiude anche, in parte, il debito «bundle 1,17 MB / nessun code splitting», il
cui trigger dichiarato era proprio «misurare su rete reale alla Fase 6»: −25% senza toccare il
code splitting.

**Coerenza dei nomi.** `createHandler(distUrl, apiInternalUrl?)`, `API_PREFIX = '/api'`,
`API_INTERNAL_URL`, `PUBLIC_API_URL`, `PUBLIC_ENABLE_SW`, `RAILWAY_DOCKERFILE_PATH`:
identici in tutti i task, e coerenti con `apps/web/src/config.ts` (che non cambia).

**Conteggi attesi.** Baseline misurata il 2026-08-12 su `feat/phase6-cutover` @ `e91329d`:
web **90 pass / 22 file** (di cui 4 in `serve.test.ts`), api+shared **49 pass / 14 file**,
e2e **17**, bundle **1,2 M**. Dopo la Fase 6: web → **98** (8 casi proxy, uno dei quali di sicurezza), api/shared e e2e
invariati, bundle → **900 K**. Se la baseline non corrisponde all'inizio dell'esecuzione,
`master` si è mosso: allineare il branch prima di iniziare, non adattare i numeri.
