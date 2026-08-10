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
