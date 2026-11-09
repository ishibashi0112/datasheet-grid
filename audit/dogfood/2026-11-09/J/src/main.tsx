import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ishibashi0112/spreadsheet-grid/style.css'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
