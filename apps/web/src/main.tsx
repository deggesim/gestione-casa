import 'bootswatch/dist/minty/bootstrap.min.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createQueryClient } from './query/query-client';
import { buildRouter } from './routes/router';

// router ↔ queryClient cycle: the router's /home guard needs the queryClient
// (ensureQueryData), and the queryClient's 401 handler needs the router to
// redirect. The navigate closure captures `router` by reference and only reads
// it at error time — by which point it's assigned — so each is built once.
let router: ReturnType<typeof buildRouter>;
const queryClient = createQueryClient((path) => router.history.push(path));
router = buildRouter(queryClient);

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
