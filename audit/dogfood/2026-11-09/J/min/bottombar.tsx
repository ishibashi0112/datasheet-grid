// 最小再現: 幅を決めた箱の中のグリッドで、数値の列を 4 セル選ぶ(?w=640)
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; amount: number }
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'No.', width: 80 },
  { key: 'amount', title: '金額', width: 140, editor: { type: 'number' } },
]
const w = Number(new URLSearchParams(location.search).get('w') ?? '640')

function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, amount: 3000000 + i * 1234 })))
  return (
    <div style={{ width: w, height: 400, padding: 8 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
