import { hydrate, render } from '@solidjs/web'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { App } from './app'
const el = document.getElementById('app')!
const q = location.search
if (q.includes('mode=render')) { el.textContent = ''; render(() => <App q={q} />, el) }
else if (q.includes('mode=late')) window.addEventListener('load', () => setTimeout(() => hydrate(() => <App q={q} />, el), 300))
else hydrate(() => <App q={q} />, el)
