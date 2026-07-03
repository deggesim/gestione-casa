import { Elysia, t } from 'elysia';
import { AndamentoInputSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { createAndamentoRepository } from './andamento.repository';
import { createAndamentoService } from './andamento.service';

const service = createAndamentoService(createAndamentoRepository(db));

export const andamentoRoutes = new Elysia({ prefix: '/andamento' })
  .get('/', () => service.findAll())
  .get('/:id', ({ params }) => service.findById(params.id), {
    params: t.Object({ id: t.Number() }),
  })
  .post('/', ({ body }) => service.save(body), { body: AndamentoInputSchema })
  .put('/:id', ({ body }) => service.update(body), {
    params: t.Object({ id: t.Number() }),
    body: AndamentoInputSchema,
  })
  .delete('/:id', ({ params }) => service.remove(params.id), {
    params: t.Object({ id: t.Number() }),
  });
