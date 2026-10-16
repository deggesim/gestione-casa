import { getRouteApi } from '@tanstack/react-router';
import { AndamentoList } from '../andamento/AndamentoList';
import { compactSearch, DEFAULT_SEARCH } from '../andamento/list-utils';

// getRouteApi, not an import of the route: router.tsx imports this file, so referencing
// the route object here would be circular. The path is checked against the Register type.
const route = getRouteApi('/home');

// The Andamento list is the home screen (legacy: path 'home' -> ListaComponent).
// Its view state (page, filter, sort) is the route's search params, so a link reproduces
// the exact view and Back steps through pages.
export const HomePage = () => {
  const raw = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <AndamentoList
      search={{ ...DEFAULT_SEARCH, ...raw }}
      onSearchChange={(patch, opts) =>
        navigate({
          // `prev` (not the render-time search) so two patches in a row never clobber each other
          search: (prev) => compactSearch({ ...DEFAULT_SEARCH, ...prev, ...patch }),
          ...opts,
        })
      }
    />
  );
};
