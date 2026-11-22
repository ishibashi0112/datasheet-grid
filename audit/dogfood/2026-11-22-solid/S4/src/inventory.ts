import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'

export type Item = {
  id: number
  code: string
  name: string
  category: 'A' | 'B' | 'C'
  qty: number | null
  price: number
  due: string | null
}

export const CATEGORY_LABEL = { A: '文具', B: '日用品', C: '食品' } as const

export const inventoryColumns: GridColumn<Item>[] = [
  { key: 'code', title: '品番', width: 100, pinned: 'left', editable: false, filterType: 'text' },
  { key: 'name', title: '品名', width: 160, filterType: 'text' },
  {
    key: 'category',
    title: '区分',
    width: 100,
    editor: {
      type: 'select',
      options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
      clipboard: 'label',
    },
    valueFormatter: ({ value }) => CATEGORY_LABEL[value as Item['category']] ?? String(value ?? ''),
    filterType: 'set',
  },
  {
    key: 'qty',
    title: '数量',
    width: 90,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    valueFormatter: numberFormatter(),
    filterType: 'number',
  },
  { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number', min: 0 } },
  {
    key: 'amount',
    title: '金額',
    width: 110,
    align: 'right',
    editable: false,
    getValue: (row) => (row.qty ?? 0) * row.price,
    valueFormatter: numberFormatter(),
  },
  { key: 'due', title: '納期', width: 120, editor: { type: 'date' } },
]

export function makeItems(n: number): Item[] {
  const cats = ['A', 'B', 'C'] as const
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    code: `P-${String(i + 1).padStart(3, '0')}`,
    name: `品目${i + 1}`,
    category: cats[i % 3]!,
    qty: (i * 7) % 50,
    price: 100 + i * 10,
    due: `2026-12-${String((i % 28) + 1).padStart(2, '0')}`,
  }))
}
