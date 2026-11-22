// React 版 1.2.1: 外したグリッドのハンドルを持ち続けて呼ぶと
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [{ key: 'name', title: '品名', width: 200, editable: true }]
const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `品目${i + 1}`, qty: i }))
declare global { interface Window { current?: SpreadsheetGridHandle<Row>; refCalls: string[]; rows: () => Row[]; setRows: (r: Row[]) => void; toggle: () => void } }
window.refCalls = []
let rowsNow: Row[] = []
function App() {
  const [visible, setVisible] = useState(true)
  const [rows, setRows] = useState<Row[]>(() => make(300))
  rowsNow = rows
  window.rows = () => rowsNow
  window.setRows = setRows
  window.toggle = () => setVisible((v) => !v)
  return (
    <div style={{ padding: 12 }}>
      <button id="toggle" onClick={() => setVisible((v) => !v)}>出し入れ</button>
      {visible ? (
        <SpreadsheetGrid
          ref={(h) => { window.refCalls.push(h ? 'handle' : 'null'); if (h) window.current = h }}
          rows={rows}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          onRowsChange={setRows}
          height={400}
        />
      ) : (
        <p id="hidden">隠しています</p>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
