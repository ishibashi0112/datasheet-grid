// 最小の再現(2): 行を非同期の createMemo で読み <Loading> で包み、action の中で refresh する
//   ?v=refresh   … action: optimistic の行を書き、2 秒待ち、refresh(server)
//   ?v=norefresh … action: optimistic の行を書き、2 秒待つだけ(サーバーの値は変えない)
//   ?col=name|qty … 編集を始める列
import { action, createMemo, createSignal, createOptimistic, Errored, isPending, Loading, refresh, Show } from 'solid-js'
import { render } from '@solidjs/web'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

const q = new URLSearchParams(location.search)
const v = q.get('v') ?? 'refresh'
const flag = (k: string) => q.get(k) === '1'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, editable: true },
  { key: 'qty', title: 'Qty', width: 100, editable: true, editor: { type: 'number' }, ...(flag('noagg') ? {} : { aggFunc: 'sum' as const }) },
]
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let db: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, qty: i }))
async function fetchRows() {
  await wait(500)
  return db.map((r) => ({ ...r }))
}
async function saveRows(next: Row[]) {
  await wait(1000)
  db = next.map((r) => ({ ...r }))
}

function Grid() {
  const [sig] = createSignal(db.map((r) => ({ ...r })))
  const server = flag('sig') ? sig : createMemo(() => (flag('sync') ? db.map((r) => ({ ...r })) : fetchRows()))
  const [rows, setRows] = createOptimistic(() => server())
  const [busy, setBusy] = createOptimistic(false)
  const save = action(function* (next: Row[]) {
    setBusy(true)
    setRows(next)
    yield saveRows(next)
    if (v === 'refresh' && !flag('sig')) refresh(server)
  })
  return (
    <div class={{ stale: flag('ip') && isPending(() => rows()) }}>
      <span id="busy">{busy() ? '処理中' : '待機'}</span>
      <Show when={flag('ip2') && isPending(() => rows())}><span>更新中</span></Show>
      <div style={{ height: '400px' }}>
        <SpreadsheetGrid
          rows={rows()}
          columns={columns}
          onRowsChange={(next) => setTimeout(() => save(next), 0)}
          rowKeyGetter={(r) => r.id}
          height="100%"
          totalRow={flag('tr')}
          fillHandle={flag('fh')}
          enableContextMenu={flag('cm')}
        />
      </div>
    </div>
  )
}

render(
  () => (
    flag('nob') ? (
      <Grid />
    ) : (
      <Errored fallback={(e) => <p>err {String(e())}</p>}>
        <Loading fallback={<p>読み込み中</p>}>
          <Grid />
        </Loading>
      </Errored>
    )
  ),
  document.getElementById('root')!,
)
