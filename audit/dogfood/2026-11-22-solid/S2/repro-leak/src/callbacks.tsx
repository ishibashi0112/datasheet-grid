// 最小再現: グリッドの通知の中で signal を読むと STRICT_READ_UNTRACKED が出るか(?cb=<通知の名前>)
import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 200, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
]
const cb = new URLSearchParams(location.search).get('cb') ?? ''

function App() {
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item ${i}`, qty: i })))
  const [count, setCount] = createSignal(0)
  // 通知の中でアプリの signal を読む(よくある書き方: 今の値を見て何かを決める)
  const read = (name: string) => () => {
    if (name === cb) setCount(count() + 1)
  }
  return (
    <div>
      <p id="count">{count()}</p>
      <div style={{ height: '400px' }}>
        <SpreadsheetGrid
          rows={rows()}
          onRowsChange={(next) => { read('onRowsChange')(); setRows(next) }}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          height="100%"
          onSortChange={read('onSortChange')}
          onFiltersChange={read('onFiltersChange')}
          onStateChange={read('onStateChange')}
          onActiveCellChange={read('onActiveCellChange')}
          onScroll={read('onScroll')}
          onCellClick={read('onCellClick')}
          onRowSelectionChange={read('onRowSelectionChange')}
        />
      </div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
