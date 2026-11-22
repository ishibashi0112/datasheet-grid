// React 版で同じ形: fillHandle の表で、useOptimistic + startTransition の保存の間にセルの編集を始める
import { startTransition, useOptimistic, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

const q = new URLSearchParams(location.search)
type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 160, editable: true }]
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function App() {
  const [saved, setSaved] = useState<Row[]>(() => Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}` })))
  const [rows, setRows] = useOptimistic(saved)
  const save = (next: Row[]) =>
    startTransition(async () => {
      setRows(next)
      await wait(2000)
      startTransition(() => setSaved(next))
    })
  return (
    <div style={{ height: 400 }}>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={(next) => (q.get('timeout') === '1' ? setTimeout(() => save(next)) : save(next))}
        rowKeyGetter={(r) => r.id}
        height="100%"
        fillHandle={q.get('fh') !== '0'}
      />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
