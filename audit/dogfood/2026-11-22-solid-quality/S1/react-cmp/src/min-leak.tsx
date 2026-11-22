// React 版の比較: グリッドを出し入れするたびにヒープが増えるか
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'qty', title: 'Qty', width: 100 },
]
function Page() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, qty: i })))
  return <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={400} />
}
function App() {
  const [shown, setShown] = useState(true)
  return (
    <div>
      <button id="toggle" onClick={() => setShown((v) => !v)}>toggle</button>
      {shown && <Page />}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
