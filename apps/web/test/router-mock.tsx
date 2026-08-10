import type { ReactNode } from 'react';

// Shared because `mock.module` is process-global in Bun: whichever test file registers
// last wins for the whole run, so two files mocking '@tanstack/react-router' with
// different shapes leave the other one with missing exports. One definition, imported by
// both, makes that impossible — this is the failure mode the sonner mock hit in Fase 4b.
//
// Everything except `to` is forwarded to the span, so assertions see what the real Link
// would render: onClick (the navbar closes the mobile menu from the entries' handlers)
// and aria-label (the brand is an icon, so that is its only accessible name).
export const routerMock = () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string }) => (
    <span {...rest}>{children}</span>
  ),
  Outlet: () => null,
  useNavigate: () => () => {},
  useMatches: () => [],
});
