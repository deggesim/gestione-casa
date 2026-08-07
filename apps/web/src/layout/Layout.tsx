import { Fragment, useState } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Modal } from 'react-bootstrap';
import { FaChartPie } from 'react-icons/fa6';
import { Toaster, toast } from 'sonner';
import { useSwUpdate } from '../pwa/useSwUpdate';
import { useTheme } from '../theme/useTheme';
import { useMe, useLogout } from '../auth/useAuth';
import { ProfiloModal } from '../utente/ProfiloModal';
import { Spinner } from './Spinner';

// Legacy header dropdown. Note that "Bollette" (plural label) points at the
// singular /statistiche/bolletta route — that mismatch exists in the original.
const STAT_LINKS = [
  { to: '/statistiche', label: 'Spese medie' },
  { to: '/statistiche/spese-frequenti', label: 'Spese frequenti' },
  { to: '/statistiche/spesa', label: 'Spesa' },
  { to: '/statistiche/carburante', label: 'Carburante' },
  { to: '/statistiche/bolletta', label: 'Bollette' },
  { to: '/statistiche/casa', label: 'Casa' },
] as const;

// App shell: fixed navbar (brand → /home, statistiche menu, theme toggle, profilo
// and logout when logged in) + routed outlet. Breadcrumb arrives with Task 6.
export const Layout = () => {
  const { isDark, toggle } = useTheme();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  // Hand-rolled Bootstrap dropdown rather than react-bootstrap's NavDropdown: the
  // rest of this navbar is plain markup, and NavDropdown mounts Popper, which makes
  // the menu awkward to assert on under happy-dom.
  const [statsOpen, setStatsOpen] = useState(false);
  const [profiloOpen, setProfiloOpen] = useState(false);
  const update = useSwUpdate();

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.warning('Logout effettuato correttamente');
        void navigate({ to: '/login' });
      },
    });

  return (
    <>
      <nav className="navbar navbar-expand-sm navbar-dark bg-primary fixed-top px-3">
        <Link className="navbar-brand" to={me.data ? '/home' : '/login'}>
          Gestione Casa
        </Link>
        {me.data ? (
          <ul className="navbar-nav">
            <li className="nav-item dropdown">
              <button
                type="button"
                className="nav-link dropdown-toggle btn btn-link text-white"
                aria-expanded={statsOpen}
                onClick={() => setStatsOpen((open) => !open)}
              >
                <FaChartPie className="me-2" />
                Statistiche
              </button>
              <ul className={`dropdown-menu${statsOpen ? ' show' : ''}`}>
                {STAT_LINKS.map((l, i) => (
                  <Fragment key={l.to}>
                    {i === 1 ? (
                      <li>
                        <hr className="dropdown-divider" />
                      </li>
                    ) : null}
                    <li>
                      <Link className="dropdown-item" to={l.to} onClick={() => setStatsOpen(false)}>
                        {l.label}
                      </Link>
                    </li>
                  </Fragment>
                ))}
              </ul>
            </li>
          </ul>
        ) : null}
        <div className="ms-auto d-flex gap-2">
          <button
            className="btn btn-outline-light btn-sm"
            onClick={toggle}
            aria-label="Cambia tema"
          >
            {isDark ? '☀' : '☾'}
          </button>
          {me.data ? (
            <>
              <button className="btn btn-outline-light btn-sm" onClick={() => setProfiloOpen(true)}>
                Profilo Utente
              </button>
              <button className="btn btn-outline-light btn-sm" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : null}
        </div>
      </nav>
      <div className="container-fluid">
        <Outlet />
      </div>
      <Spinner />
      <Toaster richColors position="top-right" />

      <ProfiloModal show={profiloOpen} onHide={() => setProfiloOpen(false)} />

      <Modal show={update.updateReady} onHide={update.dismiss}>
        <Modal.Header>
          <Modal.Title>Aggiornamento app disponibile</Modal.Title>
        </Modal.Header>
        <Modal.Footer>
          <button type="button" className="btn btn-primary" onClick={update.applyUpdate}>
            Aggiorna
          </button>
          <button type="button" className="btn btn-secondary" onClick={update.dismiss}>
            Annulla
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
