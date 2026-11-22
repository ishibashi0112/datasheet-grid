import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { inventoryColumns, type Item } from './inventory'

export type InventoryGridProps = {
  initialRows: Item[]
  onRowsChange?: ((rows: Item[]) => void) | undefined
  ref?: ((handle: SpreadsheetGridHandle<Item>) => void) | undefined
}

// アプリの在庫一覧(状態は自分で持つ)
export function InventoryGrid(props: InventoryGridProps) {
  const [rows, setRows] = createSignal<Item[]>(props.initialRows)
  return (
    <SpreadsheetGrid
      ref={(h) => props.ref?.(h)}
      ariaLabel="在庫一覧"
      rows={rows()}
      columns={inventoryColumns}
      rowKeyGetter={(r) => r.id}
      onRowsChange={(next) => {
        setRows(next)
        props.onRowsChange?.(next)
      }}
      height={400}
    />
  )
}
