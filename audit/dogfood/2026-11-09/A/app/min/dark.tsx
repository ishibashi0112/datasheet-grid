// 最小再現: theme="dark" の列フィルターの検索欄の文字色(?css=layer|plain|none)
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

const mode = new URLSearchParams(location.search).get('css') ?? 'none'
if (mode === 'layer') await import('./tw-layer.css')
else if (mode === 'plain') await import('./tw-plain.css')
else await import('@ishibashi0112/spreadsheet-grid/style.css')

type Row = { id: number; kind: string }
const columns: GridColumn<Row>[] = [{ key: 'kind', title: '区分', width: 160, filterType: 'set' }]
function App() {
  const [rows, setRows] = useState<Row[]>([{ id: 1, kind: 'A' }, { id: 2, kind: 'B' }])
  return (
    <div style={{ background: '#111', padding: 16, height: 400 }}>
      <SpreadsheetGrid theme="dark" rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
