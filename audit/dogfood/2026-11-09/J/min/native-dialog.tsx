// 最小再現: HTML の <dialog> を showModal() で開いた中のグリッド
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; region: string }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'region', title: '地域', width: 120, editor: { type: 'select', options: ['関東', '関西', '九州'].map((v) => ({ value: v, label: v })) }, filterType: 'set' },
]

function App() {
  const ref = useRef<HTMLDialogElement>(null)
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 30 }, (_, i) => ({ id: i, name: `顧客${i}`, region: ['関東', '関西', '九州'][i % 3] })))
  return (
    <>
      <button id="open" onClick={() => ref.current?.showModal()}>開く</button>
      <dialog ref={ref} id="dlg" style={{ width: 500, height: 400 }}>
        <div style={{ height: 320 }}>
          <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%"
            enableContextMenu getContextMenuItems={() => [{ label: 'メニュー項目', onSelect: () => console.log('selected') }]} />
        </div>
      </dialog>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
