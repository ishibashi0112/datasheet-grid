// 親のページから、同じオリジンの空の iframe の document へ描く(react-frame-component のような形)
import { render } from '@solidjs/web'
import gridCss from '@ishibashi0112/spreadsheet-grid-solid/style.css?inline'
import widgetCss from './widget.css?inline'
import { StockWidget } from './StockWidget'

const frame = document.getElementById('pf') as HTMLIFrameElement
const doc = frame.contentDocument!
doc.open()
doc.write('<!doctype html><html lang="ja"><head><meta charset="UTF-8"></head><body style="margin:0;height:100%"><div id="root" style="height:100%"></div></body></html>')
doc.close()
doc.documentElement.style.height = '100%'
const style = doc.createElement('style')
style.textContent = gridCss + '\n' + widgetCss
doc.head.append(style)
const root = doc.getElementById('root')!
render(() => <StockWidget popupContainer={root} onHandle={(h) => ((window as unknown as { grid: unknown }).grid = h)} />, root)
