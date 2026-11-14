// 最小再現: date / select 列への貼り付けと、グローバルフィルター
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; date: string | null; kind: string }
const OPTIONS = [
  { value: 'transport', label: '交通費' },
  { value: 'meal', label: '会議費' },
]
const columns: GridColumn<Row>[] = [
  { key: 'date', title: '日付', width: 140, editor: { type: 'date' } },
  {
    key: 'kind', title: '区分', width: 140,
    editor: { type: 'select', options: OPTIONS },
    valueFormatter: ({ value }) => OPTIONS.find((o) => o.value === value)?.label ?? String(value ?? ''),
  },
]

function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 8 }, (_, i) => ({ id: i + 1, date: '2026-10-01', kind: 'transport' })))
  useEffect(() => { (window as any).__app = { grid: ref.current, rows } })
  return <SpreadsheetGrid ref={ref} rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
