import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import { WAREHOUSES } from '../data'

type Row = { sku: string; warehouse: string; stock: number }
const columns: GridColumn<Row>[] = [
  { key: 'sku', title: 'SKU', width: 100, editable: false },
  { key: 'warehouse', title: '倉庫', width: 100, editor: { type: 'select', options: WAREHOUSES.map((v) => ({ value: v, label: v })) }, filterType: 'set' },
  { key: 'stock', title: '在庫', width: 80, align: 'right', editor: { type: 'number', min: 0, integer: true } },
]

// ヘッダーの「在庫を確認」ポップオーバー(小さな表を中に置く)
export function QuickStockPopover() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 12 }, (_, i) => ({ sku: `SKU-${String(i + 1).padStart(5, '0')}`, warehouse: WAREHOUSES[i % WAREHOUSES.length], stock: (i * 37) % 200 })))
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" data-testid="quick-trigger">
          在庫を確認
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className="z-50 h-[320px] w-[360px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900" data-testid="quick-popover">
          <SpreadsheetGrid ariaLabel="在庫の確認" rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.sku} height="100%" theme="class" showTopBar={false}
            enableContextMenu getContextMenuItems={() => [{ label: '発注する', onSelect: () => console.log('発注') }]} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
