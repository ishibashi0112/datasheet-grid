import { createSignal, createStore, flush } from 'solid-js'
import {
  SpreadsheetGrid,
  type GridContextMenuItem,
  type GridContextMenuParams,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { buildColumns, canEditCell } from './columns'
import { createItems, newItem, type Item } from './data'
import { AddItemForm } from './AddItemForm'
import { Toolbar } from './Toolbar'

declare global {
  interface Window {
    __grid?: SpreadsheetGridHandle<Item> | undefined
    __log: string[]
    __rowsChangeCount: number
    __getRows?: () => readonly Item[]
  }
}
window.__log = []
window.__rowsChangeCount = 0
const log = (m: string) => window.__log.push(m)

const ROWS = 2000

// signal で行を持つ版。ref は変数で受ける(README の 1 つ目の形)
export function SignalPage() {
  const [rows, setRows] = createSignal<Item[]>(createItems(ROWS))
  const [canUndo, setCanUndo] = createSignal(false)
  const [canRedo, setCanRedo] = createSignal(false)
  const [imeDirect, setImeDirect] = createSignal(false)
  let grid!: SpreadsheetGridHandle<Item>
  window.__getRows = () => rows()

  const columns = buildColumns({
    log,
    onDelete: (id) => grid.applyRows((prev) => prev.filter((r) => r.id !== id)),
  })

  const contextMenu = (params: GridContextMenuParams<Item>): GridContextMenuItem[] => [
    {
      label: 'この行を削除',
      onSelect: () => grid.applyRows((prev) => prev.filter((r) => r.id !== params.target.rowKey)),
    },
    { label: 'ここから編集', onSelect: () => grid.startEditing() },
  ]

  return (
    <div class="flex h-full flex-col gap-2">
      <AddItemForm
        onAdd={(partial) => {
          const item = newItem(partial)
          setRows((prev) => [...prev, item])
          // React 版のドキュメントの flushSync の代わり
          if (!location.search.includes('noflush')) flush()
          const v = grid.getViewRowIndex(item.id)
          const c = grid.getColIndex('qty')
          log(`added ${item.id} view=${v} col=${c}`)
          if (v >= 0 && c >= 0) grid.startEditing(v, c)
        }}
      />
      <Toolbar
        grid={() => grid}
        canUndo={canUndo()}
        canRedo={canRedo()}
        imeDirect={imeDirect()}
        onToggleIme={() => setImeDirect((v) => !v)}
        onDeleteSelected={() => {
          const keys = new Set(grid.getSelectedRowKeys())
          grid.applyRows((prev) => prev.filter((r) => !keys.has(r.id)))
        }}
      />
      <div class="min-h-0 flex-1" data-testid="grid-area">
        <SpreadsheetGrid
          ref={grid}
          rows={rows()}
          columns={columns}
          onRowsChange={(next) => {
            window.__rowsChangeCount++
            setRows(next)
          }}
          rowKeyGetter={(row) => row.id}
          canEditCell={canEditCell}
          height="100%"
          theme="class"
          totalRow={{ label: '合計' }}
          fillHandle
          find
          enableRowSelection
          enableContextMenu
          getContextMenuItems={contextMenu}
          imeDirectInput={imeDirect()}
          onUndoRedoStateChange={(s) => {
            setCanUndo(s.canUndo)
            setCanRedo(s.canRedo)
          }}
          ariaLabel="在庫・発注表"
        />
      </div>
      {(() => {
        // 確認用にハンドルを出す
        queueMicrotask(() => (window.__grid = grid))
        return null
      })()}
    </div>
  )
}

// store で行を持つ版。ref は関数で受ける(README の 2 つ目の形)
export function StorePage() {
  const [state, setState] = createStore<{ rows: Item[] }>({ rows: createItems(ROWS) })
  const [canUndo, setCanUndo] = createSignal(false)
  const [canRedo, setCanRedo] = createSignal(false)
  const [imeDirect, setImeDirect] = createSignal(false)
  let grid: SpreadsheetGridHandle<Item> | undefined
  window.__getRows = () => state.rows

  const columns = buildColumns({
    log,
    onDelete: (id) => grid?.applyRows((prev) => prev.filter((r) => r.id !== id)),
  })

  return (
    <div class="flex h-full flex-col gap-2">
      <AddItemForm
        onAdd={(partial) => {
          const item = newItem(partial)
          setState((s) => {
            s.rows.push(item)
          })
        }}
      />
      <Toolbar
        grid={() => grid}
        canUndo={canUndo()}
        canRedo={canRedo()}
        imeDirect={imeDirect()}
        onToggleIme={() => setImeDirect((v) => !v)}
        onDeleteSelected={() => {
          const keys = new Set(grid?.getSelectedRowKeys() ?? [])
          grid?.applyRows((prev) => prev.filter((r) => !keys.has(r.id)))
        }}
      />
      <div class="min-h-0 flex-1" data-testid="grid-area">
        <SpreadsheetGrid
          ref={(handle) => {
            grid = handle
            window.__grid = handle
          }}
          rows={state.rows}
          columns={columns}
          onRowsChange={(next) => {
            window.__rowsChangeCount++
            setState((s) => {
              s.rows = next
            })
          }}
          rowKeyGetter={(row) => row.id}
          canEditCell={canEditCell}
          height="100%"
          theme="class"
          totalRow
          fillHandle
          find
          enableRowSelection
          imeDirectInput={imeDirect()}
          onUndoRedoStateChange={(s) => {
            setCanUndo(s.canUndo)
            setCanRedo(s.canRedo)
          }}
          ariaLabel="在庫・発注表(store)"
        />
      </div>
    </div>
  )
}
