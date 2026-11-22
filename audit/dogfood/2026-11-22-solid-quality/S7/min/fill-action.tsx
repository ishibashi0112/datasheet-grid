// 最小の再現: fillHandle の表で、action + createOptimistic の保存の間にセルの編集を始めると、
// FillHandleLayer の <Show> の中で「stale value」の例外が出る。
//   既定      … 境界なし: [REACTIVITY_HALTED] でアプリ全体が止まる
//   ?errored=1 … <Errored> で包む: 例外は出ず、エディタにフォーカスが入らないまま残り、以後編集できない
//   ?fh=0      … fillHandle を外すと起きない
import { action, createOptimistic, createSignal, Errored } from 'solid-js'
import { render } from '@solidjs/web'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

const q = new URLSearchParams(location.search)
type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 160, editable: true }]
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function App() {
  const [saved, setSaved] = createSignal<Row[]>(Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}` })))
  const [rows, setRows] = createOptimistic(() => saved())
  const save = action(function* (next: Row[]) {
    setRows(next) // 保存が終わるまで新しい値を見せる
    yield wait(2000) // サーバーへ保存
    setSaved(next)
  })
  return (
    <div style={{ height: '400px' }}>
      <SpreadsheetGrid
        rows={rows()}
        columns={columns}
        // 通知の中で action を始めると表が止まる(既知 S4-21)ので、通知の外で始める
        onRowsChange={(next) => setTimeout(() => save(next))}
        rowKeyGetter={(r) => r.id}
        height="100%"
        fillHandle={q.get('fh') !== '0'}
      />
    </div>
  )
}

render(
  () =>
    q.get('errored') === '1' ? (
      <Errored fallback={(e) => <p id="error">エラー: {String(e())}</p>}>
        <App />
      </Errored>
    ) : (
      <App />
    ),
  document.getElementById('root')!,
)
