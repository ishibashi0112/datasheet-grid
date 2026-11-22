import { generateHydrationScript, renderToStream, renderToString, createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { App } from './App'

// ?stream=1 のときは renderToStream(全部そろうまで待つ形)で描く
export async function render(request: Request) {
  const event = createRequestEvent(request)
  const stream = new URL(request.url).searchParams.has('stream')
  // 確かめ用: ?noevent で provideRequestEvent を使わない
  if (new URL(request.url).searchParams.has('noevent')) return { html: renderToString(() => <App />), head: generateHydrationScript() }
  const html = stream
    ? await provideRequestEvent(event, () => renderToStream(() => <App />))
    : provideRequestEvent(event, () => renderToString(() => <App />))
  return { html, head: generateHydrationScript() }
}
