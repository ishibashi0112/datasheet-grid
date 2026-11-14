// 最小再現: 列 3 つ + validate + set フィルター + 左固定 + 右クリックメニュー
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; status: string; qty: number; memo: string }
const rows0: Row[] = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  name: `項目${i + 1}`,
  status: ['良', '不良', '対象外'][i % 3],
  qty: 100 + ((i * 37) % 100) + 0.3333,
  memo: '',
}))
const cols0: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 100, pinned: 'left' },
  {
    key: 'status',
    title: '状態',
    width: 90,
    filterType: 'set',
    editor: { type: 'select', options: ['良', '不良', '対象外'].map((v) => ({ label: v, value: v })) },
  },
  { key: 'qty', title: '数量', width: 90, align: 'right', editor: { type: 'number' } },
  {
    key: 'memo',
    title: 'メモ',
    width: 160,
    validate: ({ value, row }) => row.status !== '不良' || String(value ?? '') !== '' || 'メモを書いてください',
  },
]

function App() {
  const [rows, setRows] = useState(rows0)
  const [cols, setCols] = useState(cols0)
  return (
    <SpreadsheetGrid<Row>
      ariaLabel="最小"
      rows={rows}
      columns={cols}
      onRowsChange={setRows}
      onColumnsChange={setCols}
      rowKeyGetter={(r) => r.id}
      height="100%"
      enableContextMenu
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
