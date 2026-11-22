// 非同期の行を取り直す間にグリッドを操作する最小再現(Solid 版)
// ?kind=memo(createMemo(async))| deferred(createDeferred)。window.__next() でページを替える(3 秒かかる)
import { render } from '@solidjs/web'
import { createDeferred, createMemo, createSignal, isPending, Loading } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; value: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200 },
  { key: 'value', title: 'Value', width: 120 },
]
const kind = new URLSearchParams(location.search).get('kind') ?? 'memo'
const fetchRows = (page: number) =>
  new Promise<Row[]>((r) => setTimeout(() => r(Array.from({ length: 5000 }, (_, i) => ({ id: page * 100000 + i, name: `p${page} row ${i}`, value: i }))), 3000))

function App() {
  const [page, setPage] = createSignal(1)
  ;(window as any).__next = () => setPage((p) => p + 1)
  const rows = kind === 'deferred' ? createDeferred(() => fetchRows(page())) : createMemo(() => fetchRows(page()))
  return (
    <Loading fallback={<p data-testid="loading">loading…</p>}>
      <p data-testid="pending">{isPending(() => rows()) ? 'pending' : 'ready'}</p>
      <SpreadsheetGrid rows={rows()} columns={columns} rowKeyGetter={(r) => r.id} height={500} />
    </Loading>
  )
}
render(() => <App />, document.getElementById('root')!)
