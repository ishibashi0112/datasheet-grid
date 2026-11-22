import { renderToString } from 'react-dom/server'
import { App } from './app'
export function render(url: string) {
  const theme = url.includes('theme=auto') ? 'auto' : 'light'
  return { html: renderToString(<App theme={theme} />), head: '' }
}
