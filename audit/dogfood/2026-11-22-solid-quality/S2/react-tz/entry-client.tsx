import { hydrateRoot } from 'react-dom/client'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { App } from './app'
const theme = location.search.includes('theme=auto') ? 'auto' : 'light'
hydrateRoot(document.getElementById('app')!, <App theme={theme} />, { onRecoverableError: (e) => console.error('recoverable:', String(e).slice(0, 300)) })
