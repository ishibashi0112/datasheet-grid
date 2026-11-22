import { hydrateRoot } from 'react-dom/client'
import { App } from './App'
import '@ishibashi0112/spreadsheet-grid/style.css'
hydrateRoot(document.getElementById('root')!, <App />)
