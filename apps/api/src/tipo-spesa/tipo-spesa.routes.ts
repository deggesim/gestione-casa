import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { createTipoSpesaRepository } from './tipo-spesa.repository';
import { createTipoSpesaService } from './tipo-spesa.service';

const service = createTipoSpesaService(createTipoSpesaRepository(db));

export const tipoSpesaRoutes = new Elysia({ prefix: '/tipo-spesa' })
  .get('/', () => service.findAll())
  .get('/:id', ({ params }) => service.findById(params.id), {
    params: t.Object({ id: t.Number() }),
  });
