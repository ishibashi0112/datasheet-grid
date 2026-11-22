// React 版の比較: 書けるセルが 1 つも無い貼り付け
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; locked: boolean }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200 }]
declare global { interface Window { grid?: SpreadsheetGridHandle<Row> | null; changes: number } }
window.changes = 0
function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, locked: i % 2 === 1 })))
  return (
    <SpreadsheetGrid
      ref={(h) => { window.grid = h }}
      rows={rows}
      columns={columns}
      onRowsChange={(next) => { window.changes++; setRows(next) }}
      rowKeyGetter={(r) => r.id}
      canEditCell={(_r, _c, row) => !row.locked}
      onPasteSkipped={(p) => console.log('onPasteSkipped', p.cells.length)}
      height={400}
    />
  )
}
createRoot(document.getElementById('root')!).render(<App />)
