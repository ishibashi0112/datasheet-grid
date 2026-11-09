// 最小再現: 絞り込み中の「すべての行を選択」→ 絞り込み解除 / 行の追加
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 200 }]
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: i < 3 ? `taxi ${i}` : `item ${i}` })))
  useEffect(() => { (window as any).__app = { grid: ref.current, rows } })
  return (
    <>
      <button id="add" onClick={() => setRows([...rows, { id: rows.length + 1, name: `new ${rows.length + 1}` }])}>行を追加</button>
      <SpreadsheetGrid ref={ref} rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} enableRowSelection={!location.search.includes("nosel")} />
    </>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
