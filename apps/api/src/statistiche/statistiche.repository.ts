import { sql } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { Interval, type Statistica } from '@gc/shared-types';

export const createStatisticheRepository = (db: typeof Db) => {
  const speseFrequenti = async (interval: Interval): Promise<Statistica[]> => {
    let whereCondition = sql``;
    if (interval === Interval.mese) whereCondition = sql`WHERE giorno > NOW() - interval '1 MONTH'`;
    else if (interval === Interval.anno)
      whereCondition = sql`WHERE giorno > NOW() - interval '1 YEAR'`;
    const result = await db.execute<Statistica>(sql`
      SELECT ts.descrizione AS name, SUM(a.costo) AS value
      FROM gc.andamento a JOIN gc.tipo_spesa ts ON a.tipo_spesa_id = ts.id
      ${whereCondition}
      GROUP BY ts.id, ts.descrizione
      ORDER BY value DESC
    `);
    return [...result] as Statistica[];
  };

  const statistics = async (interval: Interval, tipoSpesa?: number): Promise<Statistica[]> => {
    if (interval === Interval.mese) {
      const filter = tipoSpesa != null ? sql`= ${tipoSpesa}` : sql`in (1,2,3,5,7,9,13,16)`;
      const result = await db.execute<Statistica>(sql`
        with filtered_andamento as (
          select * from gc.andamento where gc.andamento.tipo_spesa_id ${filter}
        ),
        months as (
          select generate_series(min_month, max_month, '1 month') as month
          from (
            select date_trunc('year', min(giorno)) as min_month,
                   date_trunc('month', max(giorno)) as max_month
            from gc.andamento
          ) s
        )
        select to_char(date_trunc('month', m.month), 'YYYYMM') as name,
               coalesce(sum(costo), 0) as value
        from filtered_andamento
        right join months m on date_trunc('month', filtered_andamento.giorno) = m.month
        group by m.month
        order by m.month desc
        limit 48
      `);
      return [...result] as Statistica[];
    }
    if (interval === Interval.anno) {
      const filter = tipoSpesa != null ? sql`= ${tipoSpesa}` : sql`in (1,3,7,9,10,13,16)`;
      const result = await db.execute<Statistica>(sql`
        with filtered_andamento as (
          select * from gc.andamento where gc.andamento.tipo_spesa_id ${filter}
        ),
        years as (
          select generate_series(min_year, max_year, '1 year') as anno
          from (
            select date_trunc('year', min(giorno)) as min_year,
                   date_trunc('year', max(giorno)) as max_year
            from gc.andamento
          ) s
        )
        select to_char(date_trunc('year', y.anno), 'YYYY') as name,
               coalesce(sum(costo), 0) as value
        from filtered_andamento
        right join years y on date_trunc('year', filtered_andamento.giorno) = y.anno
        group by y.anno
        order by y.anno desc
      `);
      return [...result] as Statistica[];
    }
    return []; // Interval.tutto: original falls through to empty (preserved behavior)
  };

  return { speseFrequenti, statistics };
};
