import '@ishibashi0112/spreadsheet-grid/style.css'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  SpreadsheetGrid,
  type GridFilterState,
  type GridSortState,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, type Item } from './inventory'

export type InventoryPanelProps = {
  initialItems: Item[]
  onSave?: (items: Item[]) => void
  onExport?: (csv: string) => void
  height?: number | string
}

let nextId = 100000

/** 在庫の一覧(ツールバー + グリッド)。 */
export function InventoryPanel({ initialItems, onSave, onExport, height = 400 }: InventoryPanelProps) {
  const [items, setItems] = useState(initialItems)
  const [message, setMessage] = useState('')
  const [filterSummary, setFilterSummary] = useState('')
  const [sortSummary, setSortSummary] = useState('')
  const gridRef = useRef<SpreadsheetGridHandle<Item>>(null)

  const addRow = () => {
    const id = `new-${nextId++}`
    const row: Item = {
      id,
      sku: `NEW-${nextId}`,
      name: '',
      category: 'stationery',
      warehouse: '東京',
      qty: 0,
      price: 0,
      arrivedAt: null,
      discontinued: false,
      note: '',
    }
    flushSync(() => setItems((prev) => [...prev, row]))
    const grid = gridRef.current
    const viewRowIndex = grid?.getViewRowIndex(id) ?? -1
    const colIndex = grid?.getColIndex('name') ?? -1
    if (viewRowIndex >= 0 && colIndex >= 0) grid?.startEditing(viewRowIndex, colIndex)
  }

  const deleteSelected = () => {
    const grid = gridRef.current
    if (!grid) return
    const selected = new Set(grid.getSelectedRows().map((r) => r.id))
    if (selected.size === 0) {
      setMessage('削除する行を選んでください')
      return
    }
    grid.applyRows(items.filter((r) => !selected.has(r.id)))
    setMessage(`${selected.size} 行を削除しました`)
  }

  const save = () => {
    const grid = gridRef.current
    if (!grid) return
    const invalid = grid.getInvalidCells()
    if (invalid.length > 0) {
      const first = invalid[0]
      const rowNo = grid.getRowNumber(first.rowKey)
      setMessage(`${rowNo} 行目の ${first.columnKey}: ${first.message}`)
      return
    }
    onSave?.(items)
    setMessage('保存しました')
  }

  const exportCsv = () => {
    const csv = gridRef.current?.exportCsv({ scope: 'view' }) ?? ''
    onExport?.(csv)
  }

  const describeFilters = (f: GridFilterState) => {
    const keys = Object.keys(f.columnFilters)
    setFilterSummary([f.globalText ? `検索: ${f.globalText}` : '', keys.length ? `列: ${keys.join(',')}` : ''].filter(Boolean).join(' / '))
  }
  const describeSort = (s: GridSortState) => {
    setSortSummary(s.map((x) => `${x.columnKey}:${x.direction}`).join(','))
  }

  return (
    <section aria-label="在庫">
      <div role="toolbar" aria-label="在庫の操作">
        <button type="button" onClick={addRow}>行を追加</button>
        <button type="button" onClick={deleteSelected}>選択した行を削除</button>
        <button type="button" onClick={save}>保存</button>
        <button type="button" onClick={exportCsv}>CSV</button>
        <span data-testid="count">{items.length} 件</span>
        <span data-testid="filters">{filterSummary}</span>
        <span data-testid="sort">{sortSummary}</span>
        <output data-testid="message">{message}</output>
      </div>
      <SpreadsheetGrid<Item>
        ref={gridRef}
        ariaLabel="在庫一覧"
        rows={items}
        columns={inventoryColumns}
        onRowsChange={setItems}
        rowKeyGetter={(row) => row.id}
        height={height}
        onFiltersChange={describeFilters}
        onSortChange={describeSort}
      />
    </section>
  )
}