// 最小再現: Radix UI の Dialog(modal 既定)の中のグリッド
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Dialog from '@radix-ui/react-dialog'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; region: string }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'region', title: '地域', width: 120, editor: { type: 'select', options: ['関東', '関西', '九州'].map((v) => ({ value: v, label: v })) }, filterType: 'set' },
]

function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 30 }, (_, i) => ({ id: i, name: `顧客${i}`, region: ['関東', '関西', '九州'][i % 3] })))
  return (
    <Dialog.Root>
      <Dialog.Trigger id="open">開く</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }} />
        <Dialog.Content id="dlg" style={{ position: 'fixed', top: 40, left: 40, width: 500, height: 400, background: '#fff', padding: 16 }}>
          <Dialog.Title>顧客</Dialog.Title>
          <div style={{ height: 320 }}>
            <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%"
              enableContextMenu getContextMenuItems={() => [{ label: 'メニュー項目', onSelect: () => console.log('selected') }]} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
