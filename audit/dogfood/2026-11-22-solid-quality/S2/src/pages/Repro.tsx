// 最小再現(repro-cand と同じグリッド)をルーターの中で
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'

type Row = { id: number; at: string }
const ROWS: Row[] = [
  ...Array.from({ length: 2 }, (_, i) => ({ id: i + 1, at: '2026-11-21' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: i + 11, at: '2026-11-22' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: i + 21, at: '2026-11-23' })),
]
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'at', title: 'Date', width: 140, filterType: 'dateSet' },
]
export default function Repro() {
  const [rows, setRows] = createSignal(ROWS)
  return (
    <div style={{ height: '400px' }}>
      <SpreadsheetGrid rows={rows()} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} height="100%" />
    </div>
  )
}
