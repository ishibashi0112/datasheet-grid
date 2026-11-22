// <stock-widget>: Shadow root の中へ Solid の部品を描くカスタム要素
import { render } from '@solidjs/web'
import gridCss from '@ishibashi0112/spreadsheet-grid-solid/style.css?inline'
import widgetCss from './widget.css?inline'
import { StockWidget } from './StockWidget'

export function defineStockWidget() {
  if (customElements.get('stock-widget')) return
  customElements.define(
    'stock-widget',
    class extends HTMLElement {
      #dispose: (() => void) | undefined
      connectedCallback() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
        const cssMode = this.getAttribute('css') ?? 'shadow' // shadow | document | both | none
        if (cssMode === 'shadow' || cssMode === 'both') {
          const style = document.createElement('style')
          style.textContent = gridCss + '\n' + widgetCss
          root.append(style)
        } else {
          const style = document.createElement('style')
          style.textContent = widgetCss
          root.append(style)
        }
        if ((cssMode === 'document' || cssMode === 'both') && !document.getElementById('ssg-doc-css')) {
          const style = document.createElement('style')
          style.id = 'ssg-doc-css'
          style.textContent = gridCss
          document.head.append(style)
        }
        // ポップアップを描く場所: 'auto'(既定)/ 'body' / 'shadow'(Shadow root の中の要素)
        const popup = this.getAttribute('popup') ?? 'auto'
        const popupHost = document.createElement('div')
        popupHost.className = 'popup-host'
        const mount = document.createElement('div')
        mount.className = 'mount'
        root.append(mount, popupHost)
        const theme = (this.getAttribute('theme') ?? 'light') as 'light' | 'dark' | 'auto'
        this.#dispose = render(
          () => (
            <StockWidget
              theme={theme}
              popupContainer={popup === 'shadow' ? popupHost : popup === 'body' ? 'body' : 'auto'}
              onHandle={(h) => ((this as unknown as { grid: unknown }).grid = h)}
            />
          ),
          mount,
        )
      }
      disconnectedCallback() {
        this.#dispose?.()
        this.#dispose = undefined
        this.shadowRoot?.replaceChildren()
      }
    },
  )
}
