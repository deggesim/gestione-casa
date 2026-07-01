import { drizzle } from 'drizzle-orm/bun-sql';
import { env } from '../env';
import * as schema from './schema';

// Bun.sql reads TLS mode from the URL (`?sslmode=require` in prod, none locally).
// Never disable certificate verification — use the provider CA instead.
export const db = drizzle({ connection: { url: env.DATABASE_URL }, schema });
