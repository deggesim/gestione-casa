import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterEach } from 'bun:test';

GlobalRegistrator.register();

// `@testing-library/react` (via @testing-library/dom's `screen`) binds to the
// global `document` at module-evaluation time — a static import here would be
// hoisted above `register()` and permanently bind to an undefined document.
// The dynamic import defers evaluation until after registration.
const { cleanup } = await import('@testing-library/react');

// Auto-clean the DOM after every test in every file — bun:test doesn't do this
// on its own, and a leftover unmounted component from one test can make a later
// test's queries (e.g. getByLabelText) match more than one element.
afterEach(cleanup);
