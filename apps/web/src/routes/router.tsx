import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Layout } from '../layout/Layout';
import { LoginForm } from '../login/LoginForm';
import { HomePage } from './home.route';
import { requireAuth } from '../auth/require-auth';

const ErrorPage = () => <h2 className="mt-3">Pagina di errore</h2>;

// Code-based route tree (no file-based plugin — Bun-bundler compatible).
export const buildRouter = (queryClient: QueryClient) => {
  const rootRoute = createRootRoute({ component: Layout });

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginForm,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    beforeLoad: requireAuth(queryClient),
    component: HomePage,
  });
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

  const routeTree = rootRoute.addChildren([indexRoute, loginRoute, homeRoute, errorRoute]);
  return createRouter({ routeTree, defaultNotFoundComponent: ErrorPage });
};

// Type-safe navigation/links: register the concrete router type so `navigate({ to })`,
// `<Link to>` and `redirect({ to })` are checked against the real route paths.
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>;
  }
}
