// 最小再現: <Show> でグリッドを出し入れする。
//   ?mode=grid  clientSide 100 行 / ?mode=ssrm serverSide(ブラウザ内の擬似データ 50,000 行)/ ?mode=table 素の <table>(比較用)
import { render } from '@solidjs/web'
import { createSignal, For, Show } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type ServerSideDataSource } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item ${i}`, qty: i * 3 }))
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 200, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100 },
]
const allRows: Row[] = Array.from({ length: 50_000 }, (_, i) => ({ id: i, name: `item ${i}`, qty: i * 3 }))
const dataSource: ServerSideDataSource<Row> = {
  getRows: async ({ startIndex, endIndex, query }) => {
    await new Promise((r) => setTimeout(r, 30))
    const g = query.globalText ?? ''
    const t = (query.columnFilters?.name as { value?: string } | undefined)?.value ?? ''
    const all = allRows.filter((r) => (!g || r.name.includes(g)) && (!t || r.name.includes(t)))
    return { rows: all.slice(startIndex, endIndex), totalRowCount: all.length }
  },
  updateRows: async () => {},
  initialRowCount: 50_000,
}
const mode = new URLSearchParams(location.search).get('mode') ?? 'grid'
const mode2 = new URLSearchParams(location.search).get('notify') ? 'notify' : ''

function App() {
  const [on, setOn] = createSignal(true)
  const [lastFilter, setLastFilter] = createSignal('')
  return (
    <div>
      <button id="toggle" onClick={() => setOn((v) => !v)}>toggle</button>
      <Show when={on()}>
        {mode === 'table' ? (
          <table>
            <tbody>
              <For each={rows.slice(0, 30)}>{(r) => <tr><td>{r.id}</td><td>{r.name}</td><td>{r.qty}</td></tr>}</For>
            </tbody>
          </table>
        ) : mode === 'ssrm' ? (
          <div style={{ height: '400px' }}>
            <p id="last">{lastFilter()}</p>
            <SpreadsheetGrid
              dataSource={dataSource}
              columns={columns}
              rowKeyGetter={(r) => r.id}
              height="100%"
              onFiltersChange={(f) => (mode2 === 'notify' ? setLastFilter(JSON.stringify(f)) : undefined)}
            />
          </div>
        ) : (
          <div style={{ height: '400px' }}>
            <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height="100%" />
          </div>
        )}
      </Show>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
