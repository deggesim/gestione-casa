import { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { IntervalValue } from '@gc/shared-types';
import { formatCosto } from '../andamento/list-utils';
import { IntervalRadio, type IntervalOption } from './IntervalRadio';
import { MediaTable } from './MediaTable';
import { useSpeseFrequenti, useTutto } from './queries';
import { mediaMensile, naturalColor } from './stats-utils';
import { useMediaQuery } from './useMediaQuery';

const OPTIONS: IntervalOption[] = [
  { value: 'M', label: 'Ultimo mese' },
  { value: 'Y', label: 'Ultimo anno' },
  { value: 'A', label: 'Tutto' },
];

export const SpeseFrequenti = () => {
  const [intervallo, setIntervallo] = useState<IntervalValue>('M');
  const torta = useSpeseFrequenti(intervallo);
  // Always yearly, and unaffected by the radio — the radio only drives the pie.
  const comuni = useTutto();
  // Legacy: labels on desktop only, legend on desktop or tablet.
  const showLabels = useMediaQuery('(min-width: 992px)');
  const showLegend = useMediaQuery('(min-width: 768px)');
  const rows = torta.data ?? [];

  return (
    <>
      <IntervalRadio legend="Range" options={OPTIONS} value={intervallo} onChange={setIntervallo} />
      <div className="torta">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              label={showLabels}
              isAnimationActive={false}
            >
              {rows.map((r, i) => (
                <Cell key={r.name} fill={naturalColor(i)} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [formatCosto(Number(value)), name]} />
            {showLegend ? <Legend layout="vertical" align="right" verticalAlign="middle" /> : null}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <MediaTable
        titolo="Media mensile spese comuni"
        sottotitolo="(spesa, carburante, auto, bollette, casa, gatti, condominio e Veronica)"
        rows={mediaMensile(comuni.data ?? [])}
      />
    </>
  );
};
