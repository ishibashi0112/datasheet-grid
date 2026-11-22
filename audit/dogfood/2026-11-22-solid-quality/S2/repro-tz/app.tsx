// 最小再現: clientSide のグリッドに相対日付のプリセット(今日)を initialState で入れて SSR → hydrate
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'

type Row = { id: number; at: string }
// 決まった日付(サーバーとクライアントで同じ)。11-21 が 2 行、11-22 が 5 行
export const ROWS: Row[] = [
  ...Array.from({ length: 2 }, (_, i) => ({ id: i + 1, at: '2026-11-21' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: i + 11, at: '2026-11-22' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: i + 21, at: '2026-11-23' })),
]
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'at', title: 'Date', width: 140, filterType: 'dateSet' },
]
export function App(props: { q: string }) {
  const noFilter = props.q.includes('nofilter')
  const [rows, setRows] = createSignal(ROWS)
  return (
    <div style={{ height: '400px' }}>
      <SpreadsheetGrid
        rows={rows()}
        onRowsChange={setRows}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        initialState={noFilter ? undefined : { filters: { globalText: '', columnFilters: { at: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null } } } }}
        theme={props.q.includes('auto') ? 'auto' : undefined}
        height="100%"
      />
    </div>
  )
}
