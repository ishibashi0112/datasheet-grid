import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/router'
import { SpreadsheetGrid, type GridSortState, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en'
import { inventoryColumns, type Item } from '../lib/inventory'

export type InventoryTableProps = {
  items: Item[]
  english?: boolean
  initialSort?: GridSortState
  totalRow?: boolean
}

export function InventoryTable({ items: initial, english, initialSort, totalRow }: InventoryTableProps) {
  const [items, setItems] = useState(initial)
  const gridRef = useRef<SpreadsheetGridHandle<Item>>(null)
  const router = useRouter()
  const [log, setLog] = useState('')

  const addRow = () => {
    const id = `new-${items.length + 1}`
    flushSync(() => setItems((prev) => [...prev, { id, sku: `NEW-${prev.length + 1}`, name: '', warehouse: '東京', qty: 0, price: 0, arrivedAt: null, discontinued: false }]))
    const g = gridRef.current
    const r = g?.getViewRowIndex(id) ?? -1
    const c = g?.getColIndex('name') ?? -1
    setLog(`add: view=${r} col=${c} started=${r >= 0 && c >= 0 ? g?.startEditing(r, c) : 'n/a'}`)
  }

  return (
    <div>
      <div role="toolbar" aria-label="在庫の操作" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={addRow}>行を追加</button>
        <button type="button" onClick={() => setLog(JSON.stringify(gridRef.current?.getState()))}>状態</button>
        <button type="button" onClick={() => { gridRef.current?.scrollToRow(items.length - 1, { align: 'end' }) }}>末尾へ</button>
        <button type="button" onClick={() => gridRef.current?.focus()}>グリッドへ</button>
        <button type="button" onClick={() => setLog(gridRef.current?.exportCsv({ scope: 'view' }).split('\n').slice(0, 3).join(' | ') ?? '')}>CSV</button>
        <span data-testid="count">{items.length} 件</span>
      </div>
      <output data-testid="log" style={{ display: 'block', fontSize: 12, minHeight: 16 }}>{log}</output>
      <div style={{ height: 480 }}>
        <SpreadsheetGrid<Item>
          ref={gridRef}
          ariaLabel="在庫一覧"
          rows={items}
          columns={inventoryColumns}
          onRowsChange={setItems}
          rowKeyGetter={(r) => r.id}
          height="100%"
          theme="class"
          totalRow={totalRow}
          localeText={english ? localeTextEn : undefined}
          initialState={initialSort ? { sort: initialSort } : undefined}
          onSortChange={(sort) => {
            const q = sort[0] ? `${sort[0].columnKey}.${sort[0].direction}` : undefined
            const query = { ...router.query }
            if (q) query.sort = q
            else delete query.sort
            void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
          }}
        />
      </div>
    </div>
  )
}
