// 開発時の Solid の診断(EFFECT_RELAY_TEAR / EFFECT_WRITES_OWN_SOURCE)がグリッドの中の effect から出る最小再現
// ?case=follow : activeCellFollows="row" + 並べ替え中に値が変わる
// ?case=edit   : 編集中に rows が変わる(並べ替えなし)
// ?case=editsort : 並べ替え中に編集し、打っている間に行が動く
// ?case=auto   : autoHeight の列 + 行を足す
// ?case=autotail : autoHeight の列 + 行を足して scrollToBottom()
import { render } from '@solidjs/web'
import { createSignal, onSettled } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; value: number; note: string }
const kase = new URLSearchParams(location.search).get('case') ?? 'follow'
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120, editable: false },
  { key: 'value', title: 'Value', width: 100, editable: false },
  { key: 'note', title: 'Note', width: 200, autoHeight: kase.startsWith('auto') },
]
let seed = 1
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const make = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `row ${i + 1}`, value: Math.round(rnd() * 1000), note: i % 3 === 0 ? 'long text '.repeat(8) : '' }))

function App() {
  const [rows, setRows] = createSignal<Row[]>(make(kase.startsWith('auto') ? 2000 : 50))
  let grid: SpreadsheetGridHandle<Row> | undefined
  onSettled(() => {
    const id = setInterval(() => {
      if (kase.startsWith('auto')) {
        setRows((prev) => [...prev, ...make(3).map((r, i) => ({ ...r, id: prev.length + i + 1 }))])
        if (kase === 'autotail') queueMicrotask(() => grid?.scrollToBottom())
      }
      else setRows((prev) => prev.map((r) => (rnd() < 0.3 ? { ...r, value: Math.round(rnd() * 1000) } : r)))
    }, 250)
    return () => clearInterval(id)
  })
  return (
    <SpreadsheetGrid
      rows={rows()}
      onRowsChange={setRows}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      ref={(h) => (grid = h)}
      activeCellFollows={kase === 'follow' || kase === 'editsort' ? 'row' : 'position'}
      initialState={kase === 'follow' || kase === 'editsort' ? { sort: [{ columnKey: 'value', direction: 'desc' }] } : undefined}
      height="100%"
    />
  )
}
render(() => <App />, document.getElementById('root')!)
