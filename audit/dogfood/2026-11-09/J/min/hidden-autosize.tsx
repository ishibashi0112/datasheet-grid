// 最小再現: display:none の中で autoSizeColumns="onMount" のグリッドを作り、あとで表示する
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; note: string }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 80 },
  { key: 'note', title: '備考', width: 80 },
]
const data: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `とても長い品名の商品 ${i}`, note: `備考の文章がここに入ります ${i}` }))

function App() {
  const [shown, setShown] = useState(false)
  const [rows, setRows] = useState(data)
  return (
    <>
      <button id="show" onClick={() => setShown(true)}>表示する</button>
      <div id="box" style={{ display: shown ? 'block' : 'none', height: 400 }}>
        <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" autoSizeColumns="onMount" />
      </div>
      <div id="box2" style={{ height: 400 }}>
        <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" autoSizeColumns="onMount" />
      </div>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
