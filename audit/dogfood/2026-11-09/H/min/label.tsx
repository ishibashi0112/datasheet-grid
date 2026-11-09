// 比較: ラベル行をまたぐ貼り付け(ドキュメントでは「ラベル行を飛ばして続けて貼る」)
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; label?: string; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }]
const initial: Row[] = [
  { id: 1, name: 'a1' },
  { id: 2, name: 'a2' },
  { id: 9, label: 'B', name: '' },
  { id: 3, name: 'b1' },
  { id: 4, name: 'b2' },
]
function App() {
  const [rows, setRows] = useState(initial)
  ;(window as unknown as { __rows: Row[] }).__rows = rows
  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(r) => r.id}
      labelRow={{ isLabelRow: (r) => r.label !== undefined, getLabel: (r) => r.label ?? '' }}
    />
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
