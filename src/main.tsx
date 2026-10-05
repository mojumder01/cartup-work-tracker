import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DashGate } from './components/DashGate';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DashGate>
      <App />
    </DashGate>
  </StrictMode>,
);
