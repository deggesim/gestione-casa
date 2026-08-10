import { buildApp } from '../apps/api/src/app';
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

// A stale listener on either port silently poisons the whole run instead of failing: Bun
// sets SO_REUSEPORT on Linux, so a second server binds the SAME port rather than erroring,
// and requests round-robin between them. Observed for real while building this suite — an
// interrupted run left five API servers on :5001, some of them with a deliberately wrong
// CORS_ORIGIN, and the auth flow failed against a restored config.
const assertPortFree = async (port: number, what: string) => {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1_000) });
  } catch {
    return; // nothing listening, which is the only acceptable state
  }
  throw new Error(
    `port ${port} (${what}) is already in use — stop the stale server, then rerun. ` +
      `Note SO_REUSEPORT means a second server would bind it silently.`,
  );
};
await assertPortFree(API_PORT, 'api');
await assertPortFree(WEB_PORT, 'web');

// env.ts falls back to CORS_ORIGIN='*' outside production. With '*' the cross-origin flow
// in auth.test would pass no matter what the browser did — the flow would assert nothing.
// Presence is enforced here (the `e2e` script sets it); the value is left to the test,
// which is what keeps the CORS mutant meaningful.
if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')
  throw new Error('CORS_ORIGIN must be set explicitly for the e2e suite — run `bun run e2e`');

await seedDb();

// The built artifact, not the dev server: it is what Fase 6 ships, and the dev server
// answers 200-with-HTML for any unknown path. PUBLIC_* vars are inlined at build time,
// so the API URL has to be decided here, before the bundle exists. PUBLIC_ENABLE_SW is
// forced off so a cached service worker can never serve a stale bundle to a test.
const build = Bun.spawnSync(['bun', 'run', 'build'], {
  cwd: Bun.fileURLToPath(webDir),
  env: { ...process.env, PUBLIC_API_URL: API_URL, PUBLIC_ENABLE_SW: 'false' },
});
if (build.exitCode !== 0) throw new Error(`web build failed: ${build.stderr.toString()}`);

// In-process, not a spawned child: `process.on('exit')` does NOT fire under `bun test`
// (verified), so a spawned API outlives the run and — see assertPortFree — keeps answering
// on :5001 next to the next run's server. Serving here ties the API's lifetime to the test
// process, which bun test tears down whatever the outcome. What this gives up is index.ts
// (two lines) and apps/api/.env loading; since the suite runs from the repo root, which has
// no .env, DATABASE_URL can only come from the `e2e` script. Do not "fix" the cleanup and
// go back to a child process: the exit handler was dead code, not a bug to repair.
buildApp().listen(API_PORT);
const health = await fetch(`${API_URL}/health`);
if (!health.ok) throw new Error(`api did not start: ${health.status}`);
await seedUtente(API_URL);

Bun.serve({ port: WEB_PORT, fetch: createHandler(new URL('./dist/', webDir)) });

export const view = new Bun.WebView({ width: 1280, height: 800 });

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
  await waitFor(
    'the andamento table after login',
    `document.querySelector('table[aria-label=andamento]') && 'ok'`,
  );
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
