import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
type Row = { id: number; name: string; status: string }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'status', title: 'Status', width: 160, renderCell: (ctx) => (
    <div><span>{String(ctx.value)}</span><button data-testid="toggle" onClick={() => ctx.setValue(ctx.value === 'ok' ? 'ng' : 'ok')}>切替</button></div>
  ) },
]
declare global { interface Window { grid?: SpreadsheetGridHandle<Row> | null } }
function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, status: 'ok' })))
  return <SpreadsheetGrid ref={(h) => { window.grid = h }} rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={400} />
}
createRoot(document.getElementById('root')!).render(<App />)
