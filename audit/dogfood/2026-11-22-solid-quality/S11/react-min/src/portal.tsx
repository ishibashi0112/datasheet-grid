// 最小の再現(React 版 1.2.1): 親のページの React が、同じオリジンの空の iframe の document へ表を描く
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import css from '@ishibashi0112/spreadsheet-grid/style.css?inline'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数', width: 80, filterType: 'number' },
]
const doc = (document.getElementById('pf') as HTMLIFrameElement).contentDocument!
doc.open(); doc.write('<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root" style="height:280px"></div></body></html>'); doc.close()
const style = doc.createElement('style'); style.textContent = css; doc.head.append(style)
const root = doc.getElementById('root')!
function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `とても長い品名の例 ${i + 1} で、セルからはみ出す文字`, qty: i * 10 })))
  return <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" showCellOverflowTooltip fillHandle enableContextMenu popupContainer={root} />
}
createRoot(root).render(<App />)
