import { Elysia, t } from 'elysia';
import { IntervalSchema, type Interval } from '@gc/shared-types';
import { db } from '../db/client';
import { authPlugin } from '../auth/auth.plugin';
import { createStatisticheRepository } from './statistiche.repository';
import { createStatisticheService } from './statistiche.service';

const service = createStatisticheService(createStatisticheRepository(db));
const params = { params: t.Object({ interval: IntervalSchema }) };
const asInterval = (v: string) => v as Interval;

export const statisticheRoutes = new Elysia({ prefix: '/statistiche' })
  .use(authPlugin)
  .get(
    '/spese-frequenti/:interval',
    ({ params: p }) => service.speseFrequenti(asInterval(p.interval)),
    params,
  )
  .get('/spesa/:interval', ({ params: p }) => service.spesa(asInterval(p.interval)), params)
  .get(
    '/carburante/:interval',
    ({ params: p }) => service.carburante(asInterval(p.interval)),
    params,
  )
  .get('/bolletta/:interval', ({ params: p }) => service.bolletta(asInterval(p.interval)), params)
  .get('/casa/:interval', ({ params: p }) => service.casa(asInterval(p.interval)), params)
  .get('/tutto/:interval', ({ params: p }) => service.tutto(asInterval(p.interval)), params);
