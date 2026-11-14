// 最小再現: 列メニューでグループ化を足した後に「列のリセット」を押すと、階層の順番が入れ替わる
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; dept: string; team: string; name: string }
const initialColumns: GridColumn<Row>[] = [
  { key: 'dept', title: '部署', width: 100, rowGroup: false },
  { key: 'team', title: 'チーム', width: 100, rowGroup: true },
  { key: 'name', title: '名前', width: 160 },
]
const rows: Row[] = [
  { id: 1, dept: '営業', team: 'A', name: 'a1' },
  { id: 2, dept: '開発', team: 'A', name: 'a2' },
  { id: 3, dept: '営業', team: 'B', name: 'b1' },
]
function App() {
  const [columns, setColumns] = useState(initialColumns)
  const hierarchy = columns.filter((c) => c.rowGroup).map((c) => c.title).join(' > ')
  return (
    <>
      <p id="hierarchy">{hierarchy}</p>
      <SpreadsheetGrid rows={rows} columns={columns} onColumnsChange={setColumns} rowKeyGetter={(r) => r.id} />
    </>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
