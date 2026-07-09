import { useMemo, useState } from 'react';
import { Pagination } from 'react-bootstrap';
import {
  FaChevronDown,
  FaChevronUp,
  FaCircleChevronDown,
  FaCircleChevronUp,
  FaXmark,
} from 'react-icons/fa6';
import { useAndamentoList } from './queries';
import {
  filterAndamenti,
  formatCosto,
  formatGiorno,
  pageWindow,
  sortAndamenti,
  type SortDir,
  type SortKey,
} from './list-utils';

const PAGE_SIZE = 10;

export const AndamentoList = () => {
  const { data } = useAndamentoList();
  const lista = data ?? [];

  const [filtro, setFiltro] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterAndamenti(lista, filtro), [lista, filtro]);
  const sorted = useMemo(
    () => (sortKey ? sortAndamenti(filtered, sortKey, sortDir) : filtered),
    [filtered, sortKey, sortDir],
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const sortBy = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  };
  const active = (key: SortKey, dir: SortDir) => sortKey === key && sortDir === dir;

  const sortIcons = (key: SortKey) => (
    <span className="ms-1">
      <span
        role="button"
        aria-label={`Ordina per ${key} crescente`}
        onClick={() => sortBy(key, 'asc')}
      >
        {active(key, 'asc') ? <FaCircleChevronUp /> : <FaChevronUp />}
      </span>{' '}
      <span
        role="button"
        aria-label={`Ordina per ${key} decrescente`}
        onClick={() => sortBy(key, 'desc')}
      >
        {active(key, 'desc') ? <FaCircleChevronDown /> : <FaChevronDown />}
      </span>
    </span>
  );

  return (
    <div className="mt-3">
      <div className="d-flex flex-wrap gap-2 pb-3 justify-content-center">
        <div className="input-group" style={{ maxWidth: 320 }}>
          <input
            type="text"
            className="form-control"
            placeholder="Filtro"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Pulisci filtro"
            onClick={() => {
              setFiltro('');
              setPage(1);
            }}
          >
            <FaXmark />
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover" aria-label="andamento">
          <thead>
            <tr>
              <th>Giorno {sortIcons('giorno')}</th>
              <th>Descrizione {sortIcons('descrizione')}</th>
              <th className="text-end">Costo {sortIcons('costo')}</th>
              <th>Tipo spesa</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => (
              <tr key={a.id}>
                <td>{formatGiorno(a.giorno)}</td>
                <td>{a.descrizione}</td>
                <td className="text-end">{formatCosto(a.costo)}</td>
                <td>{a.tipoSpesa.descrizione}</td>
                <td className="text-nowrap">{/* actions added in Task 5 */}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <Pagination className="justify-content-center" aria-label="Paginazione">
          <Pagination.First disabled={current === 1} onClick={() => setPage(1)} />
          <Pagination.Prev disabled={current === 1} onClick={() => setPage(current - 1)} />
          {pageWindow(current, pageCount).map((p) => (
            <Pagination.Item key={p} active={p === current} onClick={() => setPage(p)}>
              {p}
            </Pagination.Item>
          ))}
          <Pagination.Next disabled={current === pageCount} onClick={() => setPage(current + 1)} />
          <Pagination.Last disabled={current === pageCount} onClick={() => setPage(pageCount)} />
        </Pagination>
      )}
    </div>
  );
};
