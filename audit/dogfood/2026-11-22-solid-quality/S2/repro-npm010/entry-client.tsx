import { hydrate } from '@solidjs/web'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { App } from './app'
hydrate(() => <App q={location.search} />, document.getElementById('app')!)
