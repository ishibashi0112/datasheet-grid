import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

export type Category = 'stationery' | 'furniture' | 'electronics'

export type Item = {
  id: string
  sku: string
  name: string
  category: Category
  warehouse: string
  qty: number | null
  price: number
  arrivedAt: string | null
  discontinued: boolean
  note: string
}

export const CATEGORY_OPTIONS = [
  { value: 'stationery', label: '文房具' },
  { value: 'furniture', label: '家具' },
  { value: 'electronics', label: '電子機器' },
] as const

const categoryLabel = (value: unknown) =>
  CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? String(value ?? '')

const yen = numberFormatter()

export const inventoryColumns: GridColumn<Item>[] = [
  { key: 'sku', title: 'SKU', width: 110, pinned: 'left', editable: false, filterType: 'text' },
  { key: 'name', title: '品名', width: 200, filterType: 'textSet' },
  {
    key: 'category',
    title: 'カテゴリ',
    width: 120,
    editor: { type: 'select', options: [...CATEGORY_OPTIONS] },
    filterType: 'set',
    filterOptions: CATEGORY_OPTIONS,
    valueFormatter: ({ value }) => categoryLabel(value),
  },
  { key: 'warehouse', title: '倉庫', width: 100, filterType: 'set' },
  {
    key: 'qty',
    title: '在庫数',
    width: 100,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    filterType: 'number',
  },
  {
    key: 'price',
    title: '単価',
    width: 110,
    align: 'right',
    editor: { type: 'number', min: 0 },
    valueFormatter: yen,
    filterType: 'number',
  },
  {
    key: 'amount',
    title: '在庫金額',
    width: 130,
    align: 'right',
    editable: false,
    getValue: (row) => (row.qty ?? 0) * row.price,
    valueFormatter: yen,
  },
  { key: 'arrivedAt', title: '入荷日', width: 120, editor: { type: 'date' }, filterType: 'date' },
  { key: 'discontinued', title: '廃番', width: 70, editor: { type: 'checkbox' } },
  {
    key: 'note',
    title: '備考',
    width: 200,
    validate: ({ value }) => String(value ?? '').length <= 20 || '20 文字までです',
  },
]

const NAMES = ['ボールペン', 'ノート', '事務椅子', 'デスク', 'モニター', 'キーボード', 'ホチキス', '書類棚']
const CATS: Category[] = ['stationery', 'stationery', 'furniture', 'furniture', 'electronics', 'electronics', 'stationery', 'furniture']
const WAREHOUSES = ['東京', '大阪', '福岡']

/** 決まった並びの在庫データを作る(テストで値を当てられるよう乱数は使わない)。 */
export function makeItems(count: number): Item[] {
  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    const k = i % NAMES.length
    items.push({
      id: `item-${i + 1}`,
      sku: `SKU-${String(i + 1).padStart(4, '0')}`,
      name: `${NAMES[k]} ${Math.floor(i / NAMES.length) + 1}`,
      category: CATS[k],
      warehouse: WAREHOUSES[i % WAREHOUSES.length],
      qty: (i * 7) % 50,
      price: 100 * ((i % 9) + 1) + (k === 4 ? 20000 : 0),
      arrivedAt: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      discontinued: i % 10 === 9,
      note: '',
    })
  }
  return items
}