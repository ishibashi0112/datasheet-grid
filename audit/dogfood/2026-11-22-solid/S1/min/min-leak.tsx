// 最小再現: <Show> でグリッドを出し入れするたびにヒープが増えるか
//   ?grid=0 でグリッドの代わりに同じ行数の <table> を出す(比較用)
import { render } from '@solidjs/web'
import { createSignal, Show, For } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'qty', title: 'Qty', width: 100 },
]
const useGrid = new URLSearchParams(location.search).get('grid') !== '0'

function Page() {
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, qty: i })))
  return useGrid ? (
    <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={(n) => setRows(n)} rowKeyGetter={(r) => r.id} height={400} />
  ) : (
    <table><tbody><For each={rows().slice(0, 30)}>{(r) => <tr class="ssg-body-cell" style="position:static"><td>{r.name}</td></tr>}</For></tbody></table>
  )
}

function App() {
  const [shown, setShown] = createSignal(true)
  return (
    <div>
      <button id="toggle" onClick={() => setShown((v) => !v)}>toggle</button>
      <Show when={shown()}>
        <Page />
      </Show>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
