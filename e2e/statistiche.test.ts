import { beforeAll, test, expect } from 'bun:test';
import { ensureLoggedIn, view, waitFor, WEB_URL } from './harness';

// Charts get a 20s test budget because the waitFor below is allowed 15s: bun's default
// per-test timeout is 5s and would fire first, reporting a timeout that says nothing about
// the chart.
const CHART_TIMEOUT = 20_000;

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
    // Structural assertion, never on values: the seed is relative to today, so the numbers
    // move as days pass while "there are bars" stays true.
    expect(await count('.recharts-bar-rectangle', `bars on /statistiche/${kind}`)).toBeGreaterThan(
      0,
    );
  },
  CHART_TIMEOUT,
);

test(
  'the chart container has a real measured size',
  async () => {
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
  },
  CHART_TIMEOUT,
);

test(
  '/statistiche/spese-frequenti paints pie sectors',
  async () => {
    await view.navigate(`${WEB_URL}/statistiche/spese-frequenti`);
    expect(await count('.recharts-pie-sector', 'pie sectors')).toBeGreaterThan(0);
  },
  CHART_TIMEOUT,
);

test('/statistiche shows the media tables', async () => {
  await view.navigate(`${WEB_URL}/statistiche`);
  const rows = await waitFor<number>(
    'populated media tables',
    `(() => { const n = document.querySelectorAll('table tbody tr').length; return n > 0 ? n : false; })()`,
  );
  expect(rows).toBeGreaterThan(0);
});

test(
  'switching the interval redraws',
  async () => {
    await view.navigate(`${WEB_URL}/statistiche/spesa`);
    await count('.recharts-bar-rectangle', 'bars in the monthly interval');
    // BarreStatistica offers M (default, "Mensile") and Y ("Annuale"); IntervalRadio gives
    // each radio id="intervallo-<value>". The yearly branch also swaps the wrapper class,
    // so this covers the taller monthly container collapsing to the shorter annual one.
    await view.click('#intervallo-Y');
    expect(await count('.recharts-bar-rectangle', 'bars in the yearly interval')).toBeGreaterThan(
      0,
    );
  },
  CHART_TIMEOUT,
);

test('the statistiche dropdown navigates', async () => {
  await view.navigate(`${WEB_URL}/home`);
  await waitFor('the header', `document.querySelector('.navbar') && 'ok'`);
  await view.click('button.dropdown-toggle');
  await waitFor('the open dropdown', `document.querySelector('.dropdown-menu.show a') && 'ok'`);
  await view.click('.dropdown-menu.show a[href="/statistiche/spesa"]');
  await waitFor('the bar chart route', `location.pathname === '/statistiche/spesa' && 'ok'`);
});
