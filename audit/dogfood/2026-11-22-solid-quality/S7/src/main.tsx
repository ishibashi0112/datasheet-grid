import { render } from '@solidjs/web'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import './index.css'
import { Router } from './router'
import { Layout } from './Layout'

render(() => <Router>{(props) => <Layout>{props.children}</Layout>}</Router>, document.getElementById('root')!)
