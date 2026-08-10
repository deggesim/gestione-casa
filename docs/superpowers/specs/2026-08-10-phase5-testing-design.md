# Fase 5 — Testing: E2E su browser reale + chiusura del debito di test

**Data:** 2026-08-10
**Stato:** design approvato, pronto per il piano di implementazione
**Branch previsto:** `feat/phase5-testing` (da `master` @ `405503b`)

Penultima fase della migrazione. La 0–4 hanno portato backend e frontend a parità di
contratto e di schermate; restano due buchi che nessun test attuale può vedere, e un
debito di qualità dei test che ha già rotto la CI due volte.

---

## 1. Obiettivo e scope

Due blocchi indipendenti:

1. **Suite E2E su browser reale** — 4 flussi, guidati da `Bun.WebView` (Chrome via
   DevTools Protocol), che verificano solo ciò che i 37 file di test esistenti **non
   possono** verificare per costruzione.
2. **Chiusura del debito di test-quality** — i mock `mock.module` mantenuti a mano,
   process-global su questo Bun, che hanno rotto la CI in 4a e in 4b e non sono mai
   riproducibili in locale.

### Cosa i test attuali non possono vedere

Il punto di partenza non è "manca copertura", è "tre cose sono strutturalmente invisibili
alla suite":

| Buco | Perché è invisibile |
|---|---|
| Cookie di sessione cross-origin | happy-dom non ha uno store di cookie con semantica `SameSite`/`httpOnly`, e non esegue il preflight CORS. La verifica di 4a è stata uno smoke `curl` a mano. |
| Preflight CSRF sulle mutazioni | Il browser manda `OPTIONS` con `X-Requested-With` prima di POST/PUT/DELETE. Nessun test automatico lo produce; in 4b è stato verificato a mano. |
| Rendering di Recharts | `ResponsiveContainer` misura il contenitore: sotto happy-dom è 0×0, quindi non disegna nulla. **Misurato: in Chrome reale lo stesso contenitore è 1241×1509.** È il debito "still owed manually" della 4c. |

A questi si aggiunge il comportamento più controintuitivo dell'app — salvare il profilo
revoca ogni refresh token e **disconnette** l'utente (4d) — verificabile solo end-to-end.

### Fuori scope (deciso esplicitamente)

- **E2E in CI.** La suite gira in locale. La CI resta lint + typecheck + `bun run test` +
  build/smoke.
- **`apiErrorMessage`: override del body su ogni status** (`apps/web/src/query/api-error.ts`,
  restringere a 400/422) e **loading/empty state di `AndamentoList`**. Sono gap reali ma
  non sono testing: restano nel backlog, da chiudere in un PR proprio.
- **E2E della PWA / service worker.** Già verificato a mano in 4d in un browser reale
  (register, cache, boot offline, handshake di aggiornamento). Gli E2E girano con
  `PUBLIC_ENABLE_SW=false`.
- **Parità visiva / visual regression** e asserzioni a livello di rete sul preflight (si
  verifica per effetto: la mutazione va a buon fine).
- **Rotazione dei refresh token / recupero 401 concorrenti.** Coperti dai test unit e dal
  fix di PR #8.

---

## 2. Scelta dello strumento: `Bun.WebView`, non Playwright

Decisione presa **dopo tre spike eseguiti**, non su preferenza. Le prove:

| Verifica | Esito |
|---|---|
| `Bun.WebView` esiste in Bun 1.3.14, la versione pinnata in CI | ✅ backend Chrome reale (`/usr/bin/google-chrome` 143) |
| `type()` produce eventi che react-hook-form vede | ✅ il bottone submit passa da `disabled` a abilitato, valori corretti nei campi |
| Flusso 1 completo (login cross-origin, cookie httpOnly, GET autenticata, reload, logout, guard) | ✅ 8 passi su 8 |
| Recharts dipinge | ✅ 5 `recharts-bar-rectangle`, 4 `recharts-pie-sector` |
| Screenshot per il debug dei fallimenti | ✅ PNG |

**Perché la webview e non Playwright.** Zero dipendenze nuove e nessun runner Node in un
monorepo Bun: gli E2E diventano file `bun test`, quindi possono importare direttamente il
codice Bun-only del repo (con Playwright il seed andrebbe lanciato come sottoprocesso, dato
che `apps/api/src/db/client.ts` usa `drizzle-orm/bun-sql`). Il browser è comunque Chrome,
quindi cookie, `SameSite` e CORS hanno la semantica di produzione.

**Cosa costa, dichiarato.** Circa 45 righe di harness da mantenere: avvio dei due server con
attesa di readiness, `waitFor(condizione)` al posto delle asserzioni auto-retry, e
`clickText()` perché `click()` accetta **solo selettori CSS** — non esiste `getByRole`/`text=`
e il bottone Logout non ha né `id` né `aria-label`. Niente trace viewer, video, retry
automatici né report HTML: il debug è screenshot più console. L'API è dichiarata
sperimentale ("may change in future releases"), mitigato dal fatto che Bun è pinnato in CI e
l'harness è piccolo.

**Trigger di migrazione a Playwright**, da annotare come commento `ponytail:` in
`harness.ts`: se la suite diventa flaky, se serve debug su trace, o se cresce oltre una
decina di flussi. Le asserzioni sono già espresse su selettori CSS e condizioni DOM, quindi
la conversione è meccanica.

**Footgun trovato negli spike, da annotare:** passare `url:` al costruttore e valutare
subito solleva `'Runtime.evaluate' wasn't found`, un errore CDP che non dice nulla. Serve
sempre `await view.navigate(url)` esplicito.

---

## 3. Ambiente E2E

### 3.1 Porte, database, server

Porte dedicate, così `./dev.sh` può restare attivo in parallelo:

Porte dedicate: api su `5001`, web su `3001`. **Entrambi i server girano nel processo di
test**, non come figli:

| | come | env |
|---|---|---|
| api | `buildApp().listen(5001)` importato da `apps/api/src/app.ts` | `CORS_ORIGIN=http://localhost:3001` dallo script `e2e` |
| web | `bun run build` (figlio, `cwd=apps/web`) poi `Bun.serve` con `createHandler(dist)` | `PUBLIC_API_URL=http://localhost:5001`, `PUBLIC_ENABLE_SW=false` |

**Perché in-process e non un figlio** — correzione fatta in implementazione, dopo un
guasto reale. `process.on('exit')` **non scatta** sotto `bun test` (verificato: l'handler non
stampa e il figlio sopravvive), quindi un'api spawnata resta viva dopo la suite; e poiché su
Linux Bun imposta `SO_REUSEPORT`, il server della corsa successiva **si affianca** a quello
vecchio sulla stessa porta invece di fallire, e le richieste si distribuiscono fra i due. Il
sintomo osservato: cinque api su `:5001`, alcune con la `CORS_ORIGIN` di un mutante, e il
flusso di login che falliva a configurazione già ripristinata. Servendo in-process la vita
dei server coincide con quella del processo di test, che `bun test` chiude comunque. Si
rinuncia a `index.ts` (due righe) e al caricamento di `apps/api/.env`.

Restano tre guard, tutte verificate facendole scattare:

- **Porte occupate** → l'harness rifiuta di partire (`assertPortFree`), perché con
  `SO_REUSEPORT` un server di troppo è invisibile e avvelena la corsa in silenzio.
- **`CORS_ORIGIN` assente o `*`** → rifiuta di partire. `env.ts` fuori da produzione ripiega
  su `'*'`, e con `'*'` il flusso cross-origin passerebbe qualunque cosa faccia il browser:
  l'asserzione non asserirebbe niente. La presenza è imposta dall'harness, il valore lo
  giudica il test — è ciò che rende sensato il mutante CORS.
- **`gc.andamento` oltre 100 righe** → rifiuta di fare `TRUNCATE` (§3.2).

La sicurezza del database non poggia più sulla precedenza `process.env` sui file `.env`: la
suite gira dalla radice, che **non ha** `.env`, quindi `DATABASE_URL` può arrivare solo dallo
script `e2e`. Nessun `.env` locale viene modificato o spostato.

Il web gira sull'**artefatto buildato** servito da `serve.ts`, non sul dev server: è ciò che
spedirà la Fase 6, ha il fallback SPA reale sui deep link, e il dev server risponde
200-con-HTML a qualsiasi path sconosciuto.

### 3.2 Seed e guard anti-incidente

Lo schema viene creato dal preload già configurato in `bunfig.toml`
(`[test] preload = ["./apps/api/test/setup.ts"]`, DDL idempotente `CREATE … IF NOT EXISTS`):
girando `bun test e2e/` dalla radice con `DATABASE_URL` impostata, `gc_test` è pronto senza
codice nuovo.

`e2e/seed.ts` espone **due funzioni**, perché una delle due ha bisogno dell'API già in piedi:

`seedDb()` — solo SQL, via **`Bun.SQL` diretto** (nessun client in più), eseguito *prima* di
avviare i server:

1. **Guard:** conta `gc.andamento` e **rifiuta di procedere sopra le 100 righe** —
   "questo non sembra un database di test". Funziona a DB vuoto (CI) e blocca il DB di dev
   (7528 righe). Chiude la ricorrenza dell'incidente di 4b, in cui un runner di test ha
   fatto TRUNCATE del DB di sviluppo.
2. `TRUNCATE` di `token, andamento, utente, tipo_spesa`.
3. `tipo_spesa` con gli id accoppiati alle statistiche: `1 spesa`, `2 carburante`,
   `3 bolletta`, `7 casa`.
4. ~11 righe `andamento` con **date relative a oggi**.

`seedUtente(apiUrl)` — registra l'utente E2E via `POST /utente`, quindi **dopo** il boot
dell'API: l'endpoint è pubblico e così l'hash della password lo produce l'app, non il seed.
Va con la sua richiesta l'header `X-Requested-With` (la POST è una mutazione).

**Le date relative non sono un dettaglio.** Le schermate statistiche partono su "Ultimo
mese": con date fisse nel passato il grafico è vuoto e l'asserzione non asserisce niente.
È esattamente l'errore che il primo spike ha commesso — torta vuota, screenshot a
conferma. La distribuzione deve coprire: più righe nel mese corrente (per le barre
mensili), descrizioni ripetute (`pane`, `benzina` — la torta raggruppa per descrizione),
tutte e quattro le categorie, e almeno una riga oltre l'anno (per l'intervallo "Ultimo
anno").

### 3.3 Struttura e ciclo di vita

```
e2e/
  harness.ts            boot api+web, waitFor, clickText, ensureLoggedIn, screenshot su fallimento
  seed.ts               guard + TRUNCATE + fixture a date relative
  auth.test.ts          flusso 1
  andamento.test.ts     flusso 2
  statistiche.test.ts   flusso 3
  profilo.test.ts       flusso 4
```

`harness.ts` è un **singleton a livello di modulo**: `bun test e2e/` esegue i file in
sequenza nello stesso processo, quindi seed, server e webview si alzano **una volta sola**
per tutta la suite. Corollario vincolante: lo script E2E **non** deve usare `--isolate`
(darebbe un global fresco per file, e quindi un boot per file). La pulizia è registrata su
`process.on('exit')` — `view.close()`, `web.stop()`, `api.kill()` — perché `bun test` non
ha un `afterAll` globale fra i file.

Nessun file assume di ereditare stato da un altro, perché due flussi lo distruggono:
`auth.test.ts` termina con un logout, e `profilo.test.ts` si fa disconnettere dal server
**cambiando la password** dell'utente E2E. Due conseguenze, entrambe obbligatorie:

- ogni file chiama `ensureLoggedIn()` nel proprio `beforeAll` (verifica se la sessione è
  viva, altrimenti fa login dalla UI);
- `profilo.test.ts` ripristina lo stato nel suo `afterAll` rieseguendo `seedDb()` +
  `seedUtente()`, altrimenti la password originale non esiste più e i file successivi non
  possono autenticarsi. `bun test` ordina i file alfabeticamente, quindi `statistiche` gira
  **dopo** `profilo`: senza quel ripristino la suite fallirebbe in modo dipendente
  dall'ordine, cioè nel modo peggiore.

Script in `package.json` di root:

```
"e2e": "DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=e2e-secret bun test e2e/"
```

`bun run test` resta invariato, così la CI non tocca gli E2E.

---

## 4. I quattro flussi

Ogni flusso asserisce **solo** ciò che è invisibile alla suite unit. Niente doppioni dei
test di componente.

### 4.1 `auth.test.ts` — cookie di sessione attraverso due origini

Già verde nello spike. Login da `:3001` verso `:5001`; atterraggio su `/home`;
`document.cookie` **vuoto** (i cookie di sessione sono `httpOnly`, invisibili a JS); la
tabella `andamento` renderizzata prova che la `GET` autenticata ha portato il cookie
cross-origin; un reload completo mantiene la sessione; logout porta a `/login`; navigare a
`/home` da disconnessi rimbalza su `/login` (guard).

### 4.2 `andamento.test.ts` — CRUD e preflight CSRF

Quick-add "Spesa" → la riga compare in lista; modifica della descrizione → persiste dopo un
reload; eliminazione con conferma → la riga sparisce. Il valore reale è il preflight
`OPTIONS` con `X-Requested-With` su POST/PUT/DELETE emesso dal browser vero.

Il form usa `<input type=date>` e `<select>`, che la webview non sa compilare
dichiarativamente: i prefill del quick-add compilano già data, tipo spesa e costo, quindi i
flussi toccano solo campi di testo. Se un'asserzione dovesse cambiare il `<select>`, si usa
`press()` sulle frecce.

**Vincolo sull'input, misurato in fase di design.** Assegnare `value` da `evaluate` **non
funziona** con questa app: né `el.value = x` né il trucco del native setter di
`HTMLInputElement` fanno registrare il valore a react-hook-form — il bottone di submit
resta `disabled`. Un test che iniettasse valori passerebbe l'asserzione sul DOM mancando
completamente lo stato del form. E `press()` non accetta chord (`press('ctrl+a')` solleva
un errore: solo virtual key names o un singolo carattere), quindi non esiste un select-all.
Un campo già popolato si riscrive con `End` più un `Backspace` per carattere — verificato
guardando il bottone tornare `disabled` a campo svuotato. L'harness lo incapsula in
`fill()`, unico modo ammesso di scrivere in un campo.

### 4.3 `statistiche.test.ts` — i grafici disegnano davvero

Già verde nello spike. Per le 4 rotte a barre: `.recharts-bar-rectangle` presenti; per
`/statistiche/spese-frequenti`: `.recharts-pie-sector` presenti; su `/statistiche`: la
tabella delle medie popolata. Più un cambio di intervallo (M → Y) che ridisegna. Viewport
1280×800, sopra i 992px che abilitano le etichette della torta.

Asserzione strutturale sul numero di elementi, **non** sui valori: i valori dipendono dal
seed a date relative e non devono rendere il test fragile al passare dei giorni.

### 4.4 `profilo.test.ts` — il salvataggio disconnette

Apertura del modal profilo, cambio password, salvataggio → `PATCH /utente/me` revoca ogni
refresh token → toast e redirect a `/login`, e la sessione è **davvero** morta: un reload
di `/home` rimbalza su `/login`. Il ripristino dello stato nell'`afterAll` è obbligatorio,
non igiene: vedi §3.3.

---

## 5. Chiusura del debito `mock.module`

### 5.1 Il problema, e la prova che `--isolate` lo chiude

`mock.module` è process-global su questo Bun e `mock.restore()` non lo annulla. Sei file di
test web mantengono quindi mock **superset** scritti a mano, per non lasciare export
mancanti ai file vicini. Ha rotto la CI due volte (4a via `useAuth`, 4b via il `Toaster` di
sonner), mai riproducibile in locale, e ogni nuovo export su `client.ts` può rompere un file
fratello **solo in CI**.

Bun 1.3.14 ha `--isolate` ("Run each test file in a fresh global object"). Prova ottenuta:
con il flag, `ProfiloModal.test.tsx` emette 9 warning `useRouter must be used inside a
<RouterProvider>` che senza il flag non compaiono. Cioè: quel file oggi riceve il mock del
router **leakato** da `Layout.test.tsx`/`LoginForm.test.tsx`, e con l'isolamento riceve il
router vero. Il registry dei moduli è per-file.

Costo misurato: suite web da **1,8s a 3,1s**. 89/89 verdi in entrambe le modalità.

### 5.2 Interventi

1. `--isolate` nello script `test` di `apps/web`.
2. Cancellazione dei mock superset difensivi e dei commenti che li giustificano in
   `queries.test.tsx`, `AndamentoList.actions.test.tsx`, `useAuth.test.tsx`.
3. **`ProfiloModal.test.tsx`**: mock esplicito del router con una spy, e asserzione che il
   salvataggio navighi a `/login`. Oggi quella parte passa per un incidente di ordinamento
   dei file, non perché sia verificata.
4. Verifica se altri file dipendono da leak analoghi (l'isolamento li rende visibili come
   warning o fallimenti).

**Limite dichiarato:** il fallimento specifico della CI non è riproducibile in locale
nemmeno con un repro deliberato (provato: due file, mock parziale di sonner nel primo,
import di `Toaster` nel secondo — passa comunque). La prova finale è la CI verde sul PR
**con i superset rimossi**.

---

## 6. Rischi

| Rischio | Mitigazione |
|---|---|
| `Bun.WebView` è sperimentale: un upgrade di Bun può rompere l'harness | Bun pinnato a 1.3.14 in `ci.yml`; harness di ~45 righe, riscrivibile; trigger di migrazione a Playwright annotato |
| Flakiness dell'attesa a polling | `waitFor` con timeout esplicito e messaggio che nomina la condizione; screenshot automatico sul fallimento |
| Il seed a date relative cambia comportamento nel tempo | Asserzioni strutturali (elementi presenti), non sui valori |
| Rieseguire gli E2E lascia `gc_test` in uno stato sporco | Il seed fa TRUNCATE all'avvio; il guard sulle 100 righe impedisce di puntare per errore un DB reale |
| Chrome non installato sulla macchina | Prerequisito documentato in `CLAUDE.md`; il backend Chrome accetta anche Chromium, Edge, Brave o `chrome-headless-shell` di Playwright |

---

## 7. File

**Nuovi:** `e2e/harness.ts`, `e2e/seed.ts`, `e2e/{auth,andamento,statistiche,profilo}.test.ts`.

**Modificati:** `package.json` (script `e2e`), `apps/web/package.json` (`--isolate`),
`apps/web/test/{queries,AndamentoList.actions,useAuth,ProfiloModal}.test.tsx`,
`.gitignore` (artefatti degli screenshot), `CLAUDE.md` (sezione E2E: prerequisiti, come si
lancia, perché non è in CI).

Nessuna modifica al codice di produzione. Se un selettore risultasse impossibile da
raggiungere senza toccare il markup, la scelta è `clickText()` nell'harness, non un
`data-testid` in produzione.

---

## 8. Definizione di completo

- `bun run e2e` verde in locale: 4 file, i flussi descritti in §4.
- `bun run test` verde con `--isolate` e i superset rimossi, in locale **e in CI sul PR**.
- `bun run lint` e `bun run typecheck` verdi.
- `CLAUDE.md` documenta prerequisiti e comando.
- Backlog aggiornato con ciò che resta: `apiErrorMessage` 400/422, loading/empty state,
  E2E in CI, E2E della PWA.
