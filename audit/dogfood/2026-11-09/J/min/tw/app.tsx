// 最小再現: classNames.root に Tailwind v4 のユーティリティを渡す(?css=plain | layer)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 120 }]
const rows: Row[] = [{ id: 1, name: 'a' }]
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-4">
      <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height={200} classNames={{ root: 'rounded-none border-x-0 border-b-0', bodyCell: 'text-red-600' }} />
      <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height={200} classNames={{ root: '!rounded-none !border-x-0 !border-b-0' }} />
    </div>
  </StrictMode>,
)
