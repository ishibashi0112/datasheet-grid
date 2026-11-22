import { render } from '@solidjs/web'
import { App } from './App'
import { GroupApp } from './GroupApp'
import './index.css'

const grid = new URLSearchParams(location.search).get('grid')
render(() => (grid === 'group' ? <GroupApp /> : <App />), document.getElementById('root')!)
