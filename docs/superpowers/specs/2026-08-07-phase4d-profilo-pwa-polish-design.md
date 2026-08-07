# Fase 4d — Profilo utente, PWA e polish del layout

**Data:** 2026-08-07
**Stato:** design approvato, pronto per il piano di implementazione
**Branch previsto:** `feat/phase4d-profilo-pwa-polish` (da `master` @ `1abf449`)

Ultima sotto-fase della Fase 4 (frontend React). Chiude la parità di schermate col
legacy `gc-frontend` e rende l'app installabile.

---

## 1. Obiettivo e scope

Tre blocchi indipendenti, che possono procedere in parallelo:

1. **Profilo utente** — porting di `user-profile.component.*`, l'ultima schermata legacy
   non ancora migrata.
2. **PWA** — manifest, icone, favicon, service worker scritto a mano, prompt di
   aggiornamento.
3. **Polish del layout** — hamburger mobile (oggi assente), icone `react-icons` al posto
   di emoji e testo, voce "Profilo Utente", breadcrumb.

A questi si aggiunge una correzione **non pianificata ma bloccante**, emersa durante il
design: lo script di build non inlinea le variabili `PUBLIC_*`, quindi l'app buildata non
si avvia in un browser (§4.1.1). Senza questa correzione nulla della PWA è verificabile.

### Fuori scope (deciso esplicitamente)

- **Backlog tecnico delle fasi precedenti** → Fase 5: restringere l'override del body
  degli errori API a 400/422, deduplicare i refresh 401 concorrenti, lint guard
  `import type` per web→api, loading/empty state della lista.
- **Caching dei dati API nel service worker.** I `dataGroups` di `ngsw-config.json`
  puntano a `https://gestione-casa-server.herokuapp.com/*`, un backend che non esiste più
  da due migrazioni: è configurazione morta, non si porta.
- **Variabili d'ambiente di produzione e deploy** → Fase 6 (`CORS_ORIGIN`,
  `COOKIE_SECURE`, `COOKIE_DOMAIN`, dominio custom).

---

## 2. Stato di partenza

`master` @ `1abf449`, PR #6 (Fase 4c, statistiche) mergiata. `apps/web` contiene già:
login, lista andamento con CRUD, sei schermate statistiche, `Layout` con navbar fissa e
dropdown statistiche, tema chiaro/scuro, spinner globale, toast `sonner`, gestione errori
centralizzata con refresh dei 401.

Manca: il profilo utente, tutta la parte PWA, l'hamburger mobile, il breadcrumb.

---

## 3. Profilo utente

### 3.1 Riferimento legacy

`gc-frontend/src/app/user-profile/user-profile.component.ts` + `.html`, montato come modal
in `app.component.html` e aperto dalla voce "Profilo Utente" dell'header.

Form a tre campi (`email`, `newPassword`, `confirmPassword`), tutti `Validators.required`,
`email` precompilata dall'utente corrente. `Salva` disabilitato se il form è invalido.
Al submit il legacy confronta a mano le due password e, se differiscono, emette un toast
warning `Le password non coincidono` senza inviare nulla.

### 3.2 Deviazione decisa: mismatch come validazione di campo

Il confronto fra le due password **diventa una validazione di campo**, non un toast.

```ts
register('confirmPassword', {
  required: 'Il campo Conferma password è obbligatorio',
  validate: (v, values) =>
    v === values.newPassword || 'Le password non coincidono',
})
```

L'errore compare sotto `confirmPassword` con la stessa `.invalid-feedback` degli altri
campi, il form resta invalido e `Salva` resta disabilitato. Sparisce così il ramo di
codice del legacy in cui premere `Salva` produce solo un toast.

> **Trabocchetto RHF da rispettare.** La regola vive su `confirmPassword`, ma react-hook-form
> rivalida un campo solo quando cambia quel campo: se l'utente corregge `newPassword`,
> l'errore sotto `confirmPassword` resta appeso. Serve `deps: ['confirmPassword']` sulla
> `register` di `newPassword`. È lo stesso genere di quirk che in Fase 4b ha imposto due
> deviazioni dal brief (`Controller` per `<select>`, `useWatch({ compute })` per
> `formState.isValid` stantio al mount).

Il resto della validazione resta in parità letterale col legacy: messaggi italiani
`Il campo X è obbligatorio`, `is-invalid` applicata solo quando il campo è `dirty`.

### 3.3 Contratto API e comportamento post-salvataggio

`PATCH /utente/me` accetta `UpdateMeInputSchema` (`email` opzionale, `password`
obbligatoria) e restituisce `UtenteSchema`.

**La sessione viene revocata dal salvataggio.** `utente.service.ts:51` chiama
`repo.removeAllTokens(id)` — invalida *tutti* i refresh token dell'utente lato database —
e `utente.routes.ts` chiama `clearSession(cookie)`. Non è un dettaglio dei cookie: è una
revoca server-side deliberata, introdotta con l'hardening della Fase 2.

**Decisione: si accetta il logout forzato.** Nessuna modifica all'API, nessuna modifica al
contratto, diff limitato a `apps/web`.

```
onSuccess:
  toast.success('Utente modificato correttamente')
  toast.warning('Effettua di nuovo il login')
  queryClient.setQueryData(['me'], null)
  navigate({ to: '/login' })
```

`setQueryData(['me'], null)` e non `invalidateQueries`, per lo stesso motivo già
documentato in `useAuth.ts:38` per `useLogout`: il cookie non c'è più, un refetch
produrrebbe solo un 401.

Questa è una **deviazione consapevole dalla UX legacy**, dove l'utente restava dentro
perché il vecchio backend non revocava nulla.

### 3.4 File

| File | Contenuto |
| --- | --- |
| `apps/web/src/utente/ProfiloModal.tsx` | `Modal` react-bootstrap + form RHF |
| `apps/web/src/utente/queries.ts` | `useSaveProfilo()` → `apiClient.utente.me.patch(...)` |
| `apps/web/src/layout/Layout.tsx` | stato di apertura + voce navbar |

Il `Modal` di react-bootstrap è già il pattern usato da `AndamentoList` in Fase 4b
(form e conferma di cancellazione): si riusa quello, non se ne introduce un altro.

L'email corrente arriva da `useMe()`, **non** da `localStorage` — il legacy leggeva
`JSON.parse(localStorage.getItem('utente'))`, ma dalla Fase 4a non esiste più nulla in
`localStorage` a parte il tema.

### 3.5 Test

- mismatch fra le password → messaggio `Le password non coincidono` sotto il campo,
  `Salva` disabilitato, **nessuna chiamata** al client;
- correggendo `newPassword` l'errore su `confirmPassword` sparisce (regressione sul
  trabocchetto `deps`);
- submit valido → `patch` chiamata con `{ email, password }`;
- successo → `['me']` azzerata e navigazione a `/login`.

---

## 4. PWA

### 4.1 Vincoli del bundler Bun — misurati, non ipotizzati

Tre comportamenti verificati sperimentalmente su questo repo. Determinano l'intero
design: chi implementa non deve riderivarli.

1. **Ogni asset referenziato da `index.html` viene hashato e il link riscritto.**
   `<link rel="manifest" href="./manifest.webmanifest">` diventa
   `./manifest-18mbd119.webmanifest` nella build e `/_bun/asset/6188b46b8da1a109.webmanifest`
   in dev. **Vale anche con `href` assoluto**: `/manifest.webmanifest` viene risolto e
   hashato esattamente allo stesso modo. Non c'è modo di sottrarsi.
2. **I file non referenziati non finiscono in `dist/`.** Un `sw.js` accanto a
   `index.html` semplicemente non viene copiato.
3. **Il dev server (`bun ./index.html`) fa fallback SPA a `index.html` per ogni path
   sconosciuto.** `/sw.js`, `/icons/icon-192x192.png` e `/manifest.webmanifest`
   rispondono `200` ma con dentro l'HTML dell'app. Il dev server **non serve file
   statici**: guardare lo status code non basta, va guardato il contenuto.

Conseguenza diretta del punto 1: siccome l'URL effettivo del manifest cambia, **i path
dentro il manifest devono essere assoluti** (`/icons/…`, `start_url: "/"`, `scope: "/"`).
Con path relativi si risolverebbero rispetto a `/_bun/asset/`, e le icone darebbero 404.

Conseguenza dei punti 2 e 3: il service worker e le icone PNG richiedono una **copia
esplicita** in fase di build, e **non sono verificabili con il dev server**.

### 4.1.1 Bug latente scoperto: `bun build` non inlinea le variabili `PUBLIC_*`

Verificato sperimentalmente durante il design, ed è un **prerequisito** per tutto il
resto di questa fase.

`apps/web/bunfig.toml` contiene `[serve.static] env = "PUBLIC_*"`, ma quella sezione
configura il **dev server**, non `bun build`. Il flag `--env` di `bun build` ha come
default `'disable'`. Risultato: lo script di build attuale

```
bun build ./index.html --outdir dist --minify
```

produce un bundle in cui `process.env.PUBLIC_API_URL` sopravvive **letteralmente**, mai
sostituito. In un browser `process` non esiste, quindi l'app buildata muore al
caricamento con `ReferenceError: process is not defined` — precisamente il fallimento
che `CLAUDE.md` mette in guardia di evitare.

Prove raccolte:

| Percorso | `PUBLIC_API_URL` nel bundle |
| --- | --- |
| dev server (`bun ./index.html`) | inlineata (`localhost:5000` presente) |
| `bun build … --minify` | **non inlineata** (`process.env.PUBLIC_API_URL` letterale) |
| `bun build … --env 'PUBLIC_*'` | inlineata, zero `process.env` residui |

Il bug non è mai emerso perché nessuno ha mai *servito* l'output della build: la CI esegue
`lint`, `typecheck` e `test`, mai `build`, e non è mai esistito uno script di preview. La
Fase 4d è la prima a caricare l'app buildata in un browser, quindi ci sbatterebbe contro
al primo tentativo di verifica.

**Correzioni da includere in questa fase:**

1. lo script `build` di `apps/web/package.json` aggiunge `--env 'PUBLIC_*'`;
2. `CLAUDE.md` afferma che l'inlining a build time avviene grazie a
   `bunfig.toml` — è vero solo per il dev server, e va corretto.

### 4.2 Struttura dei file

```
apps/web/public/
  manifest.webmanifest      referenziato da index.html → Bun lo emette da solo
  favicon.ico               referenziato da index.html → Bun lo emette da solo
  icons/icon-{72,96,128,144,152,192,384,512}x{…}.png   8 file, 196 KB
  sw.js                     non referenziato → copia esplicita
```

Icone e favicon si copiano verbatim da `gc-frontend/src/assets/icons/` e
`gc-frontend/src/favicon.ico`.

`index.html` aggiunge, accanto al `theme-color` già presente:

```html
<link rel="icon" href="./public/favicon.ico" />
<link rel="manifest" href="./public/manifest.webmanifest" />
```

Script di build (comprensivo della correzione di §4.1.1):

```
bun build ./index.html --outdir dist --minify --env 'PUBLIC_*' && cp -R public/icons public/sw.js dist/
```

### 4.3 Manifest

`gc-frontend/src/manifest.webmanifest` verbatim (nome, `short_name`, `theme_color` e
`background_color` `#7FC1AD`, `display: standalone`, gli 8 `icons`), con **path resi
assoluti**:

```json
{ "scope": "/", "start_url": "/", "icons": [{ "src": "/icons/icon-72x72.png", ... }] }
```

### 4.4 Service worker

`apps/web/public/sw.js`, JavaScript semplice, nessuna dipendenza, circa 50 righe.
Resta fuori da `src/` di proposito: `apps/web/tsconfig.json` include solo
`["src", "happydom.ts", "test"]`, quindi `tsc --noEmit` non prova a typecheckarlo con le
`lib` del DOM (i global di un service worker richiederebbero `lib: ["WebWorker"]`).
Attenzione: `.prettierignore` **non** esclude `public/`, quindi il file deve passare
`prettier --check`.

Tre regole di caching:

- **`cache-first` sugli asset hashati** (`/index-*.js`, `/index-*.css`): l'hash *è* la
  versione, quindi sono immutabili per costruzione e il cache-first è corretto, non
  rischioso.
- **`network-first` sulla navigazione** (`request.mode === 'navigate'`), con fallback
  all'app shell in cache quando la rete non c'è. Ogni navigazione riuscita aggiorna
  l'app shell.
- **tutto il resto passa senza toccare la cache.**

Le chiamate API sono escluse da un semplice controllo di origine: `apps/web` e `apps/api`
girano su origin diversi (`PUBLIC_API_URL`, oggi `localhost:3000` → `localhost:5000`),
quindi `url.origin !== self.location.origin` le scarta tutte.

> `ponytail:` l'esclusione delle API si regge sulla diversità di origine. Se in Fase 6
> web e api finissero sullo stesso dominio, aggiungere un'esclusione esplicita per
> `/utente`, `/andamento`, `/statistiche`, `/tipo-spesa`.

Il worker **non** chiama `skipWaiting()` in `install`: farlo vanificherebbe il prompt di
aggiornamento, il cui scopo è proprio restare in attesa della conferma dell'utente.
`skipWaiting()` avviene solo alla ricezione del messaggio `SKIP_WAITING`. In `activate` si
cancellano le cache con nome diverso da quella corrente e si fa `clients.claim()`.

### 4.5 Registrazione e ambiente

Il service worker si registra **solo se `PUBLIC_ENABLE_SW === 'true'`**, seguendo la
convenzione stretta del progetto (tutta la configurazione in `.env` per app, prefisso
`PUBLIC_*` per ciò che finisce nel browser). Va aggiunto a `apps/web/.env.example`.

Il valore viene inlineato **al momento della build** (§4.1.1), non letto a runtime: la
build di verifica va quindi lanciata con la variabile impostata, e va letta tramite lo
stesso `src/config.ts` che già valida `PUBLIC_API_URL`, non con un `process.env` sparso.

In sviluppo resta spento: un service worker in dev rompe l'hot reload — è il default anche
di `vite-plugin-pwa` — e comunque il punto 3 di §4.1 lo renderebbe inservibile.

### 4.6 Prompt di aggiornamento

Parità funzionale col popup legacy (`app-update.service.ts` + `popup-conferma`):
titolo `Aggiornamento app disponibile`, pulsanti `Aggiorna` e `Annulla`.

Flusso: alla registrazione si osservano `registration.waiting` (worker già in attesa) e
l'evento `updatefound` → quando il nuovo worker raggiunge lo stato `installed` con un
controller già attivo, si mostra il `Modal`. `Aggiorna` invia `SKIP_WAITING` al worker in
attesa e ricarica la pagina al `controllerchange`. `Annulla` chiude e basta.

La logica di rilevamento va **estratta in una funzione pura** che riceve un oggetto
simil-`ServiceWorkerRegistration` e una callback di notifica: happy-dom non espone
`ServiceWorkerContainer`, quindi è l'unico modo per coprirla con un test.

### 4.7 `serve.ts` e `bun run preview`

Circa 15 righe di `Bun.serve` che servono `dist/` come statico con fallback SPA su
`dist/index.html`.

Non è un extra: per il punto 3 di §4.1 il dev server non serve i file statici, quindi
**senza questo la PWA non è verificabile in alcun modo**. Fase 6 riuserà lo stesso file
per il deploy, dove il servizio web dovrà comunque servire l'SPA.

`serve.ts` va aggiunto a `include` in `apps/web/tsconfig.json`, altrimenti resta fuori dal
`typecheck`.

### 4.8 Test

Il service worker non è testabile sotto happy-dom. Copertura automatica limitata alla
funzione pura di §4.6; il resto è verifica manuale su `dist` (§7).

---

## 5. Polish del layout

| Elemento | Oggi | Fase 4d |
| --- | --- | --- |
| Hamburger mobile | **assente** | `navbar-toggler` + collapse a stato |
| Brand | testo "Gestione Casa" | `FaHouse` |
| Tema | emoji ☀ / ☾ | `FaSun` / `FaMoon` |
| Logout | testo | `FaRightFromBracket` + testo |
| Profilo | **assente** | `FaCircleUser` + "Profilo Utente" |
| Breadcrumb | **assente** | `<ol class="breadcrumb bg-dark">` sotto la navbar |

Le icone chiudono anche il rinvio della Fase 4a (emoji contro FontAwesome, in attesa di
conferma): `react-icons` è già una dipendenza dalla Fase 4b, si usano i glifi `fa6`.

### 5.1 Hamburger

La navbar legacy ha `navbar-toggler` + `[collapse]` di ngx-bootstrap; la navbar React non
ha nulla, quindi su schermo stretto le voci non sono raggiungibili.

Si implementa con `useState`, nello stesso stile hand-rolled del dropdown statistiche già
presente in `Layout.tsx`, e per lo stesso motivo documentato lì: i componenti
`Navbar`/`NavDropdown` di react-bootstrap montano Popper, che rende il menu scomodo da
asserire sotto happy-dom. Come nel legacy, ogni voce cliccata richiude il menu.

### 5.2 Breadcrumb

Il legacy costruisce il breadcrumb camminando l'albero di `ActivatedRoute` e leggendo
`data.breadcrumb` di ogni livello; per `/statistiche/spesa` produce due voci
(`Spese medie` come link, `Spesa` come testo). L'ultima voce è testo, le precedenti sono
link.

Le rotte React sono **piatte** — decisione della Fase 4c: nel legacy la rotta padre
nascondeva le proprie tabelle quando un figlio era attivo, quindi l'annidamento non
condivideva nulla — perciò `useMatches()` da solo restituirebbe un solo livello.

Soluzione: `staticData: { crumbs: [...] }` su ogni rotta, con la catena dichiarata per
esteso, e un componente `Breadcrumb` che legge `useMatches()` e appiattisce. Nessun
re-nesting del router.

| Rotta | Crumbs |
| --- | --- |
| `/home` | `Home` |
| `/login` | `Login` |
| `/statistiche` | `Spese medie` |
| `/statistiche/spese-frequenti` | `Spese medie` → `Spese frequenti` |
| `/statistiche/spesa` | `Spese medie` → `Spesa` |
| `/statistiche/carburante` | `Spese medie` → `Carburante` |
| `/statistiche/bolletta` | `Spese medie` → `Bollette` |
| `/statistiche/casa` | `Spese medie` → `Casa` |

**Correzione voluta rispetto al legacy:** la voce di `/statistiche/spese-frequenti` è
`Spese frequenti`, non `Lista` come nel sorgente originale.

Resta invece il quirk già accettato in Fase 4c: l'etichetta plurale `Bollette` punta alla
rotta singolare `/statistiche/bolletta`.

Markup in parità: `<nav aria-label="breadcrumb">` con `<ol class="breadcrumb bg-dark">`.
Il breadcrumb sta nel flusso normale sotto la navbar fissa, come nel legacy.

### 5.3 Test

- l'hamburger mostra e nasconde le voci, e una voce cliccata richiude il menu;
- il breadcrumb della rotta corrente rende le voci attese, con l'ultima come testo e le
  precedenti come link;
- i test esistenti di `Layout` continuano a passare (la sostituzione di ☀/☾ con le icone
  cambia il contenuto del pulsante tema: le query esistenti vanno verificate).

---

## 6. Strategia di test

`bun test` + Testing Library + happy-dom, come nelle Fasi 4b e 4c.

**Nessun nuovo `mock.module`.** È la regola nata dalle due regressioni CI delle Fasi 4a e
4b: `mock.module` è globale al processo e `mock.restore()` non lo disfa su questo Bun,
quindi un mock parziale in un file inquina i file fratelli — è così che un mock parziale
di `sonner` ha fatto fallire `Layout.test` solo in CI. Se un mock è inevitabile, dev'essere
un **superset completo** di ciò che qualunque file fratello importa, con
`afterAll(mock.restore)`. Per i test di sola lettura si preferisce seminare la cache di
`QueryClient`.

Comandi (dalla radice):

- solo web: `bun run --filter '@gc/web' test`
- suite completa: `bun run test` — **richiede un `DATABASE_URL` che punti a `gc_test`**,
  mai al database di sviluppo: `apps/api/test/setup.ts` fa `TRUNCATE` dello schema `gc`.
  In Fase 4b questo ha causato la cancellazione del DB di sviluppo, recuperata solo
  ripescando il dump di produzione.

Essendo la Fase 4d interamente frontend, la suite web da sola è sufficiente durante lo
sviluppo; `lint`, `typecheck` e suite completa vanno verdi prima della PR.

---

## 7. Verifica manuale

Non copribile dai test automatici, da fare prima della PR:

1. `PUBLIC_ENABLE_SW=true bun run build && bun run preview` → l'app si carica da `dist`
   **senza `ReferenceError: process is not defined`** (regressione su §4.1.1), il manifest
   è valido, le icone si risolvono, Chrome propone l'installazione (richiede un service
   worker con un handler `fetch`, quindi verifica implicitamente anche quello);
2. offline dopo il primo caricamento → l'app shell si apre;
3. secondo build con una modifica → compare il prompt di aggiornamento, `Aggiorna`
   ricarica sulla versione nuova;
4. profilo: mismatch bloccato con errore di campo, salvataggio valido → redirect a
   `/login` e nuovo login funzionante con la nuova password;
5. hamburger e breadcrumb a larghezza mobile e desktop;
6. **click-through delle sei schermate statistiche** — ancora in sospeso dalla Fase 4c: i
   grafici Recharts non rendono nulla sotto happy-dom (`ResponsiveContainer` misura 0×0),
   quindi il rendering effettivo è invisibile alla suite.

---

## 8. Rischi

| Rischio | Mitigazione |
| --- | --- |
| La build non inlinea le `PUBLIC_*` e l'app buildata muore (§4.1.1) | `--env 'PUBLIC_*'` nello script di build, verificato al punto 1 di §7 |
| Un service worker sbagliato serve un'app vecchia e sembra "rotta" | `PUBLIC_ENABLE_SW` spento in dev; cache-first solo su asset hashati immutabili; navigazione sempre network-first |
| I path dentro il manifest si rompono per via dell'hash del bundler | Path assoluti (§4.1), verificati al punto 1 di §7 |
| `cp` nello script di build silenziosamente non copia nulla | Il punto 1 di §7 fallisce subito: senza icone niente installazione |
| Regressione dei test di `Layout` per il cambio di icone | Suite web verde a ogni task |
| Un nuovo `mock.module` rompe la CI e non il locale | Regola di §6 |
