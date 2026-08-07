import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { IntervalValue } from '@gc/shared-types';
import { formatCosto } from '../andamento/list-utils';
import { IntervalRadio, type IntervalOption } from './IntervalRadio';
import { useStatistica, type StatisticaKind } from './queries';
import { formatEuroInt, formatMese, solarColor } from './stats-utils';

const OPTIONS: IntervalOption[] = [
  { value: 'M', label: 'Mensile' },
  { value: 'Y', label: 'Annuale' },
];

// The four legacy bar screens (spesa, carburante, bolletta, casa) were the same
// component with a different service call, so they collapse into this one.
export const BarreStatistica = ({ kind }: { kind: StatisticaKind }) => {
  const [intervallo, setIntervallo] = useState<IntervalValue>('M');
  const { data } = useStatistica(kind, intervallo);

  // Monthly names arrive as "YYYYMM" and are shown as "luglio 2026"; yearly ones
  // are already "YYYY". The legacy mutated the fetched objects in place — here the
  // formatting happens on the way to the chart.
  const rows = (data ?? []).map((r) => ({
    name: intervallo === 'M' ? formatMese(r.name) : r.name,
    value: r.value,
  }));
  const values = rows.map((r) => r.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  return (
    <>
      <IntervalRadio
        legend="Frequenza"
        options={OPTIONS}
        value={intervallo}
        onChange={setIntervallo}
      />
      {/* Monthly shows up to 48 bars, so the legacy gives it three viewport heights
          of scroll; yearly fits in one. */}
      <div
        className={intervallo === 'M' ? 'barre-orizzontali-mensile' : 'barre-orizzontali-annuale'}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 5, right: 30, bottom: 25, left: 20 }}
          >
            <XAxis
              type="number"
              tickFormatter={formatEuroInt}
              label={{ value: 'Importo', position: 'insideBottom', offset: -15 }}
            />
            {/* "Mese" even in yearly mode: the legacy template hardcodes it. */}
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              interval={0}
              label={{ value: 'Mese', angle: -90, position: 'insideLeft' }}
            />
            {/* Recharts types the formatter's value as ValueType | undefined
                (string | number | array), so coerce rather than annotate. */}
            <Tooltip formatter={(value) => formatCosto(Number(value))} />
            <Bar dataKey="value" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.name} fill={solarColor(r.value, min, max)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};
