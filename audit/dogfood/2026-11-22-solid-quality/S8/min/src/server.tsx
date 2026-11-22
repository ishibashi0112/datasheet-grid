import { generateHydrationScript, renderToString } from '@solidjs/web'
import { App } from './App'
export const render = () => renderToString(() => <App />)
export const hydrationScript = () => generateHydrationScript()
