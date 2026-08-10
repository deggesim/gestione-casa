import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { Crumb } from '../layout/breadcrumbs';
import { Layout } from '../layout/Layout';
import { LoginForm } from '../login/LoginForm';
import { HomePage } from './home.route';
import { requireAuth } from '../auth/require-auth';
import { SpeseMedie } from '../statistiche/SpeseMedie';
import { BarreStatistica } from '../statistiche/BarreStatistica';
import { SpeseFrequenti } from '../statistiche/SpeseFrequenti';

const ErrorPage = () => <h2 className="mt-3">Pagina di errore</h2>;

// The four bar screens share a route shape but not a breadcrumb label. "Bollette" is
// plural on a singular route: the same legacy quirk the navbar already carries.
const BARRE_LABELS = {
  spesa: 'Spesa',
  carburante: 'Carburante',
  bolletta: 'Bollette',
  casa: 'Casa',
} as const;

// Code-based route tree (no file-based plugin — Bun-bundler compatible).
export const buildRouter = (queryClient: QueryClient) => {
  const rootRoute = createRootRoute({ component: Layout });

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginForm,
    staticData: { crumbs: [{ label: 'Login' }] },
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    beforeLoad: requireAuth(queryClient),
    component: HomePage,
    staticData: { crumbs: [{ label: 'Home' }] },
  });
  // Statistiche routes are flat siblings, not nested: in the legacy the parent
  // hid its own tables whenever a child was active, so there is nothing to share.
  const statisticheRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/statistiche',
    beforeLoad: requireAuth(queryClient),
    component: SpeseMedie,
    staticData: { crumbs: [{ label: 'Spese medie' }] },
  });
  const speseFrequentiRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/statistiche/spese-frequenti',
    beforeLoad: requireAuth(queryClient),
    component: SpeseFrequenti,
    // "Spese frequenti", not the legacy's "Lista": the label now matches the menu entry.
    staticData: {
      crumbs: [{ label: 'Spese medie', to: '/statistiche' }, { label: 'Spese frequenti' }],
    },
  });
  // The four bar screens differ only by which endpoint they read.
  const barreRoutes = (['spesa', 'carburante', 'bolletta', 'casa'] as const).map((kind) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: `/statistiche/${kind}`,
      beforeLoad: requireAuth(queryClient),
      component: () => <BarreStatistica kind={kind} />,
      staticData: {
        crumbs: [{ label: 'Spese medie', to: '/statistiche' }, { label: BARRE_LABELS[kind] }],
      },
    }),
  );
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/home' });
    },
  });
  const errorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/error',
    component: ErrorPage,
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    loginRoute,
    homeRoute,
    statisticheRoute,
    speseFrequentiRoute,
    ...barreRoutes,
    errorRoute,
  ]);
  return createRouter({ routeTree, defaultNotFoundComponent: ErrorPage });
};

// Type-safe navigation/links: register the concrete router type so `navigate({ to })`,
// `<Link to>` and `redirect({ to })` are checked against the real route paths.
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>;
  }
  // Every route declares its own full breadcrumb chain; see layout/breadcrumbs.ts.
  interface StaticDataRouteOption {
    crumbs?: Crumb[];
  }
}
