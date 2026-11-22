// iframe の中のページ: ふつうに CSS を読み、同じ部品を描く
import { render } from '@solidjs/web'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import './widget.css'
import { StockWidget } from './StockWidget'

const params = new URLSearchParams(location.search)
render(
  () => (
    <div style={{ height: '100%', padding: '8px', 'box-sizing': 'border-box' }}>
      <StockWidget theme={(params.get('theme') as 'light' | 'dark' | null) ?? 'light'} onHandle={(h) => ((window as unknown as { grid: unknown }).grid = h)} />
    </div>
  ),
  document.getElementById('root')!,
)
