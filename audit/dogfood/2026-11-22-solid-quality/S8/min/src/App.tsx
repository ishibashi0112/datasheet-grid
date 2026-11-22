// 最小の再現: 固定列 + Date の列の日付の範囲のフィルターを initialState で入れて SSR
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'

type Row = { id: number; label: string; at: Date }
// 2026-11-01 00:00 UTC から 9 時間ごと
const make = () => Array.from({ length: 40 }, (_, i) => ({ id: i + 1, label: `行${i + 1}`, at: new Date(Date.UTC(2026, 10, 1) + i * 9 * 3600_000) }))
const columns: GridColumn<Row>[] = [
  { key: 'label', title: 'ラベル', width: 100, pinned: 'left' },
  { key: 'at', title: '日時', width: 260, filterType: 'dateSet', valueFormatter: ({ value }) => (value as Date).toISOString() },
]

export function App() {
  const [rows, setRows] = createSignal(make())
  return (
    <SpreadsheetGrid
      rows={rows()}
      columns={columns}
      onRowsChange={(next) => setRows(next)}
      rowKeyGetter={(row) => row.id}
      height="100%"
      initialState={{ filters: { globalText: '', columnFilters: { at: { kind: 'dateSet', condition: { mode: 'range', from: '2026-11-03', to: '2026-11-05' }, set: null } } } }}
    />
  )
}
