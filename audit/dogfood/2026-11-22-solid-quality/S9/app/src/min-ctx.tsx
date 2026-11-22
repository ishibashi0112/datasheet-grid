// 最小再現: custom エディタの部品の本体で ctx.value / ctx.initialText を読む(React 版のドキュメントの「initialText を入力欄の初期値に」の素直な書き方)
import { createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { SpreadsheetGrid, type CellEditorContext, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; city: string }
const mode = new URLSearchParams(location.search).get('mode') ?? 'value'

function CityEditor(props: { ctx: CellEditorContext<Row> }) {
  // mode=value: ctx.value を本体で読む / mode=initial: ctx.initialText だけ / mode=row: ctx.row
  const start = mode === 'value' ? String(props.ctx.value ?? '') : mode === 'row' ? props.ctx.row?.city ?? '' : props.ctx.initialText
  const [text, setText] = createSignal(start)
  return (
    <input
      ref={(el) => queueMicrotask(() => el.focus())}
      style={{ width: '100%', height: '100%', 'box-sizing': 'border-box' }}
      value={text()}
      onInput={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && props.ctx.commit(text(), 'down')}
      onBlur={() => props.ctx.commit(text())}
    />
  )
}

const columns: GridColumn<Row>[] = [
  { key: 'city', title: '都市', width: 200, editable: true, editor: { type: 'custom', render: (ctx) => <CityEditor ctx={ctx} /> } },
]

function App() {
  const [rows, setRows] = createSignal<Row[]>([{ id: 1, city: '東京' }, { id: 2, city: '大阪' }])
  return <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={200} />
}
render(() => <App />, document.getElementById('root')!)
