// 確認: controlled の rowSelection で、onRowSelectionChange の中から getSelectedRowCount() を読んだ値
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type RowSelectionModel, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }]
const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` }))
const log: string[] = []
;(window as unknown as { __log: string[] }).__log = log
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  const [sel, setSel] = useState<RowSelectionModel>({ type: 'include', rowKeys: [] })
  return (
    <SpreadsheetGrid
      ref={ref}
      rows={rows}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      enableRowSelection
      rowSelection={location.search.includes("unc") ? undefined : sel}
      onRowSelectionChange={(m) => {
        log.push(`sync=${ref.current?.getSelectedRowCount()} keys=${JSON.stringify(ref.current?.getSelectedRowKeys())} model=${JSON.stringify(m)}`)
        setSel(m)
      }}
    />
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
