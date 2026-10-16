import { useEffect, useRef, useState } from 'react';
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
  formatCosto,
  formatGiorno,
  pageWindow,
  type ListSearch,
  type SortDir,
  type SortKey,
} from './list-utils';

const PAGE_SIZE = 10;
const FILTER_DEBOUNCE_MS = 300;

// The view state (page, filter, sort) lives in the URL: the parent passes it in and
// applies patches, so links are shareable and Back steps through pages.
type Props = {
  search: ListSearch;
  onSearchChange: (patch: Partial<ListSearch>, opts?: { replace?: boolean }) => void;
};

type Editing = { titolo: string; initial: FormValues } | null;

export const AndamentoList = ({ search, onSearchChange }: Props) => {
  const { data, isPlaceholderData } = useAndamentoList({ ...search, pageSize: PAGE_SIZE });
  const { data: tipiSpesa } = useTipoSpesaList();
  const save = useSaveAndamento();
  const remove = useDeleteAndamento();
  const pageRows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = data?.page ?? search.page;

  const [filtro, setFiltro] = useState(search.q);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<Andamento | null>(null);

  // The q this component last wrote to the URL. It tells "the URL caught up with what I
  // typed" (ignore) from "the URL changed under me, e.g. Back" (adopt): without it, a
  // late URL update would overwrite whatever the user typed in the meantime.
  const pushedQ = useRef(search.q);
  useEffect(() => {
    if (search.q === pushedQ.current) return;
    pushedQ.current = search.q;
    setFiltro(search.q);
  }, [search.q]);
  useEffect(() => {
    if (filtro === pushedQ.current) return;
    const t = setTimeout(() => {
      pushedQ.current = filtro;
      onSearchChange({ q: filtro, page: 1 }, { replace: true }); // replace: one entry per search, not per keystroke
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filtro, onSearchChange]);

  // The server clamps a page past the end (last row of the last page deleted, hand-edited
  // link): write the page it really served back to the URL. Placeholder data is the
  // PREVIOUS page, so its `page` says nothing about the one being fetched.
  useEffect(() => {
    if (data && !isPlaceholderData && data.page !== search.page)
      onSearchChange({ page: data.page }, { replace: true });
  }, [data, isPlaceholderData, search.page, onSearchChange]);

  const clearFiltro = () => {
    pushedQ.current = '';
    setFiltro('');
    onSearchChange({ q: '', page: 1 });
  };
  const goTo = (page: number) => onSearchChange({ page });
  const sortBy = (key: SortKey, dir: SortDir) => onSearchChange({ sort: key, dir, page: 1 });
  const active = (key: SortKey, dir: SortDir) => search.sort === key && search.dir === dir;
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
            onChange={(e) => setFiltro(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Pulisci filtro"
            onClick={clearFiltro}
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

      {total > PAGE_SIZE && (
        <Pagination className="justify-content-center" aria-label="Paginazione">
          <Pagination.First disabled={current === 1} onClick={() => goTo(1)} />
          <Pagination.Prev disabled={current === 1} onClick={() => goTo(current - 1)} />
          {pageWindow(current, pageCount).map((p) => (
            <Pagination.Item key={p} active={p === current} onClick={() => goTo(p)}>
              {p}
            </Pagination.Item>
          ))}
          <Pagination.Next disabled={current === pageCount} onClick={() => goTo(current + 1)} />
          <Pagination.Last disabled={current === pageCount} onClick={() => goTo(pageCount)} />
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
