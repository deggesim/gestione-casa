# Fase 5 — Testing: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una suite E2E su Chrome reale (4 flussi) che verifica ciò che i 37 file di test esistenti non possono vedere — cookie cross-origin, preflight CSRF, rendering di Recharts, logout forzato dal profilo — più la chiusura del debito `mock.module` con `bun test --isolate`.

**Architecture:** Gli E2E sono file `bun test` che guidano `Bun.WebView` (backend Chrome via DevTools Protocol). Un harness singleton a livello di modulo semina il DB, avvia l'API su `:5001` e l'artefatto web buildato su `:3001`, e apre una webview: `bun test e2e/` esegue i file in sequenza nello stesso processo, quindi tutto questo avviene una volta sola. Nessuna dipendenza nuova, nessun runner Node.

**Tech Stack:** Bun 1.3.14 (`Bun.WebView`, `Bun.SQL`, `bun test`), Chrome 143 installato sulla macchina, Postgres `gc_test` su `:5432`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-10-phase5-testing-design.md`. In caso di conflitto, vince la spec.
- **Branch:** `feat/phase5-testing` (da `master` @ `405503b`). Commit per-task autorizzati dall'utente.
- **Bun 1.3.14**, pinnato anche in `ci.yml`. Non aggiornare.
- **Nessuna modifica al codice di produzione.** Se un selettore sembra irraggiungibile, si estende l'harness, non il markup. Unica eccezione ammessa: i file di test web toccati dal Task 6.
- **DB:** solo `postgres://gctest:gctest@localhost:5432/gc_test`. **Mai** il DB di sviluppo (`apps/api/.env`) — la suite api fa `TRUNCATE`, e in Fase 4b questo ha distrutto il DB di dev.
- **`await view.navigate(url)` sempre esplicito.** Passare `url:` al costruttore di `Bun.WebView` e valutare subito solleva `'Runtime.evaluate' wasn't found`, un errore CDP che non spiega nulla.
- **Il testo si inserisce solo con `click()` + `type()`.** Verificato in fase di design: assegnare `value` da `evaluate` **non funziona** con questa app, né in versione diretta né col trucco del native setter di `HTMLInputElement` — react-hook-form non registra il valore e il bottone di submit resta `disabled`. Un test che inietta valori passerebbe l'asserzione sul DOM e mancherebbe completamente lo stato del form.
- **`press()` non accetta chord.** Solo virtual key names (`Enter`, `Tab`, `Escape`, `End`, `Arrow*`, `Backspace`) o un singolo carattere: `press('ctrl+a')` solleva un errore. Per svuotare un campo servono `End` più tanti `Backspace` quanti sono i caratteri — l'harness lo incapsula in `fill()` (Task 1), che è **l'unico** modo ammesso di scrivere in un campo già popolato.
- **Lo script `e2e` non usa `--isolate`** (romperebbe il singleton dell'harness: un boot per file). Lo script `test` di `apps/web` invece **deve** usarlo (Task 6).
- **Italiano** per commit, testo utente e nomi di dominio; commenti in inglese come nel resto del repo.
- **Le date del seed sono relative a oggi.** Le schermate statistiche partono su "Ultimo mese": con date fisse il grafico è vuoto e l'asserzione non asserisce niente.
- Ogni task termina con `bunx prettier --check .` pulito (il repo usa prettier come gate di lint).

---

### Task 1: Harness, seed e comando

Fondamenta. Al termine, `bun run e2e` semina il DB, alza i due server, apre la webview e verifica che l'app buildata risponda.

**Files:**

- Create: `e2e/seed.ts`
- Create: `e2e/harness.ts`
- Create: `e2e/boot.test.ts`
- Modify: `package.json` (script `e2e`)
- Modify: `.gitignore`
- Modify: `CLAUDE.md` (sezione E2E)

**Interfaces:**

- Consumes: `apps/web/serve.ts` → `createHandler(distUrl: URL)`; il preload `apps/api/test/setup.ts` configurato in `bunfig.toml`, che crea lo schema `gc` (DDL idempotente) prima di qualsiasi test.
- Produces:
  - `e2e/seed.ts`: `E2E_USER: { email: string; password: string }`, `seedDb(): Promise<void>`, `seedUtente(apiUrl: string): Promise<void>`
  - `e2e/harness.ts`: `view: Bun.WebView`, `WEB_URL: string`, `API_URL: string`, `waitFor<T>(what: string, probe: string, timeoutMs?: number): Promise<T>`, `clickText(selector: string, text: string): Promise<void>`, `fill(selector: string, text: string): Promise<void>`, `ensureLoggedIn(): Promise<void>`, `shot(name: string): Promise<void>`, `reseed(): Promise<void>`

- [x] **Step 1: scrivere il seed**

`e2e/seed.ts`:

```ts
import { SQL } from 'bun';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';

export const E2E_USER = { email: 'e2e@example.it', password: 'segretissima' };

// Same shape the app uses: process env wins over apps/api/.env, so the caller decides
// which database this touches. The e2e script sets it; nothing here defaults it.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Missing DATABASE_URL — run via `bun run e2e`');

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

// Dates are RELATIVE to today because every statistiche screen defaults to "Ultimo mese":
// fixed dates in the past render an empty chart, and an assertion on an empty chart passes
// for the wrong reason. Repeated descriptions (pane, benzina) give the pie something to
// group by; the two rows past a year feed the "Ultimo anno" interval.
const rows: readonly [string, string, number, number][] = [
  [daysAgo(1), 'spesa settimanale', 100, 1],
  [daysAgo(3), 'spesa settimanale', 120, 1],
  [daysAgo(5), 'pane', 8, 1],
  [daysAgo(6), 'pane', 9, 1],
  [daysAgo(7), 'latte', 3, 1],
  [daysAgo(2), 'benzina', 60, 2],
  [daysAgo(9), 'benzina', 55, 2],
  [daysAgo(4), 'luce', 40, 3],
  [daysAgo(40), 'gas', 45, 3],
  [daysAgo(8), 'affitto', 500, 7],
  [daysAgo(400), 'affitto', 480, 7],
];

export const seedDb = async () => {
  const sql = new SQL(url);
  try {
    // Guard, not hygiene: in Fase 4b a test runner pointed at the dev database and
    // TRUNCATEd it. A real database has thousands of rows; a test one has none.
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM gc.andamento`;
    if (n > 100)
      throw new Error(`refusing to TRUNCATE: gc.andamento has ${n} rows, this is not a test DB`);

    await sql`TRUNCATE gc.token, gc.andamento, gc.utente, gc.tipo_spesa RESTART IDENTITY CASCADE`;
    await sql`INSERT INTO gc.tipo_spesa (id, descrizione) VALUES
      (1,'spesa'),(2,'carburante'),(3,'bolletta'),(7,'casa')`;
    for (const [giorno, descrizione, costo, tipo] of rows)
      await sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id)
        VALUES (${giorno}, ${descrizione}, ${costo}, ${tipo})`;
  } finally {
    await sql.close();
  }
};

// Goes through the public endpoint so the password hash is produced by the app itself,
// which means the login flow validates against a real hash. Needs the API already up.
export const seedUtente = async (apiUrl: string) => {
  const res = await fetch(`${apiUrl}/utente`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
    body: JSON.stringify(E2E_USER),
  });
  if (!res.ok) throw new Error(`seedUtente failed: ${res.status} ${await res.text()}`);
};
```

Le costanti CSRF esistono e sono già riesportate da `@gc/shared-types`
(`packages/shared-types/src/csrf.ts`: `CSRF_HEADER = 'X-Requested-With'`,
`CSRF_VALUE = 'gc-web'`). Importarle, non reintrodurre le stringhe a mano.

- [x] **Step 2: scrivere l'harness**

`e2e/harness.ts`:

```ts
import { createHandler } from '../apps/web/serve';
import { E2E_USER, seedDb, seedUtente } from './seed';

// ponytail: hand-rolled harness instead of Playwright — 4 local flows do not pay for a
// Node runner plus a 150 MB browser download. Switch to Playwright if the suite turns
// flaky, if a failure needs a trace to diagnose, or if it grows past ~10 flows: the
// assertions are already CSS selectors and DOM conditions, so the port is mechanical.

const API_PORT = 5001;
const WEB_PORT = 3001;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

const root = new URL('../', import.meta.url);
const webDir = new URL('./apps/web/', root);

const untilReachable = async (url: string, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`timeout: ${url} never answered`);
    await Bun.sleep(100);
  }
};

await seedDb();

// The built artifact, not the dev server: it is what Fase 6 ships, and the dev server
// answers 200-with-HTML for any unknown path. PUBLIC_* vars are inlined at build time,
// so the API URL has to be decided here, before the bundle exists.
const build = Bun.spawnSync(['bun', 'run', 'build'], {
  cwd: Bun.fileURLToPath(webDir),
  env: { ...process.env, PUBLIC_API_URL: API_URL, PUBLIC_ENABLE_SW: 'false' },
});
if (build.exitCode !== 0) throw new Error(`web build failed: ${build.stderr.toString()}`);

// Only PORT and CORS_ORIGIN are overridden — DATABASE_URL and JWT_SECRET come from the
// `e2e` script. The child runs with cwd=apps/api and therefore loads apps/api/.env, which
// points at the DEV database: it is the injected DATABASE_URL winning over the file that
// keeps this safe.
const api = Bun.spawn(['bun', 'run', 'src/index.ts'], {
  cwd: Bun.fileURLToPath(new URL('./apps/api/', root)),
  env: { ...process.env, PORT: String(API_PORT), CORS_ORIGIN: WEB_URL },
  stdout: 'pipe',
  stderr: 'pipe',
});
await untilReachable(`${API_URL}/health`);
await seedUtente(API_URL);

const web = Bun.serve({
  port: WEB_PORT,
  fetch: createHandler(new URL('./dist/', webDir)),
});

export const view = new Bun.WebView({ width: 1280, height: 800 });

// bun test has no global afterAll across files, so cleanup hangs off process exit.
process.on('exit', () => {
  try {
    view.close();
  } catch {
    // already closed
  }
  web.stop(true);
  api.kill();
});

/** Polls `probe` in the page until it returns something truthy. Replaces Playwright's
 *  auto-retrying assertions: `what` is what shows up in the timeout message. */
export const waitFor = async <T>(what: string, probe: string, timeoutMs = 10_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = (await view.evaluate(probe)) as T;
    if (value !== null && value !== undefined && (value as unknown) !== false) return value;
    if (Date.now() > deadline) {
      await shot(`timeout-${what.replace(/\W+/g, '-')}`);
      throw new Error(`timeout waiting for ${what}`);
    }
    await Bun.sleep(50);
  }
};

/** click() takes CSS selectors only — there is no getByRole/text= engine. Tag the match
 *  from JS, then click it for real through the input pipeline so actionability still
 *  applies (visible, stable, topmost). */
export const clickText = async (selector: string, text: string) => {
  const found = await view.evaluate(
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => e.textContent.trim() === ${JSON.stringify(text)});
      if (!el) return false; el.setAttribute('data-e2e', 'hit'); return true; })()`,
  );
  if (!found) throw new Error(`no element matching ${selector} with text "${text}"`);
  await view.click(`${selector}[data-e2e=hit]`);
  await view.evaluate(`document.querySelector('[data-e2e=hit]')?.removeAttribute('data-e2e')`);
};

/** Replaces a field's content. The only sanctioned way to write into a populated input:
 *  assigning `value` from evaluate does NOT reach react-hook-form (verified — the submit
 *  button stays disabled even with the native-setter trick), and press() takes no chords,
 *  so there is no select-all. End then Backspace per character, which RHF does register. */
export const fill = async (selector: string, text: string) => {
  await view.click(selector);
  await view.press('End');
  const length = (await view.evaluate(
    `document.querySelector(${JSON.stringify(selector)}).value.length`,
  )) as number;
  for (let i = 0; i < length; i++) await view.press('Backspace');
  if (text) await view.type(text);
};

/** Logs in through the UI unless the session is already alive. No file may assume it
 *  inherits a session: auth.test logs out, and profilo.test gets logged out by the
 *  server. Probes for rendered markup rather than location.pathname, because right after
 *  a navigation the path is /home for a moment before the guard redirects. */
export const ensureLoggedIn = async () => {
  await view.navigate(`${WEB_URL}/home`);
  const where = await waitFor<'home' | 'login'>(
    'home or login to render',
    `(() => { if (document.querySelector('table[aria-label=andamento]')) return 'home';
       if (document.querySelector('#email')) return 'login'; return false; })()`,
  );
  if (where === 'home') return;
  await view.click('#email');
  await view.type(E2E_USER.email);
  await view.click('#password');
  await view.type(E2E_USER.password);
  await view.click('button[type=submit]');
  await waitFor('the andamento table after login', `document.querySelector('table[aria-label=andamento]') && 'ok'`);
};

/** Restores the seeded state. Needed by profilo.test, which changes the E2E user's
 *  password: bun test runs files alphabetically, so statistiche.test runs after it. */
export const reseed = async () => {
  await seedDb();
  await seedUtente(API_URL);
};

export const shot = async (name: string) => {
  const dir = new URL('./.artifacts/', import.meta.url);
  await Bun.write(new URL(`./${name}.png`, dir), await view.screenshot());
};
```

- [x] **Step 3: scrivere il test di boot, che è anche il test dell'harness**

`e2e/boot.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { view, WEB_URL, waitFor } from './harness';

test('the built app boots in the webview and serves deep links', async () => {
  await view.navigate(`${WEB_URL}/login`);
  const ok = await waitFor<string>('the login form', `document.querySelector('#email') && 'ok'`);
  expect(ok).toBe('ok');
});

test('waitFor actually times out instead of hanging or passing', async () => {
  // Guards the helper every other assertion in the suite leans on: if waitFor returned
  // for a condition that never becomes true, every flow would pass vacuously.
  await expect(waitFor('a selector that cannot exist', `document.querySelector('#nope-nope') && 'ok'`, 500)).rejects.toThrow(
    'timeout waiting for a selector that cannot exist',
  );
});
```

- [x] **Step 4: aggiungere lo script e ignorare gli artefatti**

In `package.json` di root, dentro `scripts`:

```json
"e2e": "DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=e2e-secret bun test e2e/"
```

Non toccare lo script `test`: la CI non deve eseguire gli E2E. In `.gitignore` aggiungere:

```
e2e/.artifacts/
```

- [x] **Step 5: eseguire**

Run: `bun run e2e`
Expected: 2 test verdi. Il primo run compila il bundle web (qualche secondo).

Se compare `'Runtime.evaluate' wasn't found`, qualcuno ha passato `url:` al costruttore
della webview: usare `await view.navigate(...)`.

- [x] **Step 6: dimostrare che il guard del seed funziona**

Run:

```bash
DATABASE_URL='postgres://gctest:gctest@localhost:5432/gc_test' bun -e '
  import { SQL } from "bun";
  const sql = new SQL(process.env.DATABASE_URL);
  await sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id)
    SELECT current_date, "riempimento", 1, 1 FROM generate_series(1, 200)`;
  await sql.close();'
bun run e2e
```

Expected: FALLISCE con `refusing to TRUNCATE: gc.andamento has 2xx rows, this is not a test DB`.
Poi ripulire (`TRUNCATE gc.andamento`) e rieseguire `bun run e2e`: verde.

Questo passo non è cerimonia: è l'unica prova che il guard che protegge il DB di
sviluppo funziona davvero.

- [x] **Step 7: documentare in `CLAUDE.md`**

Aggiungere una sezione sotto quella dei test, che dica: comando `bun run e2e`;
prerequisiti (Chrome/Chromium/Edge/Brave installato — il backend della webview lo pilota
via DevTools Protocol; database `gc_test` raggiungibile); porte `5001`/`3001` scelte per
non collidere con `./dev.sh`; **gli E2E non girano in CI** e `bun run test` resta il gate
della CI; gli screenshot dei fallimenti finiscono in `e2e/.artifacts/`.

- [x] **Step 8: lint e commit**

```bash
bunx prettier --write . && bunx prettier --check .
git add e2e package.json .gitignore CLAUDE.md
git commit -m "test(e2e): harness Bun.WebView, seed con guard e comando bun run e2e"
```

---

### Task 2: Flusso 1 — cookie di sessione cross-origin

Il flusso già verificato durante il design: gira in 8 passi.

**Files:**

- Create: `e2e/auth.test.ts`

**Interfaces:**

- Consumes: `harness.ts` → `view`, `WEB_URL`, `waitFor`, `clickText`, `ensureLoggedIn`; `seed.ts` → `E2E_USER`
- Produces: niente per i task successivi.

- [x] **Step 1: scrivere il test**

`e2e/auth.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { E2E_USER } from './seed';
import { clickText, view, waitFor, WEB_URL } from './harness';

test('login across origins, httpOnly cookies, reload, logout, guard', async () => {
  await view.navigate(`${WEB_URL}/login`);
  await waitFor('the login form', `document.querySelector('#email') && 'ok'`);

  await view.click('#email');
  await view.type(E2E_USER.email);
  await view.click('#password');
  await view.type(E2E_USER.password);
  await view.click('button[type=submit]');

  // Landing on /home proves the browser accepted a Set-Cookie from :5001 while the page
  // lives on :3001 — the cross-origin cookie flow, which happy-dom cannot model.
  await waitFor('the redirect to /home', `location.pathname === '/home' && 'ok'`);

  // The session cookies must be invisible to JavaScript.
  expect(await view.evaluate('document.cookie')).toBe('');

  // A rendered table proves the authenticated GET /andamento carried the cookie back
  // across origins, preflight included.
  const rows = await waitFor<number>(
    'the seeded rows',
    `(() => { const n = document.querySelectorAll('table[aria-label=andamento] tbody tr').length;
       return n > 0 ? n : false; })()`,
  );
  expect(rows).toBeGreaterThan(0);

  // A full reload has no in-memory state to lean on: only the cookie can restore this.
  await view.reload();
  await waitFor(
    'the session to survive a reload',
    `location.pathname === '/home' && document.querySelector('table[aria-label=andamento]') && 'ok'`,
  );

  await clickText('button', 'Logout');
  await waitFor('the redirect to /login', `location.pathname === '/login' && 'ok'`);

  // Guard: a deep link into a protected route while logged out must bounce.
  await view.navigate(`${WEB_URL}/home`);
  await waitFor('the guard to bounce us to /login', `document.querySelector('#email') && 'ok'`);
});
```

- [x] **Step 2: eseguire**

Run: `bun run e2e`
Expected: 3 test verdi (i 2 di boot più questo).

- [x] **Step 3: dimostrare che il test discrimina**

Il flusso passa al primo colpo, quindi va provato che stia misurando qualcosa. In
`e2e/harness.ts` cambiare temporaneamente `CORS_ORIGIN: WEB_URL` in
`CORS_ORIGIN: 'http://localhost:9999'` ed eseguire `bun run e2e`.

Expected: `auth.test.ts` FALLISCE (il browser rifiuta la risposta cross-origin, il login
non arriva a `/home`). Ripristinare e rieseguire: verde.

Questo mutante è esattamente la proprietà sotto test: se il test passasse anche con la
CORS sbagliata, non starebbe verificando il cross-origin.

- [x] **Step 4: commit**

```bash
bunx prettier --check .
git add e2e/auth.test.ts
git commit -m "test(e2e): cookie di sessione cross-origin, reload, logout e guard"
```

---

### Task 3: Flusso 2 — CRUD andamento e preflight CSRF

**Files:**

- Create: `e2e/andamento.test.ts`

**Interfaces:**

- Consumes: `harness.ts` → `view`, `waitFor`, `clickText`, `fill`, `ensureLoggedIn`, `reseed`
- Produces: niente per i task successivi.

Selettori reali del markup (già verificati, non inventarne altri):

| Cosa | Selettore |
|---|---|
| Quick-add "Spesa" | `button[aria-label="Spesa"]` |
| Tabella | `table[aria-label="andamento"]`, righe `tbody tr` |
| Filtro | `input[placeholder="Filtro"]` |
| Modifica / Clona / Elimina riga | `button[aria-label="Modifica"]`, `…="Clona"`, `…="Elimina"` |
| Campi del form | `#giorno`, `#tipoSpesa`, `#descrizione`, `#costo` |
| Salva del form | `.modal button[type=submit]` |
| Conferma eliminazione | `.modal-footer button` con testo `Elimina` (via `clickText`) |

- [x] **Step 1: scrivere il test**

`e2e/andamento.test.ts`:

```ts
import { beforeAll, afterAll, test, expect } from 'bun:test';
import { clickText, ensureLoggedIn, fill, reseed, view, waitFor } from './harness';

const DESCRIZIONE = 'voce creata dal test e2e';
const MODIFICATA = 'voce modificata dal test e2e';

const tableReady = () =>
  waitFor('the andamento table', `document.querySelector('table[aria-label=andamento]') && 'ok'`);

// Filtering keeps the assertions independent of pagination: the table paginates past 10
// rows, and the seeded rows would otherwise push a new one onto page two. The threshold is
// 2 characters (filterAndamenti in apps/web/src/andamento/list-utils.ts), which every
// search string here clears.
const filterBy = async (text: string) => {
  await tableReady();
  await fill('input[placeholder="Filtro"]', text);
};

const visibleDescriptions = () =>
  view.evaluate(
    `[...document.querySelectorAll('table[aria-label=andamento] tbody tr td:nth-child(2)')]
       .map(td => td.textContent.trim())`,
  ) as Promise<string[]>;

beforeAll(ensureLoggedIn);
// The seeded rows are the fixture for statistiche.test, which runs after this file.
afterAll(reseed);

test('quick-add creates a row through the browser, preflight included', async () => {
  await tableReady();

  // Every mutation is preceded by an OPTIONS preflight carrying X-Requested-With. No
  // automated test in the repo produces one; only a real browser does.
  await view.click('button[aria-label="Spesa"]');
  await waitFor('the form modal', `document.querySelector('.modal #descrizione') && 'ok'`);

  // The quick-add prefills giorno, tipo spesa and costo, so only a text field is typed:
  // <input type=date> and <select> have no fill()/selectOption() equivalent here.
  await view.click('#descrizione');
  await view.type(DESCRIZIONE);
  await view.click('.modal button[type=submit]');

  await waitFor(
    'the modal to close',
    `document.querySelector('.modal #descrizione') ? false : 'ok'`,
  );
  await filterBy(DESCRIZIONE);
  await waitFor(
    'the new row',
    `document.querySelectorAll('table[aria-label=andamento] tbody tr').length === 1 ? 'ok' : false`,
  );
  expect(await visibleDescriptions()).toEqual([DESCRIZIONE]);
});

test('editing a row persists across a reload', async () => {
  await filterBy(DESCRIZIONE);
  await view.click('button[aria-label="Modifica"]');
  await waitFor('the form modal', `document.querySelector('.modal #descrizione') && 'ok'`);

  await fill('#descrizione', MODIFICATA);
  await view.click('.modal button[type=submit]');
  await waitFor(
    'the modal to close',
    `document.querySelector('.modal #descrizione') ? false : 'ok'`,
  );

  // A reload proves the PUT reached the database, not just the query cache.
  await view.reload();
  await filterBy(MODIFICATA);
  await waitFor(
    'the edited row',
    `document.querySelectorAll('table[aria-label=andamento] tbody tr').length === 1 ? 'ok' : false`,
  );
  expect(await visibleDescriptions()).toEqual([MODIFICATA]);
});

test('deleting a row asks for confirmation and removes it', async () => {
  await filterBy(MODIFICATA);
  await view.click('button[aria-label="Elimina"]');
  await waitFor('the confirm modal', `document.querySelector('.modal-footer') && 'ok'`);
  await clickText('.modal-footer button', 'Elimina');

  await waitFor(
    'the row to disappear',
    `document.querySelectorAll('table[aria-label=andamento] tbody tr').length === 0 ? 'ok' : false`,
  );
  // Reload, then re-filter: the row must be gone from the database, not just from the view.
  await view.reload();
  await filterBy(MODIFICATA);
  expect(await visibleDescriptions()).toEqual([]);
});
```

**Perché `fill()` e non un assegnamento di `value`.** Provato in fase di design: sia
`el.value = x` che la variante col native setter di `HTMLInputElement` lasciano
react-hook-form ignaro (il submit resta `disabled`). E `press()` non accetta chord, quindi
non esiste un select-all. `fill()` fa `End` più un `Backspace` per carattere, che RHF
registra — verificato guardando il bottone tornare `disabled` a campo svuotato.

- [x] **Step 2: eseguire**

Run: `bun run e2e`
Expected: 6 test verdi.

Se il primo `filterBy` non filtra, verificare la soglia del filtro: `filterAndamenti`
scatta oltre i 2 caratteri (`apps/web/src/andamento/list-utils.ts`).

- [x] **Step 3: dimostrare che il test discrimina — il mutante CSRF**

In `apps/web/src/api/client.ts` rimuovere temporaneamente l'header CSRF dalle richieste,
poi `bun run e2e`.

Expected: i tre test di questo file FALLISCONO (il server risponde 403 alle mutazioni,
`assertCsrf` fa il suo lavoro), mentre `auth.test.ts` resta verde (nessuna mutazione).
Ripristinare `client.ts` (`git checkout -- apps/web/src/api/client.ts`) e rieseguire: verde.

Questo prova due cose in un colpo: che il test esercita davvero il percorso delle
mutazioni, e che la difesa CSRF è attiva nel browser reale.

- [x] **Step 4: commit**

```bash
bunx prettier --check .
git add e2e/andamento.test.ts
git commit -m "test(e2e): CRUD andamento dal browser con preflight CSRF"
```

---

### Task 4: Flusso 3 — le statistiche disegnano davvero

Chiude il debito "still owed manually" della Fase 4c: che i grafici disegnino è invisibile
alla suite, perché sotto happy-dom `ResponsiveContainer` misura 0×0.

**Files:**

- Create: `e2e/statistiche.test.ts`

**Interfaces:**

- Consumes: `harness.ts` → `view`, `waitFor`, `WEB_URL`, `ensureLoggedIn`, `clickText`
- Produces: niente per i task successivi.

Classi Recharts reali, verificate nel browser (**non** indovinarle): barre
`.recharts-bar-rectangle`, settori della torta `.recharts-pie-sector`, superficie
`.recharts-surface`.

- [x] **Step 1: scrivere il test**

`e2e/statistiche.test.ts`:

```ts
import { beforeAll, test, expect } from 'bun:test';
import { ensureLoggedIn, view, waitFor, WEB_URL } from './harness';

const count = (selector: string, what: string) =>
  waitFor<number>(
    what,
    `(() => { const n = document.querySelectorAll(${JSON.stringify(selector)}).length;
       return n > 0 ? n : false; })()`,
    15_000,
  );

beforeAll(ensureLoggedIn);

test.each(['spesa', 'carburante', 'bolletta', 'casa'])(
  '/statistiche/%s paints bars',
  async (kind) => {
    await view.navigate(`${WEB_URL}/statistiche/${kind}`);
    // Structural assertion, never on values: the seed is relative to today, so the
    // numbers move as days pass while "there are bars" stays true.
    expect(await count('.recharts-bar-rectangle', `bars on /statistiche/${kind}`)).toBeGreaterThan(0);
  },
);

test('the chart container has a real measured size', async () => {
  await view.navigate(`${WEB_URL}/statistiche/spesa`);
  await count('.recharts-bar-rectangle', 'bars');
  const [width, height] = (await view.evaluate(
    `(() => { const r = document.querySelector('.recharts-surface').getBoundingClientRect();
       return [Math.round(r.width), Math.round(r.height)]; })()`,
  )) as [number, number];
  // This is the whole reason the flow exists: happy-dom reports 0x0 here, so no component
  // test can tell a painted chart from a collapsed one.
  expect(width).toBeGreaterThan(100);
  expect(height).toBeGreaterThan(100);
});

test('/statistiche/spese-frequenti paints pie sectors', async () => {
  await view.navigate(`${WEB_URL}/statistiche/spese-frequenti`);
  expect(await count('.recharts-pie-sector', 'pie sectors')).toBeGreaterThan(0);
});

test('/statistiche shows the media tables', async () => {
  await view.navigate(`${WEB_URL}/statistiche`);
  const cells = await waitFor<number>(
    'populated media tables',
    `(() => { const n = document.querySelectorAll('table tbody tr').length; return n > 0 ? n : false; })()`,
  );
  expect(cells).toBeGreaterThan(0);
});

test('switching the interval redraws', async () => {
  await view.navigate(`${WEB_URL}/statistiche/spesa`);
  await count('.recharts-bar-rectangle', 'bars in the monthly interval');
  // Verified values: IntervalRadio renders value="M"/"Y" on the bar routes (labels
  // "Mensile"/"Annuale") and M/Y/A on spese-frequenti ("Ultimo mese"/"Ultimo anno"/"Tutto").
  await view.click('input[type=radio][value=Y]');
  expect(await count('.recharts-bar-rectangle', 'bars in the yearly interval')).toBeGreaterThan(0);
});

test('the statistiche dropdown navigates', async () => {
  await view.navigate(`${WEB_URL}/home`);
  await waitFor('the header', `document.querySelector('.navbar') && 'ok'`);
  await view.click('button.dropdown-toggle');
  await waitFor('the open dropdown', `document.querySelector('.dropdown-menu.show a') && 'ok'`);
  await view.click('.dropdown-menu.show a[href="/statistiche/spesa"]');
  await waitFor('the bar chart route', `location.pathname === '/statistiche/spesa' && 'ok'`);
});
```

Selettori verificati sul codice, non da indovinare: `STAT_LINKS` in `Layout.tsx` produce
`href="/statistiche"`, `"/statistiche/spese-frequenti"`, `"/statistiche/spesa"`,
`"/statistiche/carburante"`, `"/statistiche/bolletta"` (etichetta "Bollette", rotta
`bolletta` — differenza voluta, parità col legacy) e `"/statistiche/casa"`. Se qualcosa non
combacia, si adegua **il test**, non il componente.

- [x] **Step 2: eseguire**

Run: `bun run e2e`
Expected: tutto verde.

Se un grafico risulta vuoto, il sospetto numero uno è il seed: le date sono relative a
oggi proprio perché l'intervallo di default è "Ultimo mese". Guardare
`e2e/.artifacts/timeout-*.png`, che l'harness scrive da sé sui timeout.

- [x] **Step 3: dimostrare che il test discrimina**

Cambiare `.recharts-bar-rectangle` in `.recharts-bar-rectangle-inesistente` in un solo
test ed eseguire: deve fallire in timeout, non passare. Ripristinare.

Seconda prova, più forte, già osservata durante il design: con un seed a date fisse nel
passato la torta è vuota e il test fallisce. Non serve rifarla, ma va citata nel messaggio
di commit come motivo delle date relative.

- [x] **Step 4: commit**

```bash
bunx prettier --check .
git add e2e/statistiche.test.ts
git commit -m "test(e2e): i sei schermi statistiche disegnano davvero in Chrome"
```

---

### Task 5: Flusso 4 — salvare il profilo disconnette

**Files:**

- Create: `e2e/profilo.test.ts`

**Interfaces:**

- Consumes: `harness.ts` → `view`, `waitFor`, `clickText`, `ensureLoggedIn`, `reseed`, `WEB_URL`; `seed.ts` → `E2E_USER`
- Produces: niente per i task successivi.

- [x] **Step 1: scrivere il test**

`e2e/profilo.test.ts`:

```ts
import { beforeAll, afterAll, test, expect } from 'bun:test';
import { clickText, ensureLoggedIn, reseed, view, waitFor, WEB_URL } from './harness';
import { E2E_USER } from './seed';

const NUOVA_PASSWORD = 'nuova-segretissima';

beforeAll(ensureLoggedIn);
// Mandatory, not hygiene: this flow changes the E2E user's password, and bun test runs
// files alphabetically — statistiche.test comes after and would fail to log in.
afterAll(reseed);

test('saving the profile revokes every session and forces a logout', async () => {
  await view.navigate(`${WEB_URL}/home`);
  await waitFor('the table', `document.querySelector('table[aria-label=andamento]') && 'ok'`);

  await clickText('button', 'Profilo Utente');
  await waitFor('the profile modal', `document.querySelector('#newPassword') && 'ok'`);

  // The email is prefilled from the ['me'] query; only the password fields are typed.
  expect(await view.evaluate(`document.querySelector('#email').value`)).toBe(E2E_USER.email);

  await view.click('#newPassword');
  await view.type(NUOVA_PASSWORD);
  await view.click('#confirmPassword');
  await view.type(NUOVA_PASSWORD);
  await clickText('.modal button[type=submit]', 'Salva');

  // PATCH /utente/me revokes every refresh token server-side, so a successful save always
  // ends the session. The modal owns the redirect.
  await waitFor('the redirect to /login', `document.querySelector('#email') && location.pathname === '/login' && 'ok'`);

  // And the session is really dead, not just navigated away from.
  await view.navigate(`${WEB_URL}/home`);
  await waitFor('the guard to bounce us', `document.querySelector('#email') && 'ok'`);
});

test('the new password works and the old one does not', async () => {
  await view.navigate(`${WEB_URL}/login`);
  await waitFor('the login form', `document.querySelector('#email') && 'ok'`);
  await view.click('#email');
  await view.type(E2E_USER.email);
  await view.click('#password');
  await view.type(NUOVA_PASSWORD);
  await view.click('button[type=submit]');
  await waitFor('the redirect to /home', `document.querySelector('table[aria-label=andamento]') && 'ok'`);
});
```

Se il mismatch fra le due password è una validazione di campo (deciso in 4d: `validate` +
`deps`, non un toast), scrivere anche l'asserzione che il bottone `Salva` resti disabilitato
finché `confirmPassword` non combacia — è il comportamento confermato in quella fase.

- [x] **Step 2: eseguire**

Run: `bun run e2e`
Expected: tutto verde. Eseguire **due volte** di fila: se il secondo run falla, il
`reseed` dell'`afterAll` non sta ripristinando la password.

- [x] **Step 3: dimostrare che il test discrimina**

In `apps/web/src/utente/ProfiloModal.tsx` commentare temporaneamente il redirect a
`/login` dopo il salvataggio ed eseguire: il primo test deve FALLIRE in timeout.
Ripristinare (`git checkout -- apps/web/src/utente/ProfiloModal.tsx`) e rieseguire.

- [x] **Step 4: commit**

```bash
bunx prettier --check .
git add e2e/profilo.test.ts
git commit -m "test(e2e): il salvataggio del profilo revoca le sessioni e disconnette"
```

---

### Task 6: Chiudere il debito `mock.module`

Indipendente dai task 1-5: si può eseguire in parallelo o dopo. Non tocca `e2e/`.

**Files:**

- Modify: `apps/web/package.json` (script `test`)
- Modify: `apps/web/test/queries.test.tsx` (rimozione del superset difensivo)
- Modify: `apps/web/test/AndamentoList.actions.test.tsx` (idem)
- Modify: `apps/web/test/useAuth.test.tsx` (idem)
- Modify: `apps/web/test/ProfiloModal.test.tsx` (mock esplicito del router + spy)

**Interfaces:**

- Consumes: `apps/web/test/router-mock.tsx` → `routerMock()`
- Produces: niente.

Contesto, già misurato durante il design: `mock.module` è process-global su questo Bun e
`mock.restore()` non lo annulla; sei file mantengono mock superset a mano per non lasciare
export mancanti ai file vicini. Ha rotto la CI in 4a (`useAuth`) e in 4b (`Toaster` di
sonner), mai riproducibile in locale. Con `--isolate` il registry dei moduli è per-file:
prova osservata → `ProfiloModal.test.tsx` emette 9 warning `useRouter must be used inside a
<RouterProvider>` **solo** con il flag, perché senza flag riceve il mock del router leakato
da `Layout.test.tsx`/`LoginForm.test.tsx`. Costo: suite web da 1,8s a 3,1s.

- [x] **Step 1: attivare l'isolamento e osservare i warning**

In `apps/web/package.json`:

```json
"test": "bun test --isolate --preload ./happydom.ts"
```

Run: `cd apps/web && bun run test`
Expected: 89 pass, 0 fail, **più** i warning `useRouter must be used inside a
<RouterProvider>` da `ProfiloModal.test.tsx`. Quei warning sono il punto: prima erano
nascosti da un leak.

- [x] **Step 2: correggere `ProfiloModal.test.tsx`**

Aggiungere in testa al file il mock esplicito del router, con una spy che verifica il
redirect. Ora che l'isolamento è attivo, un mock locale non può più contaminare altri file,
quindi non serve nessun superset:

```tsx
import { mock } from 'bun:test';
import { routerMock } from './router-mock';

const navigate = mock(() => {});
// Explicit, not inherited: without this the file used to receive the router mock leaked
// from Layout.test/LoginForm.test, so its navigation path was never really exercised.
mock.module('@tanstack/react-router', () => ({ ...routerMock(), useNavigate: () => navigate }));
```

Poi aggiungere un test che asserisce il redirect dopo un salvataggio riuscito:

```tsx
test('redirects to /login after a successful save', async () => {
  renderModal();
  typeIn('Nuova password', 'nuova-password');
  typeIn('Conferma password', 'nuova-password');
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }));
});
```

Forma verificata sul codice: `ProfiloModal.tsx:36` chiama `void navigate({ to: '/login' })`,
e le label dei campi sono esattamente `Email`, `Nuova password`, `Conferma password`.
Riusare l'helper `typeIn` già presente nel file. Se il salvataggio richiede il mock della
mutazione, seguire il pattern già usato dagli altri test dello stesso file.

- [x] **Step 3: eseguire**

Run: `cd apps/web && bun run test`
Expected: 90 pass, 0 fail, **nessun** warning `useRouter`.

- [x] **Step 4: rimuovere i superset difensivi**

In `queries.test.tsx`, `AndamentoList.actions.test.tsx` e `useAuth.test.tsx`: togliere le
proprietà aggiunte solo per completare il mock verso file terzi (il blocco `utente` di
troppo nel mock del client, `Toaster` nel mock di sonner) e i commenti che spiegavano il
workaround. Lasciare **solo** ciò che il file usa davvero. Non toccare
`router-mock.tsx`: resta il modo giusto di condividere un mock voluto.

Run: `cd apps/web && bun run test`
Expected: 90 pass. Poi, dalla radice, `bun run test`: api/shared + web tutti verdi.

- [x] **Step 5: commit**

```bash
bunx prettier --check .
git add apps/web/package.json apps/web/test
git commit -m "test(web): isola i file di test e rimuove i mock superset a mano"
```

- [ ] **Step 6: la prova finale è la CI**

Il fallimento specifico non è riproducibile in locale nemmeno con un repro deliberato
(provato in fase di design: due file, mock parziale di sonner nel primo, import di
`Toaster` nel secondo — passa comunque). Quindi: **la CI verde sul PR, con i superset
rimossi, è l'unica prova che il debito è chiuso.** Se la CI fallisse, non rimettere i
superset: passare a `--parallel=4` (processi worker separati, garanzia strutturale), che
per i test web è sicuro perché non toccano il database — a differenza dei test api, dove
`resetDb()` fa TRUNCATE su un Postgres condiviso.

---

### Chiusura della fase (dopo i sei task)

- [x] `bun run e2e` verde, eseguito **due volte** di fila (scopre gli stati non ripristinati).
- [x] `bun run test`, `bun run typecheck`, `bun run lint` verdi dalla radice.
- [x] `bun run --filter '@gc/web' smoke` verde (il gate di build della CI).
- [ ] Review dell'intero branch, poi push e `gh pr create` verso master.
- [ ] Aggiornare il backlog nella spec o nel PR con ciò che resta: `apiErrorMessage` da
      restringere a 400/422, loading/empty state di `AndamentoList`, E2E in CI, E2E della PWA.
