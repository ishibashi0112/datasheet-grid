// 最小再現: 行グルーピング中に、グループ行をまたいで複数行を貼り付ける
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; team: string; name: string }
const columns: GridColumn<Row>[] = [
  { key: 'team', title: 'チーム', width: 100, rowGroup: true },
  { key: 'name', title: '名前', width: 160 },
]
const initial: Row[] = [
  { id: 1, team: 'A', name: 'a1' },
  { id: 2, team: 'A', name: 'a2' },
  { id: 3, team: 'B', name: 'b1' },
  { id: 4, team: 'B', name: 'b2' },
]
function App() {
  const [rows, setRows] = useState(initial)
  ;(window as unknown as { __rows: Row[] }).__rows = rows
  return <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
