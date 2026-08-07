import type { Statistica } from '@gc/shared-types';
import { formatCosto } from '../andamento/list-utils';

type Props = { titolo: string; sottotitolo?: string; rows: Statistica[] };

// Legacy: a two-column "Anno / Spesa" table under an h4, repeated five times
// across the statistiche screens.
export const MediaTable = ({ titolo, sottotitolo, rows }: Props) => (
  <>
    <h4 className="text-nowrap overflow-hidden">{titolo}</h4>
    {sottotitolo ? <h5>{sottotitolo}</h5> : null}
    <div className="table-responsive">
      <table className="table table-hover" aria-label={titolo}>
        <thead>
          <tr>
            <th scope="col">Anno</th>
            <th scope="col">Spesa</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{formatCosto(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);
