import { generateHydrationScript, renderToString } from '@solidjs/web'
import { App } from './app'
export function render(url = '') {
  return { html: renderToString(() => <App q={url} />), head: generateHydrationScript() }
}
