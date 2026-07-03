// Compile-only proof that Eden Treaty resolves App into typed accessors.
// If `type App` or the package `exports` regress, `tsc --noEmit` fails here.
import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';

const api = treaty<App>('http://localhost');

// These calls must type-check: method/path/params are inferred from App.
export const _proofs = {
  listAndamento: () => api.andamento.get(),
  getAndamento: () => api.andamento({ id: 1 }).get(),
  spesa: () => api.statistiche.spesa({ interval: 'M' }).get(),
  me: () => api.utente.me.get(),
  login: () => api.utente.login.post({ email: 'a@b.it', password: 'pw' }),
};
