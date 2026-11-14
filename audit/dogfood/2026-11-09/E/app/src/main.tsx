import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/mantine.css';
import { MantineProvider } from '@mantine/core';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light">
      <App />
    </MantineProvider>
  </StrictMode>,
);
