import 'bootswatch/dist/minty/bootstrap.min.css';
import './styles.css';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(<h1>Gestione Casa</h1>);
