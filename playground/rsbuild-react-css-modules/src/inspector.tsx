import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { InspectorApp } from './InspectorApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InspectorApp />
  </StrictMode>,
);
