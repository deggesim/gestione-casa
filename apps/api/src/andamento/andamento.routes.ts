import { Elysia, t } from 'elysia';
import { AndamentoInputSchema, AndamentoSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { authPlugin } from '../auth/auth.plugin';
import { createAndamentoRepository } from './andamento.repository';
import { createAndamentoService } from './andamento.service';

const service = createAndamentoService(createAndamentoRepository(db));

export const andamentoRoutes = new Elysia({ prefix: '/andamento' })
  .use(authPlugin)
  .get('/', () => service.findAll(), { response: t.Array(AndamentoSchema) })
  .get('/:id', ({ params }) => service.findById(params.id), {
    params: t.Object({ id: t.Number() }),
    response: AndamentoSchema,
  })
  .post('/', ({ body }) => service.save(body), {
    body: AndamentoInputSchema,
    response: AndamentoSchema,
  })
  .put('/:id', ({ body }) => service.update(body), {
    params: t.Object({ id: t.Number() }),
    body: AndamentoInputSchema,
    response: AndamentoSchema,
  })
  .delete('/:id', ({ params }) => service.remove(params.id), {
    params: t.Object({ id: t.Number() }),
    response: t.Object({ deleted: t.Number() }),
  });
