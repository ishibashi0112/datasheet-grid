// 編集中に rows を別のキーの行へ丸ごと差し替える(プロジェクトの切り替え)
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: string; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 160, editable: true }]
const make = (p: string) => Array.from({ length: 10 }, (_, i) => ({ id: `${p}-${i + 1}`, name: `${p} ${i + 1}` }))
const changes: string[] = []
;(window as any).__changes = changes

function App() {
  const [rows, setRows] = useState<Row[]>(() => make('web'))
  ;(window as any).__swap = () => setRows(make('app'))
  return (
    <div style={{ height: 400 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={(n) => { changes.push(JSON.stringify(n.slice(0, 3))); setRows(n) }} rowKeyGetter={(r) => r.id} height="100%" />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
