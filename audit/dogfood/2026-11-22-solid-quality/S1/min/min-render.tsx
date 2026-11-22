// renderCell が呼ばれる回数と、ctx.isActive / ctx.rowIndex の追従(README「React 版との違い」)
import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
declare global { interface Window { calls: Record<string, number>; setCols?: (c: GridColumn<Row>[]) => void; cols: GridColumn<Row>[] } }
window.calls = {}
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'qty', title: 'Qty', width: 100 },
  {
    key: 'badge',
    title: 'Badge',
    width: 160,
    editable: false,
    renderCell: (ctx) => {
      window.calls[String(ctx.rowKey)] = (window.calls[String(ctx.rowKey)] ?? 0) + 1
      return (
        <span class="badge">
          {ctx.row.name}/{ctx.row.qty} r{ctx.rowIndex}
          {ctx.isActive ? ' ●' : ''}
        </span>
      )
    },
  },
]
window.cols = columns
function App() {
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, qty: i })))
  const [cols, setCols] = createSignal<GridColumn<Row>[]>(columns)
  window.setCols = setCols
  return (
    <SpreadsheetGrid
      rows={rows()}
      columns={cols()}
      onRowsChange={(n) => setRows(n)}
      onColumnsChange={(c) => setCols(c)}
      rowKeyGetter={(r) => r.id}
      height={400}
      ref={(h) => ((window as any).grid = h)}
    />
  )
}
render(() => <App />, document.getElementById('root')!)
