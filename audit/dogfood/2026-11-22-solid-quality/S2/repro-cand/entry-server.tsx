import { createRequestEvent, generateHydrationScript, renderToString } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { App } from './app'
export function render(url = '') {
  const app = () => <App q={url} />
  const html = url.includes('event')
    ? provideRequestEvent(createRequestEvent(new Request('http://localhost' + url)), () => renderToString(app))
    : renderToString(app)
  return { html, head: generateHydrationScript() }
}
