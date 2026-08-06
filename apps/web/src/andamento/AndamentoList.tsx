import { useMemo, useState } from 'react';
import { Modal, Pagination } from 'react-bootstrap';
import { toast } from 'sonner';
import {
  FaCar,
  FaChevronDown,
  FaChevronUp,
  FaCircleChevronDown,
  FaCircleChevronUp,
  FaClone,
  FaPencil,
  FaPlus,
  FaShower,
  FaCartShopping,
  FaXmark,
  FaTrash,
} from 'react-icons/fa6';
import type { Andamento, AndamentoInput } from '@gc/shared-types';
import {
  useAndamentoList,
  useDeleteAndamento,
  useSaveAndamento,
  useTipoSpesaList,
} from './queries';
import { AndamentoForm } from './AndamentoForm';
import {
  cloneForm,
  emptyForm,
  formFromAndamento,
  PREFILLS,
  prefillForm,
  type FormValues,
} from './prefills';
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

type Editing = { titolo: string; initial: FormValues } | null;

export const AndamentoList = () => {
  const { data } = useAndamentoList();
  const { data: tipiSpesa } = useTipoSpesaList();
  const save = useSaveAndamento();
  const remove = useDeleteAndamento();
  const lista = data ?? [];

  const [filtro, setFiltro] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<Andamento | null>(null);

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

  const onSubmit = (input: AndamentoInput) =>
    save.mutate(input, {
      onSuccess: () => {
        toast.success(input.id != null ? 'Modifica voce di spesa' : 'Nuova voce di spesa', {
          description:
            input.id != null
              ? 'Voce di spesa modificata correttamente'
              : 'Nuova voce di spesa inserita correttamente',
        });
        setEditing(null);
      },
    });

  const confirmDelete = () => {
    if (!toDelete?.id) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.warning('Voce di spesa eliminata', {
          description: 'La voce di spesa è stata eliminata correttamente',
        });
        setToDelete(null);
      },
    });
  };

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
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Nuova voce di spesa"
          title="Nuova voce di spesa"
          onClick={() => setEditing({ titolo: 'Nuova voce di spesa', initial: emptyForm() })}
        >
          <FaPlus />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Spesa"
          title="Spesa"
          onClick={() =>
            setEditing({ titolo: PREFILLS.spesa.titolo, initial: prefillForm(PREFILLS.spesa) })
          }
        >
          <FaCartShopping />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Carburante"
          title="Carburante"
          onClick={() =>
            setEditing({
              titolo: PREFILLS.carburante.titolo,
              initial: prefillForm(PREFILLS.carburante),
            })
          }
        >
          <FaCar />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Pulizie"
          title="Pulizie"
          onClick={() =>
            setEditing({
              titolo: PREFILLS.pulizie.titolo,
              initial: prefillForm(PREFILLS.pulizie),
            })
          }
        >
          <FaShower />
        </button>
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
                <td className="text-nowrap">
                  <button
                    type="button"
                    className="btn btn-warning btn-sm me-2"
                    aria-label="Modifica"
                    title="Modifica"
                    onClick={() =>
                      setEditing({
                        titolo: 'Modifica voce di spesa',
                        initial: formFromAndamento(a),
                      })
                    }
                  >
                    <FaPencil />
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm me-2"
                    aria-label="Clona"
                    title="Clona"
                    onClick={() =>
                      setEditing({ titolo: 'Clona voce di spesa', initial: cloneForm(a) })
                    }
                  >
                    <FaClone />
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    aria-label="Elimina"
                    title="Elimina"
                    onClick={() => setToDelete(a)}
                  >
                    <FaTrash />
                  </button>
                </td>
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

      <Modal show={editing !== null} onHide={() => setEditing(null)} size="lg" backdrop="static">
        <Modal.Header>
          <Modal.Title>{editing?.titolo}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editing && (
            <AndamentoForm
              titolo={editing.titolo}
              initial={editing.initial}
              tipiSpesa={tipiSpesa ?? []}
              submitting={save.isPending}
              onSubmit={onSubmit}
              onCancel={() => setEditing(null)}
            />
          )}
        </Modal.Body>
      </Modal>

      <Modal show={toDelete !== null} onHide={() => setToDelete(null)}>
        <Modal.Header>
          <Modal.Title>Elimina voce di spesa</Modal.Title>
        </Modal.Header>
        <Modal.Body>Confermi l&apos;eliminazione della voce di spesa?</Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-danger"
            onClick={confirmDelete}
            disabled={remove.isPending}
          >
            Elimina
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setToDelete(null)}>
            Annulla
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
