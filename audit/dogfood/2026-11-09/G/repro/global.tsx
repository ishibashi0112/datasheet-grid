// 最小再現: 50,000 行を超える表で、グローバルフィルターを「A で絞る → 消す → B を入れる」と、
// B の絞り込みが終わるまでの間、消したはずの A の結果が表示される
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; text: string }
const N = Number(new URLSearchParams(location.search).get('rows') ?? 300_000)
const rows: Row[] = Array.from({ length: N }, (_, i) => ({ id: i + 1, text: i % 7 === 0 ? `apple ${i}` : i % 11 === 0 ? `banana ${i}` : `cherry ${i}` }))
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'id', width: 120 },
  { key: 'text', title: 'text', width: 300 },
]
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ height: 500 }}>
      <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height="100%" />
    </div>
  </StrictMode>,
)
