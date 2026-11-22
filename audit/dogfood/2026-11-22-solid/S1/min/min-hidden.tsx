// 隠したタブ(display: none)の中で作ったグリッドを後から出す
import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'qty', title: 'Qty', width: 100, flex: 1 },
]
function App() {
  const [tab, setTab] = createSignal<'a' | 'b'>('a')
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, qty: i })))
  return (
    <div>
      <button id="ta" onClick={() => setTab('a')}>A</button>
      <button id="tb" onClick={() => setTab('b')}>B(グリッド)</button>
      <div style={{ display: tab() === 'a' ? 'block' : 'none' }}>タブ A</div>
      <div id="tabb" style={{ display: tab() === 'b' ? 'block' : 'none', height: '400px' }}>
        <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={(n) => setRows(n)} rowKeyGetter={(r) => r.id} height="100%" />
      </div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
