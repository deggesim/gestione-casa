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
  await expect(
    waitFor('a selector that cannot exist', `document.querySelector('#nope-nope') && 'ok'`, 500),
  ).rejects.toThrow('timeout waiting for a selector that cannot exist');
});
