import { beforeAll, afterAll, test, expect } from 'bun:test';
import { clickText, ensureLoggedIn, fill, reseed, view, waitFor, WEB_URL } from './harness';

const DESCRIZIONE = 'voce creata dal test e2e';
const MODIFICATA = 'voce modificata dal test e2e';
const COSTO = '42.5';

const tableReady = () =>
  waitFor('the andamento table', `document.querySelector('table[aria-label=andamento]') && 'ok'`);

const modalOpen = () =>
  waitFor('the form modal', `document.querySelector('.modal #descrizione') && 'ok'`);

const modalClosed = () =>
  waitFor('the modal to close', `document.querySelector('.modal #descrizione') ? false : 'ok'`);

// Filtering keeps the assertions independent of pagination: the table paginates past 10
// rows and the seed already has 11, so a new row would land on page two. The threshold is
// 2 characters (filterWhere in apps/api/src/andamento/andamento.repository.ts), which
// every search string here clears. The filter is debounced, hence the polling rowCountIs.
const filterBy = async (text: string) => {
  await tableReady();
  await fill('input[placeholder="Filtro"]', text);
};

const rowCountIs = (n: number) =>
  waitFor(
    `the table to hold exactly ${n} row(s)`,
    `document.querySelectorAll('table[aria-label=andamento] tbody tr').length === ${n} ? 'ok' : false`,
  );

const visibleDescriptions = () =>
  view.evaluate(
    `[...document.querySelectorAll('table[aria-label=andamento] tbody tr td:nth-child(2)')]
       .map(td => td.textContent.trim())`,
  ) as Promise<string[]>;

const submitDisabled = () =>
  view.evaluate(`document.querySelector('.modal button[type=submit]').disabled`);

beforeAll(ensureLoggedIn);
// The seeded rows are the fixture for statistiche.test, which runs after this file.
afterAll(reseed);

test('quick-add creates a row through the browser, preflight included', async () => {
  await tableReady();

  // Every mutation is preceded by an OPTIONS preflight carrying X-Requested-With. No
  // automated test in the repo produces one; only a real browser does.
  await view.click('button[aria-label="Spesa"]');
  await modalOpen();

  // The quick-add prefills giorno, descrizione and tipo spesa but NOT costo (prefills.ts:
  // `costo: ''`), so Salva opens disabled — costo is the only thing missing. Asserting it
  // documents why the test types a cost, and doubles as a check that the disabled state is
  // driven by the watched values rather than RHF's stale formState.isValid.
  expect(await submitDisabled()).toBe(true);

  // fill(), not type(): descrizione arrives prefilled with "Spesa", and typing would splice
  // the new text into it at the caret.
  await fill('#descrizione', DESCRIZIONE);
  await fill('#costo', COSTO);

  // Enabling proves react-hook-form actually registered the typed input — the property no
  // amount of DOM value assignment can reproduce.
  await waitFor(
    'Salva to become enabled',
    `document.querySelector('.modal button[type=submit]').disabled === false ? 'ok' : false`,
  );

  await view.click('.modal button[type=submit]');
  await modalClosed();

  await filterBy(DESCRIZIONE);
  await rowCountIs(1);
  expect(await visibleDescriptions()).toEqual([DESCRIZIONE]);
});

test('editing a row persists across a reload', async () => {
  await filterBy(DESCRIZIONE);
  await view.click('button[aria-label="Modifica"]');
  await modalOpen();

  // Opened on an existing row, the form is valid with nothing touched — the case that made
  // AndamentoForm compute validity from watched values instead of formState.isValid.
  expect(await submitDisabled()).toBe(false);

  await fill('#descrizione', MODIFICATA);
  await view.click('.modal button[type=submit]');
  await modalClosed();

  // A reload proves the PUT reached the database, not just the query cache.
  await view.reload();
  await filterBy(MODIFICATA);
  await rowCountIs(1);
  expect(await visibleDescriptions()).toEqual([MODIFICATA]);
});

test('deleting a row asks for confirmation and removes it', async () => {
  await filterBy(MODIFICATA);
  await view.click('button[aria-label="Elimina"]');
  // .modal-footer exists only on the confirm dialog: the form modal keeps its buttons
  // inside the form, in Modal.Body.
  await waitFor('the confirm dialog', `document.querySelector('.modal-footer') && 'ok'`);
  await clickText('.modal-footer button', 'Elimina');

  await rowCountIs(0);
  // Reload, then re-filter: the row must be gone from the database, not just from the view.
  await view.reload();
  await filterBy(MODIFICATA);
  expect(await visibleDescriptions()).toEqual([]);
});

// The seed holds 11 rows (page size 10), so there are exactly two pages. Page, filter and
// sort live in the URL: only a real browser proves that Back steps through pages and that
// a reload (== opening a shared link) lands on the same view.
const search = () => view.evaluate('location.search') as Promise<string>;

test('the page lives in the URL: reload keeps it and Back returns to page one', async () => {
  await view.navigate(`${WEB_URL}/home`);
  await tableReady();
  await rowCountIs(10);

  // The paginator sits below the 10-row table, under the 800px fold; click() needs it visible.
  await view.evaluate(`document.querySelector('.pagination').scrollIntoView()`);
  await clickText('.pagination .page-link', '2');
  await waitFor('page=2 in the URL', `location.search.includes('page=2') ? 'ok' : false`);
  await rowCountIs(1);

  await view.reload(); // same as opening the shared link
  await tableReady();
  await rowCountIs(1);
  expect(await search()).toContain('page=2');

  await view.evaluate('history.back()');
  await rowCountIs(10);
  expect(await search()).not.toContain('page=');
});
