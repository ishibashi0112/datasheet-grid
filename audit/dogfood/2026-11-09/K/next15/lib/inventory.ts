import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

export type Item = {
  id: string
  sku: string
  name: string
  warehouse: string
  qty: number | null
  price: number
  arrivedAt: string | null
  discontinued: boolean
}

const yen = numberFormatter()

export const inventoryColumns: GridColumn<Item>[] = [
  { key: 'sku', title: 'SKU', width: 110, pinned: 'left', editable: false, filterType: 'text' },
  { key: 'name', title: '品名', width: 200, filterType: 'textSet' },
  { key: 'warehouse', title: '倉庫', width: 100, filterType: 'set' },
  { key: 'qty', title: '在庫数', width: 100, align: 'right', editor: { type: 'number', min: 0, integer: true }, filterType: 'number', aggFunc: 'sum' },
  { key: 'price', title: '単価', width: 110, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: yen, filterType: 'number' },
  { key: 'amount', title: '在庫金額', width: 130, align: 'right', editable: false, getValue: (r) => (r.qty ?? 0) * r.price, valueFormatter: yen, aggFunc: 'sum' },
  { key: 'arrivedAt', title: '入荷日', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'discontinued', title: '廃番', width: 70, editor: { type: 'checkbox' } },
]

const NAMES = ['ボールペン', 'ノート', '事務椅子', 'デスク', 'モニター', 'キーボード']
const WAREHOUSES = ['東京', '大阪', '福岡']
export function makeItems(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    sku: `SKU-${String(i + 1).padStart(4, '0')}`,
    name: `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
    warehouse: WAREHOUSES[i % 3],
    qty: (i * 7) % 50,
    price: 100 * ((i % 9) + 1),
    arrivedAt: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    discontinued: i % 10 === 9,
  }))
}
