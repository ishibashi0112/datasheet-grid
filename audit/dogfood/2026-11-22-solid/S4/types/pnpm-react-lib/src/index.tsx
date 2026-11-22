import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
export type Item = { id: number; name: string; qty: number }
export const itemColumns = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, valueFormatter: numberFormatter() },
] satisfies GridColumn<Item>[]
export const qtyFormatter = numberFormatter()
