// ref と onSettled / createEffect の順番の最小再現(Solid 版)
// ?crash を付けると、effect の初回で grid.scrollToBottom() を呼ぶ(README どおりの書き方)
import { render } from '@solidjs/web'
import { createEffect, createSignal, onSettled } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200 }]
const log: string[] = ((window as any).__log = [])
const crash = new URLSearchParams(location.search).has('crash')

function App() {
  const [rows, setRows] = createSignal<Row[]>([{ id: 1, name: 'a' }])
  let grid!: SpreadsheetGridHandle<Row>
  let viaFn: SpreadsheetGridHandle<Row> | undefined
  let div!: HTMLDivElement
  ;(window as any).__add = () => setRows((r) => [...r, { id: r.length + 1, name: 'x' }])
  createEffect(
    () => rows().length,
    (n) => {
      log.push(`effect(rows=${n}): grid(variable)=${typeof grid} viaFn=${typeof viaFn} div=${typeof div}`)
      if (crash) grid.scrollToBottom()
    },
  )
  onSettled(() => {
    log.push(`onSettled: grid(variable)=${typeof grid} viaFn=${typeof viaFn} div=${typeof div}`)
    queueMicrotask(() => log.push(`microtask after settle: grid=${typeof grid}`))
    requestAnimationFrame(() => log.push(`rAF after settle: grid=${typeof grid} viaFn=${typeof viaFn}`))
  })
  return (
    <>
      <div ref={div} data-testid="count">{rows().length}</div>
      <SpreadsheetGrid ref={grid} rows={rows()} columns={columns} rowKeyGetter={(r) => r.id} height={200} />
      <SpreadsheetGrid
        ref={(h) => {
          viaFn = h
          log.push('ref function called')
        }}
        rows={rows()}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        height={200}
      />
    </>
  )
}
render(() => <App />, document.getElementById('root')!)
