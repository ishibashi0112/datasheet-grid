// 回避策: action を setTimeout で次のタスクに回す
import { action, createMemo, createOptimistic, Loading, refresh } from 'solid-js'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid'
import { inventoryColumns, type Item } from './inventory'
import type { InventoryApi } from './AsyncInventory'

export function AsyncInventoryDeferred(props: { api: InventoryApi; category: string }) {
  const serverRows = createMemo(() => props.api.list(props.category))
  const [rows, setRows] = createOptimistic(() => serverRows())
  const save = action(function* (next: Item[]) {
    setRows(next)
    yield props.api.save(next)
    refresh(serverRows)
  })
  return (
    <Loading fallback={<p data-testid="loading">読み込み中…</p>}>
      <SpreadsheetGrid
        ariaLabel="在庫一覧(サーバー)"
        rows={rows()}
        columns={inventoryColumns}
        rowKeyGetter={(r) => r.id}
        onRowsChange={(next) => setTimeout(() => save(next), 0)}
        height={400}
      />
    </Loading>
  )
}
