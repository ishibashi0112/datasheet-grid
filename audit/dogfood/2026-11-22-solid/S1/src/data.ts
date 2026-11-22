// 在庫・発注表のデータ(乱数の種を固定)
export type Category = 'stationery' | 'daily' | 'food' | 'appliance'
export type Status = 'draft' | 'confirmed'

export type Item = {
  id: number
  code: string
  name: string
  category: Category
  qty: number | null
  price: number | null
  due: string | null
  reorder: boolean
  note: string
  status: Status
}

export const CATEGORY_OPTIONS = [
  { value: 'stationery', label: '文具' },
  { value: 'daily', label: '日用品' },
  { value: 'food', label: '食品' },
  { value: 'appliance', label: '家電' },
] as const

export const STATUS_OPTIONS = [
  { value: 'draft', label: '下書き' },
  { value: 'confirmed', label: '確定済み' },
] as const

const NAMES: Record<Category, string[]> = {
  stationery: ['ボールペン', 'ノート', '付箋', 'ホッチキス'],
  daily: ['洗剤', '歯ブラシ', 'タオル', 'ゴミ袋'],
  food: ['緑茶', 'コーヒー豆', '味噌', 'パスタ'],
  appliance: ['電気ケトル', 'ドライヤー', '扇風機', '電卓'],
}

function createRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createItems(count: number): Item[] {
  const r = createRandom(1121)
  const cats = CATEGORY_OPTIONS.map((o) => o.value)
  return Array.from({ length: count }, (_, i) => {
    const category = cats[Math.floor(r() * cats.length)]!
    const names = NAMES[category]
    return {
      id: i + 1,
      code: `P-${String(i + 1).padStart(5, '0')}`,
      name: names[Math.floor(r() * names.length)]!,
      category,
      qty: Math.floor(r() * 300),
      price: (1 + Math.floor(r() * 200)) * 10,
      due: `2026-12-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
      reorder: r() < 0.2,
      note: i % 7 === 0 ? '先方へ確認済み\n納期は前後する可能性あり' : '',
      status: i % 5 === 0 ? 'confirmed' : 'draft',
    }
  })
}

let nextId = 100000
export function newItem(partial: Partial<Item>): Item {
  nextId += 1
  return {
    id: nextId,
    code: `N-${nextId}`,
    name: '',
    category: 'stationery',
    qty: 0,
    price: 0,
    due: null,
    reorder: false,
    note: '',
    status: 'draft',
    ...partial,
  }
}
