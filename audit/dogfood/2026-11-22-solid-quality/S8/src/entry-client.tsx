import { hydrate } from '@solidjs/web'
import { App } from './App'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import './index.css'

hydrate(() => <App />, document.getElementById('root')!)
