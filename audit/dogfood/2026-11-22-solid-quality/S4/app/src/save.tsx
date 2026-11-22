// 最小再現: onRowsChange から action(+ createOptimistic)で保存する
//   ?mode=optimistic … createOptimistic(() => serverRows()) + action(README に無いが Solid 2 の勧める形)
//   ?mode=action     … ふつうの signal + action(保存だけ action)
//   ?mode=flush      … optimistic と同じだが save の前に flush()
//   ?mode=plain      … ふつうの signal + async 関数(action なし)
import { render } from '@solidjs/web'
import { action, createMemo, createOptimistic, createSignal, flush, Loading, onSettled, refresh } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200, editable: true },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
]
let db: Row[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `品目${i + 1}`, qty: i }))
const SAVE_MS = Number(new URLSearchParams(location.search).get('ms') ?? 1500)
const mode = new URLSearchParams(location.search).get('mode') ?? 'optimistic'
declare global { interface Window { grid?: SpreadsheetGridHandle<Row>; saves: string[]; db: () => Row[] } }
window.saves = []
window.db = () => db
const api = {
  list: async () => { await new Promise((r) => setTimeout(r, 100)); return structuredClone(db) },
  save: async (rows: Row[]) => {
    window.saves.push(rows.map((r) => r.name).join('|'))
    await new Promise((r) => setTimeout(r, SAVE_MS))
    db = structuredClone(rows)
  },
}

function Optimistic(props: { flushFirst: boolean; defer?: 'microtask' | 'settled' | 'timeout' | undefined }) {
  const serverRows = createMemo(() => api.list())
  const [rows, setRows] = createOptimistic(() => serverRows())
  const save = action(function* (next: Row[]) {
    setRows(next)
    yield api.save(next)
    refresh(serverRows)
  })
  return (
    <Loading fallback={<p>読み込み中…</p>}>
      <SpreadsheetGrid
        ref={(h) => (window.grid = h)}
        rows={rows()}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        onRowsChange={(next) => {
          if (props.flushFirst) flush()
          if (props.defer === 'microtask') queueMicrotask(() => save(next))
          else if (props.defer === 'settled') onSettled(() => save(next))
          else if (props.defer === 'timeout') setTimeout(() => save(next), 0)
          else save(next)
        }}
        height={400}
      />
    </Loading>
  )
}

function ActionOnly(props: { how?: 'flush' | 'timeout' | undefined }) {
  const [rows, setRows] = createSignal<Row[]>(structuredClone(db))
  const save = action(function* (next: Row[]) {
    yield api.save(next)
  })
  return (
    <SpreadsheetGrid
      ref={(h) => (window.grid = h)}
      rows={rows()}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      onRowsChange={(next) => {
        setRows(next)
        if (props.how === 'flush') {
          flush()
          save(next)
        } else if (props.how === 'timeout') setTimeout(() => save(next), 0)
        else save(next)
      }}
      height={400}
    />
  )
}

function Plain() {
  const [rows, setRows] = createSignal<Row[]>(structuredClone(db))
  return (
    <SpreadsheetGrid
      ref={(h) => (window.grid = h)}
      rows={rows()}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      onRowsChange={(next) => {
        setRows(next)
        void api.save(next)
      }}
      height={400}
    />
  )
}

function App() {
  return (
    <div style={{ padding: '12px' }}>
      <p id="mode">mode={mode}</p>
      {mode === 'actionflush' ? <ActionOnly how="flush" /> : mode === 'actiontimeout' ? <ActionOnly how="timeout" /> : mode === 'optimistictimeout' ? <Optimistic flushFirst={false} defer="timeout" /> : mode === 'microtask' ? <Optimistic flushFirst={false} defer="microtask" /> : mode === 'settled' ? <Optimistic flushFirst={false} defer="settled" /> : mode === 'optimistic' ? <Optimistic flushFirst={false} /> : mode === 'flush' ? <Optimistic flushFirst /> : mode === 'action' ? <ActionOnly /> : <Plain />}
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
