import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Toaster, toast } from 'sonner';
import { useTheme } from '../theme/useTheme';
import { useMe, useLogout } from '../auth/useAuth';
import { Spinner } from './Spinner';

// App shell: fixed navbar (brand → /home, theme toggle, logout when logged in) + routed outlet.
// Header kept minimal for 4a — statistiche dropdown / breadcrumb / profilo arrive in 4c/4d.
export const Layout = () => {
  const { isDark, toggle } = useTheme();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

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
        <div className="ms-auto d-flex gap-2">
          <button
            className="btn btn-outline-light btn-sm"
            onClick={toggle}
            aria-label="Cambia tema"
          >
            {isDark ? '☀' : '☾'}
          </button>
          {me.data ? (
            <button className="btn btn-outline-light btn-sm" onClick={onLogout}>
              Logout
            </button>
          ) : null}
        </div>
      </nav>
      <div className="container-fluid">
        <Outlet />
      </div>
      <Spinner />
      <Toaster richColors position="top-right" />
    </>
  );
};
