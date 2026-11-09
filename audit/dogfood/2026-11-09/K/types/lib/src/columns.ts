import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

export type Item = {
  id: string
  name: string
  qty: number | null
  price: number
  category: 'a' | 'b'
}

// 推論のまま export する(注釈なし)
export const yen = numberFormatter()
export const yenFixed = numberFormatter({ minimumFractionDigits: 0, maximumFractionDigits: 0, locale: 'ja-JP' })

// 注釈あり
export const itemColumns: GridColumn<Item>[] = [
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number', min: 0, integer: true } },
  { key: 'price', title: '単価', width: 100, valueFormatter: yen },
]

// satisfies で推論のまま
export const priceColumn = {
  key: 'price',
  title: '単価',
  width: 100,
  valueFormatter: yen,
  validate: ({ value }) => Number(value) >= 0 || '0 以上',
} satisfies GridColumn<Item>

// 汎用の列ファクトリ
export function moneyColumn<T>(key: string, title: string) {
  return { key, title, width: 120, align: 'right' as const, valueFormatter: yen, editor: { type: 'number' as const, min: 0 } } satisfies GridColumn<T>
}

export const defineColumns = <T,>(cols: GridColumn<T>[]) => cols
export const inferredColumns = defineColumns<Item>([{ key: 'name', width: 100 }])
