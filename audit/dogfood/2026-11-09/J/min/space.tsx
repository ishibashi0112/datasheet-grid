// 最小再現: 縦に長いページに置いたグリッドで、編集できないセルで Space を押す
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; status: string; region: string; qty: number }
const opts = ['受注', '出荷済'].map((v) => ({ value: v, label: v }))
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 70, editable: false },
  { key: 'name', title: '名前', width: 120 },
  { key: 'status', title: '状態(chips)', width: 120, editor: { type: 'select', options: opts }, conditionalFormat: { chips: { 受注: 'info', 出荷済: 'good' } } },
  { key: 'region', title: '地域', width: 100, editor: { type: 'select', options: opts } },
  { key: 'total', title: '計算', width: 100, getValue: (r) => r.qty * 2 },
]

function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `名前${i}`, status: '受注', region: '出荷済', qty: i })))
  return (
    <div>
      <div style={{ height: 300, background: '#eef' }}>上の内容</div>
      <div style={{ width: 600, height: 300 }}>
        <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" />
      </div>
      <div style={{ height: 3000, background: '#efe' }}>下の内容</div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
