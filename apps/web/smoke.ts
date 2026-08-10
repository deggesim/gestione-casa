// Post-build smoke check.
//
// Both production bugs this app has shipped so far — relative asset URLs, and a
// PUBLIC_* var the bundler could not inline — produced a SUCCESSFUL build with broken
// output. `bun run build` on its own therefore proves nothing; this loads what the
// build actually emitted and boots it.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const dist = new URL('./dist/', import.meta.url);

// Annotated on the variable, not just the return type: TypeScript only narrows past a
// never-returning call when the binding itself carries the type.
const fail: (message: string) => never = (message) => {
  console.error(`smoke: FAIL — ${message}`);
  process.exit(1);
};

const indexHtml = Bun.file(new URL('./index.html', dist));
if (!(await indexHtml.exists())) fail('dist/index.html is missing — run the build first');
const html = await indexHtml.text();

// 1. Asset URLs must be absolute. Relative ones resolve against the current directory,
// so /statistiche/spesa requests /statistiche/index-<hash>.js, gets the SPA fallback
// HTML back and renders a blank page. Only routes nested one level deep break, which is
// why this survived review — assert it instead of eyeballing it.
const relative = [...html.matchAll(/(?:src|href)="(\.[^"]*)"/g)].map((m) => m[1]);
if (relative.length > 0)
  fail(`relative asset URLs in index.html (${relative.join(', ')}) — build needs --public-path=/`);

// Follow the script index.html actually references rather than globbing for index-*.js:
// hashed names accumulate across builds, so a glob can pick a stale bundle and quietly
// smoke-test the previous build. (Caught by mutation-testing this very script.)
const src = html.match(/<script[^>]*\ssrc="([^"]+)"/)?.[1];
if (!src) fail('no <script src> in dist/index.html');
const code = await Bun.file(new URL(src.replace(/^\//, ''), dist)).text();

// 2. The bundle must boot without `process`. Shadowing it as an undefined parameter
// makes every `process.x` read throw, which is what referencing the undeclared
// identifier does in a real browser — so an un-inlined PUBLIC_* var fails here rather
// than in front of a user. Bun always defines a real `process`, so nothing short of
// shadowing reproduces the browser.
GlobalRegistrator.register();
const root = document.createElement('div');
root.id = 'root';
document.body.append(root);

// The app fetches PUBLIC_API_URL at boot and there is no API here; those rejections are
// expected and must not be read as a boot failure.
process.on('unhandledRejection', () => {});

try {
  new Function('process', code)(undefined);
} catch (error) {
  fail(`bundle threw on evaluation: ${error}`);
}

// React renders asynchronously, so poll rather than assume a fixed delay.
for (let i = 0; i < 100 && root.children.length === 0; i++) await Bun.sleep(20);
if (root.children.length === 0) fail('bundle evaluated but rendered nothing into #root');

console.log('smoke: OK — assets absolute, bundle boots and renders without `process`');
process.exit(0);
