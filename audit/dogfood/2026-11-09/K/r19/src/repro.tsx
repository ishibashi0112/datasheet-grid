// 最小再現: 1 列 20 行。「値 + Enter」を速く続けて打つと、Enter の直後のキーが失われ、後の値が別の行に入る
// ?cols=6 で 6 列(c1..c5 を足す。Tab で右へ打ち進める確認用)
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; code: string; [k: string]: string | number }
const params = new URLSearchParams(location.search)
const extra = Math.max(0, Number(params.get('cols') ?? 1) - 1)
const columns: GridColumn<Row>[] = [
  { key: 'code', title: 'コード', width: 140 },
  ...Array.from({ length: extra }, (_, i) => ({ key: `c${i + 1}`, title: `列${i + 1}`, width: 120 })),
]
const ime = params.has('ime')

function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 20 }, (_, i) => ({ id: i, code: '' })))
  return (
    <div style={{ height: 500 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" imeDirectInput={ime} />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
