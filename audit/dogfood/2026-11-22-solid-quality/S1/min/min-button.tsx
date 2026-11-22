import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
type Row = { id: number; name: string; status: string }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'status', title: 'Status', width: 160, renderCell: (ctx) => (
    <div><span>{String(ctx.value)}</span><button data-testid="toggle" onClick={() => ctx.setValue(ctx.value === 'ok' ? 'ng' : 'ok')}>切替</button></div>
  ) },
]
declare global { interface Window { grid?: SpreadsheetGridHandle<Row> } }
function App() {
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, status: 'ok' })))
  return <SpreadsheetGrid ref={(h) => (window.grid = h)} rows={rows()} columns={columns} onRowsChange={(n) => setRows(n)} rowKeyGetter={(r) => r.id} height={400} />
}
render(() => <App />, document.getElementById('root')!)
