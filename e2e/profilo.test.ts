import { beforeAll, afterAll, test, expect } from 'bun:test';
import { clickText, ensureLoggedIn, fill, reseed, view, waitFor, WEB_URL } from './harness';
import { E2E_USER } from './seed';

const NUOVA_PASSWORD = 'nuova-segretissima';

const submitDisabled = () =>
  view.evaluate(`document.querySelector('.modal button[type=submit]').disabled`);

// The login form is the only place with a #password; ProfiloModal renders #email too, so
// #email alone would not tell the two apart.
const onLoginPage = () =>
  waitFor(
    'the login page',
    `location.pathname === '/login' && document.querySelector('#password') && 'ok'`,
  );

beforeAll(ensureLoggedIn);
// Mandatory, not hygiene: this flow changes the E2E user's password, and every other file
// logs in with the seeded one.
afterAll(reseed);

test('saving the profile revokes every session and forces a logout', async () => {
  await view.navigate(`${WEB_URL}/home`);
  await waitFor('the table', `document.querySelector('table[aria-label=andamento]') && 'ok'`);

  await clickText('button', 'Profilo Utente');
  await waitFor('the profile modal', `document.querySelector('#newPassword') && 'ok'`);

  // Prefilled from the ['me'] query, which only an authenticated request can answer.
  expect(await view.evaluate(`document.querySelector('#email').value`)).toBe(E2E_USER.email);

  // Mismatched confirmation keeps Salva disabled — the deliberate 4d change from the legacy
  // toast to a field-level validation. Asserted before the happy path because it is the
  // only proof the validation is wired to the button rather than to a submit handler.
  await fill('#newPassword', NUOVA_PASSWORD);
  await fill('#confirmPassword', `${NUOVA_PASSWORD}-diversa`);
  await waitFor(
    'Salva to stay disabled while the passwords differ',
    `document.querySelector('.modal button[type=submit]').disabled === true ? 'ok' : false`,
  );

  await fill('#confirmPassword', NUOVA_PASSWORD);
  await waitFor(
    'Salva to become enabled once they match',
    `document.querySelector('.modal button[type=submit]').disabled === false ? 'ok' : false`,
  );
  expect(await submitDisabled()).toBe(false);

  await view.click('.modal button[type=submit]');

  // PATCH /utente/me revokes every refresh token server-side, so a successful save always
  // ends the session. The modal owns the redirect.
  await onLoginPage();

  // And the session is really dead, not just navigated away from.
  await view.navigate(`${WEB_URL}/home`);
  await onLoginPage();
});

test('the new password works and the old one does not', async () => {
  await view.navigate(`${WEB_URL}/login`);
  await onLoginPage();

  // Old password first: it must be refused, otherwise the save above changed nothing and
  // the forced logout would be the only thing the previous test proved.
  await fill('#email', E2E_USER.email);
  await fill('#password', E2E_USER.password);
  await view.click('button[type=submit]');
  // A 401 maps to the "Utente non loggato" toast (query-client.ts → apiErrorMessage). Waiting
  // for that text is a presence assertion: "we are still on /login" would be true instantly,
  // before the request even finished, and would pass with the login broken the other way.
  await waitFor(
    'the login to be refused',
    `document.body.innerText.includes('Utente non loggato') && 'ok'`,
  );
  expect(await view.evaluate('location.pathname')).toBe('/login');

  await fill('#password', NUOVA_PASSWORD);
  await view.click('button[type=submit]');
  await waitFor(
    'the redirect to /home',
    `document.querySelector('table[aria-label=andamento]') && 'ok'`,
  );
});
