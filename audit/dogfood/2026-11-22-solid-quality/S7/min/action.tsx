// 最小の再現: action が終わるまでの間にセルの編集を始めると、エディタにフォーカスが入らない
//   ?v=unrelated … ボタンで始める action は行と関係のない optimistic の印だけを書く
//   ?fh=1        … fillHandle を付ける(付けると再現する)
//   ?v=rows      … onRowsChange の後(setTimeout)に action で optimistic の行を書く
import { action, createOptimistic, createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, editable: true },
  { key: 'qty', title: 'Qty', width: 100, editable: true, editor: { type: 'number' } },
]
const q = new URLSearchParams(location.search)
const v = q.get('v') ?? 'unrelated'
const fh = q.get('fh') === '1'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function App() {
  const [base, setBase] = createSignal<Row[]>(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, qty: i })))
  const [rows, setOptimisticRows] = createOptimistic(() => base())
  const [busy, setBusy] = createOptimistic(false)

  const work = action(function* () {
    setBusy(true)
    yield wait(2000)
  })
  const save = action(function* (next: Row[]) {
    setBusy(true)
    setOptimisticRows(next)
    yield wait(2000)
    setBase(next)
  })

  return (
    <div style={{ padding: '8px' }}>
      <button id="work" onClick={() => work()}>2 秒の action</button>
      <span id="busy">{busy() ? '処理中' : '待機'}</span>
      <div style={{ height: '400px' }}>
        <SpreadsheetGrid
          rows={v === 'rows' ? rows() : base()}
          columns={columns}
          onRowsChange={(next) => {
            if (v === 'rows') setTimeout(() => save(next), 0)
            else setBase(next)
          }}
          rowKeyGetter={(r) => r.id}
          height="100%"
          fillHandle={fh}
        />
      </div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
