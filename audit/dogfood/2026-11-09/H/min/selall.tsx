// 最小再現: 絞り込み中に「すべての行を選択」→ 絞り込みを外すと、見えていなかった行も選択に入る
import { StrictMode, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; kind: string }
const columns: GridColumn<Row>[] = [{ key: 'kind', title: '種類', width: 160 }]
const rows: Row[] = [
  { id: 1, kind: 'りんご' },
  { id: 2, kind: 'みかん' },
  { id: 3, kind: 'りんご' },
  { id: 4, kind: 'ぶどう' },
]
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  ;(window as unknown as { __grid: unknown }).__grid = ref
  return <SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} enableRowSelection />
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
