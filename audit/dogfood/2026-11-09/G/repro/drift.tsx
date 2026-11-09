// 最小再現: 行数 × 行高が大きい(約 15,000,000px 超)表で、上へスクロールして読んでいる間に
// 末尾へ行を足すと、見ている行が流れていく(scrollTop は同じまま、表示の行が変わる)
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; text: string }
const N = Number(new URLSearchParams(location.search).get('rows') ?? 1_000_000)
const initial: Row[] = Array.from({ length: N }, (_, i) => ({ id: i + 1, text: `log line ${i + 1}` }))
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'id', width: 120 },
  { key: 'text', title: 'text', width: 300 },
]

function App() {
  const [rows, setRows] = useState(initial)
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  ;(window as any).__grid = ref
  return (
    <div>
      <button id="add" onClick={() => setRows((prev) => [...prev, ...Array.from({ length: 50 }, (_, i) => ({ id: prev.length + i + 1, text: `new ${prev.length + i + 1}` }))])}>
        末尾に 50 行足す
      </button>
      <div style={{ height: 500 }}>
        <SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={setRows} height="100%" />
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
