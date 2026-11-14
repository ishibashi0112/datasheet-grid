import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@ishibashi0112/spreadsheet-grid/style.css'
import '@ishibashi0112/spreadsheet-grid/themes/heroui.css'
import './shift.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
