// <Show> でグリッドを出し入れしたときの ref
import { render } from '@solidjs/web'
import { createEffect, createSignal, Show } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200, editable: true },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
]
const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `品目${i + 1}`, qty: i }))

declare global {
  interface Window {
    log: string[]
    handles: SpreadsheetGridHandle<Row>[]
    current: () => SpreadsheetGridHandle<Row> | undefined
    toggle: () => void
    rows: () => Row[]
    setRows: (r: Row[]) => void
  }
}
window.log = []
window.handles = []

function App() {
  const [visible, setVisible] = createSignal(new URLSearchParams(location.search).has('visible'))
  const [rows, setRows] = createSignal<Row[]>(make(300))
  let grid!: SpreadsheetGridHandle<Row>
  window.current = () => grid
  window.toggle = () => setVisible((v) => !v)
  window.rows = () => rows()
  window.setRows = (r) => setRows(r)
  // 出したときに保存した位置へ戻す(README: ハンドルは最初の createEffect より前に入る)
  createEffect(
    () => visible(),
    (v) => {
      if (!v) return
      const h = grid
      window.log.push(`effect visible: handle=${typeof h?.scrollToRow} newHandle=${!window.handles.length || window.handles.at(-1) !== h}`)
      try {
        h.scrollToRow(150, { align: 'center' })
        h.selectCell(150, 0)
        window.log.push(`effect: range=${JSON.stringify(h.getVisibleRowRange())} active=${JSON.stringify(h.getActiveCell())}`)
      } catch (e) {
        window.log.push(`effect THROWS ${(e as Error).message}`)
      }
      window.handles.push(h)
    },
  )
  return (
    <div style={{ padding: '12px' }}>
      <button id="toggle" onClick={() => setVisible((v) => !v)}>
        出し入れ
      </button>
      <Show when={visible()} fallback={<p id="hidden">隠しています</p>}>
        <SpreadsheetGrid
          ref={grid}
          rows={rows()}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          onRowsChange={(next) => setRows(next)}
          height={400}
        />
      </Show>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)