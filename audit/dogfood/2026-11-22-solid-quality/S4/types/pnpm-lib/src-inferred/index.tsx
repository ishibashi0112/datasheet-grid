// グリッドを包む部品のライブラリ(推論した型をそのまま export する)
import { createSignal } from 'solid-js'
import {
  SpreadsheetGrid,
  createSpreadsheetGrid,
  standardFeatures,
  fillHandleFeature,
  totalRowFeature,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid-solid'

export type Item = { id: number; name: string; qty: number }

// 型注釈なし(推論)
export const itemColumns = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, valueFormatter: numberFormatter() },
] satisfies GridColumn<Item>[]

export const qtyFormatter = numberFormatter()

// 機能を選んだグリッド(推論のまま export)
export const LiteGrid = createSpreadsheetGrid({ features: { ...standardFeatures, fillHandle: fillHandleFeature, totalRow: totalRowFeature } })
export const myFeatures = { ...standardFeatures, fillHandle: fillHandleFeature }

export function InventoryTable(props: { rows: Item[]; ref?: (h: SpreadsheetGridHandle<Item>) => void }) {
  const [rows, setRows] = createSignal(props.rows)
  return <SpreadsheetGrid ref={(h) => props.ref?.(h)} rows={rows()} columns={itemColumns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
}

// props をそのまま受けて渡す包み
export function MyGrid<T extends object>(props: SpreadsheetGridProps<T>) {
  return <SpreadsheetGrid {...props} />
}

// ハンドルから取り出した値を推論で返す
export const readState = (h: SpreadsheetGridHandle<Item>) => h.getState()
export const readSelection = (h: SpreadsheetGridHandle<Item>) => h.getSelection()
export const readActive = (h: SpreadsheetGridHandle<Item>) => h.getActiveCell()
export const readExport = (h: SpreadsheetGridHandle<Item>) => h.getExportData()
export const readInvalid = (h: SpreadsheetGridHandle<Item>) => h.getInvalidCells()
