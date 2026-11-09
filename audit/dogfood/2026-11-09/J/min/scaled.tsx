// 最小再現: transform: scale(0.8) の箱の中のグリッド
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; a: number; b: number; c: number }
const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'A', width: 100 },
  { key: 'b', title: 'B', width: 100 },
  { key: 'c', title: 'C', width: 100 },
]
const scale = Number(new URLSearchParams(location.search).get('scale') ?? '0.8')

function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 20 }, (_, i) => ({ id: i, a: i, b: i * 10, c: i * 100 })))
  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: 500, height: 500 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" fillHandle />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
