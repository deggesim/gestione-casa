import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterEach } from 'bun:test';

GlobalRegistrator.register();

// Tests never hit the network (client calls are mocked or the query cache is
// seeded), but importing src/api/client.ts evaluates src/config.ts, which throws
// when PUBLIC_API_URL is unset. CI has no apps/web/.env, so provide a dummy here
// to keep transitive client imports safe regardless of test-file load order
// (otherwise import-safety would depend on a mock.module leak from another file).
process.env.PUBLIC_API_URL ||= 'http://localhost';

// `@testing-library/react` (via @testing-library/dom's `screen`) binds to the
// global `document` at module-evaluation time — a static import here would be
// hoisted above `register()` and permanently bind to an undefined document.
// The dynamic import defers evaluation until after registration.
const { cleanup } = await import('@testing-library/react');

// Auto-clean the DOM after every test in every file — bun:test doesn't do this
// on its own, and a leftover unmounted component from one test can make a later
// test's queries (e.g. getByLabelText) match more than one element.
afterEach(cleanup);
