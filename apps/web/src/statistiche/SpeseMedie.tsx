import { MediaTable } from './MediaTable';
import { useStatistica, type StatisticaKind } from './queries';
import { mediaMensile } from './stats-utils';

// One child component per series: each needs its own hook, and hooks can't be
// called from inside a map in the parent.
const MediaSerie = ({ kind, titolo }: { kind: StatisticaKind; titolo: string }) => {
  const { data } = useStatistica(kind, 'Y');
  return (
    <div className="col-md-6">
      <MediaTable titolo={titolo} rows={mediaMensile(data ?? [])} />
    </div>
  );
};

// Titles copied verbatim from the legacy StatisticheComponent template.
const SERIE: { kind: StatisticaKind; titolo: string }[] = [
  { kind: 'bolletta', titolo: 'Media bolletta mensile' },
  { kind: 'spesa', titolo: 'Media spesa mensile' },
  { kind: 'carburante', titolo: 'Media carburante mensile' },
  { kind: 'casa', titolo: 'Media casa mensile' },
];

// Legacy /statistiche landing page: four yearly series shown as monthly averages.
export const SpeseMedie = () => (
  <div className="row">
    {SERIE.map((s) => (
      <MediaSerie key={s.kind} kind={s.kind} titolo={s.titolo} />
    ))}
  </div>
);
