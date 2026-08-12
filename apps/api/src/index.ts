import { buildApp } from './app';
import { env } from './env';

// hostname '::' and not the default 0.0.0.0: Railway's private network is IPv6-only on
// environments created before 2025-10-16, so an IPv4-only listener is reachable from the
// public edge and invisible to the web service's proxy — a healthy deploy that answers
// ECONNREFUSED. Verified dual-stack on Linux: a ::-bound server also answers on 127.0.0.1,
// so development, `bun test` and the e2e suite are unaffected.
//
// Deliberately fixed here instead of in an env var: a variable that can be forgotten would
// reproduce exactly the fault this line prevents (same reasoning as env.ts on NODE_ENV).
buildApp().listen({ port: env.PORT, hostname: '::' });
console.log(`API listening on port ${env.PORT} (dual-stack)`);
