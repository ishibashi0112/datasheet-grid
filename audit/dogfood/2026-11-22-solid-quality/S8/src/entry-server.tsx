import { createRequestEvent, generateHydrationScript, renderToStream, renderToString } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { App } from './App'

export type RenderMode = 'stream' | 'string'

/** 1 リクエストぶんを描く。stream は書き込み先へ流し、string は HTML を返す */
export function render(
  request: Request,
  mode: RenderMode,
  sink: { write: (chunk: string) => void; end: () => void },
): void | Promise<void> {
  const event = createRequestEvent(request)
  return provideRequestEvent(event, () => {
    if (mode === 'string') {
      const html = renderToString(() => <App />)
      sink.write(html)
      sink.end()
      return
    }
    renderToStream(() => <App />).pipe(sink)
  })
}

export const hydrationScript = () => generateHydrationScript()
