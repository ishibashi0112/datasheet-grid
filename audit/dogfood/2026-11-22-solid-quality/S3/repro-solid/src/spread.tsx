// props を spread で渡したときの開発時の Solid の知らせ(STRICT_READ_UNTRACKED / HUGE_FAN_OUT)
// ?case=inline | signal({...p()}) | stable({...obj}) | wrapper(包む部品が {...props}) | omit(包む部品が omit(props, ...))
import { render } from '@solidjs/web'
import { createSignal, omit } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200 }]
const kase = new URLSearchParams(location.search).get('case') ?? 'inline'

function MyGrid(props: SpreadsheetGridProps<Row> & { caption: string }) {
  return (
    <section>
      <h2>{props.caption}</h2>
      <SpreadsheetGrid {...props} />
    </section>
  )
}
function MyGridOmit(props: SpreadsheetGridProps<Row> & { caption: string }) {
  const rest = omit(props, 'caption')
  return (
    <section>
      <h2>{props.caption}</h2>
      <SpreadsheetGrid {...rest} />
    </section>
  )
}

function App() {
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` })))
  ;(window as any).__set = () => setRows((r) => r.map((x, i) => (i === 0 ? { ...x, name: x.name + '!' } : x)))
  const p = () => ({ rows: rows(), columns, onRowsChange: setRows, rowKeyGetter: (r: Row) => r.id, height: 300 })
  const stable = { columns, rowKeyGetter: (r: Row) => r.id, height: 300 }
  switch (kase) {
    case 'signal': return <SpreadsheetGrid {...p()} />
    case 'stable': return <SpreadsheetGrid {...stable} rows={rows()} onRowsChange={setRows} />
    case 'wrapper': return <MyGrid caption="w" rows={rows()} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={300} />
    case 'omit': return <MyGridOmit caption="o" rows={rows()} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={300} />
    default: return <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={300} />
  }
}
render(() => <App />, document.getElementById('root')!)
