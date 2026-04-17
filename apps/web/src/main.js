import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
const rootEl = document.getElementById('root');
if (!rootEl)
    throw new Error('Root element not found');
createRoot(rootEl).render(_jsx(App, {}));
