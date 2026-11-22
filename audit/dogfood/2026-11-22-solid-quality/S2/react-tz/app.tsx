// React 版の同じ最小再現(clientSide + 相対日付のプリセットを initialState で入れて SSR → hydrateRoot)
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

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
export function App({ theme = 'light' as 'light' | 'auto' }) {
  const [rows, setRows] = useState(ROWS)
  return (
    <div style={{ height: '400px' }}>
      <SpreadsheetGrid
        rows={rows}
        onRowsChange={setRows}
        columns={columns}
        rowKeyGetter={(r) => r.id}
        theme={theme}
        initialState={{ filters: { globalText: '', columnFilters: { at: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null } } } }}
        height="100%"
      />
    </div>
  )
}
