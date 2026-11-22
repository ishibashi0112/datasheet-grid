// 最小再現: createStore で行を持つと元に戻す(Ctrl+Z)が効かず、開発時の警告が出る
//   ?mode=signal   … createSignal(README の形)
//   ?mode=store    … createStore + setStore(s => { s.rows = next })
//   ?mode=snapshot … createStore + rows={snapshot(state.rows)}
import { render } from '@solidjs/web'
import { createSignal, createStore, snapshot } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200 }]
const initial = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}` }))
const mode = new URLSearchParams(location.search).get('mode') ?? 'signal'
declare global { interface Window { grid?: SpreadsheetGridHandle<Row>; mutate?: (kind: string) => void } }

function App() {
  if (mode === 'signal') {
    const [rows, setRows] = createSignal<Row[]>(initial)
    return <SpreadsheetGrid ref={(h) => (window.grid = h)} rows={rows()} columns={columns} onRowsChange={(next) => setRows(next)} rowKeyGetter={(r) => r.id} height={400} />
  }
  const [state, setState] = createStore<{ rows: Row[] }>({ rows: initial })
  // 店の中身を直接変える(Solid でよく書く形)
  window.mutate = (kind) =>
    setState((s) => {
      if (kind === 'field') s.rows[0]!.name = 'mutated in place'
      if (kind === 'push') s.rows.push({ id: 999, name: 'pushed' })
      if (kind === 'splice') s.rows.splice(1, 1)
    })
  return (
    <SpreadsheetGrid
      ref={(h) => (window.grid = h)}
      rows={mode === 'snapshot' ? snapshot(state.rows) : state.rows}
      columns={columns}
      onRowsChange={(next) => setState((s) => { s.rows = next })}
      rowKeyGetter={(r) => r.id}
      height={400}
    />
  )
}
render(() => <App />, document.getElementById('root')!)
