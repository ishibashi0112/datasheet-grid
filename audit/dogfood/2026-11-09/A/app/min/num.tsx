// 最小再現: number 列(mark / reject)への貼り付け
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; a: number | string | null; b: number | string | null }
const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'mark', width: 140, editor: { type: 'number', min: 0, integer: true } },
  { key: 'b', title: 'reject', width: 140, editor: { type: 'number', min: 0, integer: true }, validationMode: 'reject' },
]
function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 8 }, (_, i) => ({ id: i + 1, a: 1, b: 1 })))
  useEffect(() => { (window as any).__rows = rows })
  return <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
