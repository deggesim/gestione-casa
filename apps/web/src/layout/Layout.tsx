import { Fragment, useState } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Modal } from 'react-bootstrap';
import {
  FaChartPie,
  FaCircleUser,
  FaHouse,
  FaMoon,
  FaRightFromBracket,
  FaSun,
} from 'react-icons/fa6';
import { Toaster, toast } from 'sonner';
import { useSwUpdate } from '../pwa/useSwUpdate';
import { useTheme } from '../theme/useTheme';
import { useMe, useLogout } from '../auth/useAuth';
import { ProfiloModal } from '../utente/ProfiloModal';
import { Breadcrumb } from './Breadcrumb';
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
// and logout when logged in) + breadcrumb + routed outlet.
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
  // Hand-rolled like the dropdown above, and for the same reason: react-bootstrap's
  // Navbar mounts Popper, which is awkward to assert on under happy-dom.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => {
    setNavOpen(false);
    setStatsOpen(false);
  };
  const update = useSwUpdate();

  const onLogout = () => {
    closeNav();
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.warning('Logout effettuato correttamente');
        void navigate({ to: '/login' });
      },
    });
  };

  return (
    <>
      <nav className="navbar navbar-expand-sm navbar-dark bg-primary fixed-top px-3">
        <Link className="navbar-brand" to={me.data ? '/home' : '/login'} aria-label="Gestione Casa">
          <FaHouse />
        </Link>
        {/* Outside the collapse on purpose. The legacy carried two copies of this button
            (d-sm-none next to the brand, d-none d-sm-block inside the collapse) and put the
            second one inside its isLoggedIn block, which left the login page with no theme
            toggle at all above the sm breakpoint. One always-visible button covers every
            width and every auth state; the trade-off is that on desktop it sits next to the
            brand rather than at the far right. */}
        <button className="btn btn-outline-light btn-sm" onClick={toggle} aria-label="Cambia tema">
          {isDark ? <FaSun /> : <FaMoon />}
        </button>
        {me.data ? (
          <button
            type="button"
            className="navbar-toggler"
            aria-label="Apri il menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="navbar-toggler-icon" />
          </button>
        ) : null}
        <div className={`collapse navbar-collapse${navOpen ? ' show' : ''}`}>
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
                        <Link className="dropdown-item" to={l.to} onClick={closeNav}>
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
            {me.data ? (
              <>
                <button
                  className="btn btn-outline-light btn-sm"
                  onClick={() => {
                    closeNav();
                    setProfiloOpen(true);
                  }}
                >
                  <FaCircleUser className="me-2" />
                  Profilo Utente
                </button>
                <button className="btn btn-outline-light btn-sm" onClick={onLogout}>
                  <FaRightFromBracket className="me-2" />
                  Logout
                </button>
              </>
            ) : null}
          </div>
        </div>
      </nav>
      <Breadcrumb />
      <div className="container-fluid">
        <Outlet />
      </div>
      <Spinner />
      <Toaster richColors position="top-right" />

      {/* Mounted only while open, like AndamentoForm: Layout is the root route's shell, so
          anything rendered unconditionally here mounts once — before login — and never
          again. react-hook-form reads defaultValues on its first render only, so a
          permanently mounted ProfiloModal would capture an empty email forever. */}
      {profiloOpen && <ProfiloModal show onHide={() => setProfiloOpen(false)} />}

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
