// <Loading> の中のグリッドに、親の最初の createEffect / onSettled から状態を戻す・末尾へスクロールする
//   ?when=effect | settled | initial(initialState prop)
import { render } from '@solidjs/web'
import { createEffect, createMemo, Loading, onSettled } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 100 },
]
const when = new URLSearchParams(location.search).get('when') ?? 'effect'
declare global { interface Window { grid?: SpreadsheetGridHandle<Row>; log: string[] } }
window.log = []
const fetchRows = async () => {
  await new Promise((r) => setTimeout(r, 600))
  return Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `品目${i + 1}`, qty: (i * 37) % 101 }))
}

function App() {
  const rows = createMemo(() => fetchRows())
  let grid!: SpreadsheetGridHandle<Row>
  const restore = () => {
    window.log.push(`${when}: handle=${typeof grid?.applyState}`)
    grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] })
    grid.scrollToBottom()
    window.log.push(`${when}: right after sort=${JSON.stringify(grid.getState().sort)}`)
  }
  if (when === 'effect') createEffect(() => true, restore)
  if (when === 'settled') onSettled(restore)
  // 行が来たときに戻す(行を読む effect)
  if (when === 'dataeffect') createEffect(() => rows().length, () => restore())
  return (
    <div style={{ padding: '12px' }}>
      <Loading fallback={<p id="loading">読み込み中…</p>}>
        <SpreadsheetGrid
          ref={(h) => { grid = h; window.grid = h }}
          rows={rows()}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          height={300}
          initialState={when === 'initial' ? { sort: [{ columnKey: 'qty', direction: 'desc' }] } : undefined}
        />
      </Loading>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
