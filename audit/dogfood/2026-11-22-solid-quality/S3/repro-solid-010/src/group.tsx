// グループ化した表で、編集中に上へ行が足されるときの最小再現(Solid 版)
// window.__insertTop() で先頭(グループ A)に 1 行足す。?follows=row で activeCellFollows="row"
import { render } from '@solidjs/web'
import { createSignal, onSettled } from 'solid-js'
import { SpreadsheetGrid, type CellEditorContext, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: string; cat: string; name: string; qty: number | null; day: string; memo: string; city: string }
const cats = ['A', 'B', 'C']
const initial: Row[] = cats.flatMap((c) => Array.from({ length: 10 }, (_, i) => ({ id: `${c}${i + 1}`, cat: c, name: `${c} item ${i + 1}`, qty: i * 10, day: '2026-01-01', memo: '', city: `city-${c}${i + 1}` })))
const q = new URLSearchParams(location.search)
const w = window as any
w.__mounts = 0

function CityEditor(props: { ctx: CellEditorContext<Row> }) {
  let input!: HTMLInputElement
  w.__mounts++
  onSettled(() => { input.focus() })
  return (
    <input ref={input} data-testid="city-editor" value={props.ctx.initialText} style={{ width: '100%', height: '100%', 'box-sizing': 'border-box' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); props.ctx.commit(e.currentTarget.value, 'down') }
        if (e.key === 'Escape') { e.preventDefault(); props.ctx.cancel() }
      }} />
  )
}

const columns: GridColumn<Row>[] = [
  { key: 'cat', title: 'Cat', width: 80, rowGroup: true },
  { key: 'name', title: 'Name', width: 140 },
  { key: 'qty', title: 'Qty', width: 90, editor: { type: 'number' }, aggFunc: 'sum' },
  { key: 'day', title: 'Day', width: 130, editor: { type: 'date' } },
  { key: 'memo', title: 'Memo', width: 200, editor: { type: 'text', multiline: true } },
  { key: 'city', title: 'City', width: 140, editor: { type: 'custom', render: (ctx) => <CityEditor ctx={ctx} /> } },
]
let n = 0
function App() {
  const [rows, setRows] = createSignal(initial)
  w.__rows = rows
  w.__insertTop = () => setRows((prev) => [{ id: `N${++n}`, cat: 'A', name: `new ${n}`, qty: 1, day: '2026-02-02', memo: '', city: `new-${n}` }, ...prev])
  return (
    <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={(next) => setRows(next)} rowKeyGetter={(r) => r.id}
      activeCellFollows={q.get('follows') === 'row' ? 'row' : 'position'} height={700} />
  )
}
render(() => <App />, document.getElementById('root')!)
