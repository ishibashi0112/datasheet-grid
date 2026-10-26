// サンプルの在庫データ。乱数の種を固定して、開くたびに同じデータになるようにしています。
export type Status = '販売中' | '入荷待ち' | '販売終了'

export type Item = {
  id: number
  code: string
  name: string
  category: string
  qty: number | null
  price: number
  arrivedAt: string
  status: Status
}

export const CATEGORIES = ['文具', '日用品', '食品', '家電', '衣料'] as const
export const STATUSES: readonly Status[] = ['販売中', '入荷待ち', '販売終了']

const PRODUCTS: Record<(typeof CATEGORIES)[number], string[]> = {
  文具: ['ボールペン', 'ノート', '付箋', 'ホッチキス', 'クリアファイル'],
  日用品: ['洗剤', '歯ブラシ', 'タオル', 'ハンドソープ', 'ゴミ袋'],
  食品: ['緑茶', 'コーヒー豆', '味噌', '醤油', 'パスタ'],
  家電: ['電気ケトル', 'ドライヤー', '扇風機', '炊飯器', '電卓'],
  衣料: ['靴下', 'Tシャツ', '手袋', '帽子', 'エプロン'],
}
const VARIANTS = ['S', 'M', 'L', '徳用', '限定']

// 種を決めると同じ並びを返す乱数(mulberry32)
function createRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(random: () => number, values: readonly T[]): T => values[Math.floor(random() * values.length)]

export function createItem(id: number, random = createRandom(id)): Item {
  const category = pick(random, CATEGORIES)
  const month = 1 + Math.floor(random() * 12)
  const day = 1 + Math.floor(random() * 28)
  return {
    id,
    code: `P-${String(id).padStart(5, '0')}`,
    name: `${pick(random, PRODUCTS[category])} ${pick(random, VARIANTS)}`,
    category,
    qty: Math.floor(random() * 500),
    price: (1 + Math.floor(random() * 300)) * 10,
    arrivedAt: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    status: pick(random, STATUSES),
  }
}

export function createItems(count: number): Item[] {
  const random = createRandom(20261025)
  return Array.from({ length: count }, (_, index) => createItem(index + 1, random))
}