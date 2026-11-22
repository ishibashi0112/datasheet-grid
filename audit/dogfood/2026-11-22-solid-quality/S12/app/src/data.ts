// 計画表のデータ: 20,000 品目 × 192 か月(2011/01〜2026/12)。乱数の種を固定する。
export type PlanRow = {
  id: number
  code: string
  name: string
  dept: string
  owner: string
  v: number[]
  [extra: string]: unknown
}

export const MONTHS: { key: string; title: string }[] = []
for (let y = 2011; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) MONTHS.push({ key: `m${y}${String(m).padStart(2, '0')}`, title: `${y}/${String(m).padStart(2, '0')}` })
}

export const DEPTS = ['営業一課', '営業二課', '開発', '製造', '物流', '管理'] as const
const ITEMS = ['ボルト', 'ナット', 'ワッシャー', 'ギア', 'ベアリング', 'シャフト', 'バルブ', 'ポンプ', 'モーター', 'センサー']
const OWNERS = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村']

function createRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRows(count: number): PlanRow[] {
  const random = createRandom(20261122)
  const rows: PlanRow[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const base = 100 + Math.floor(random() * 900)
    const v = new Array<number>(MONTHS.length)
    for (let j = 0; j < MONTHS.length; j++) v[j] = Math.max(0, Math.round(base + (random() - 0.5) * base * 0.4))
    rows[i] = {
      id: i + 1,
      code: `P${String(i + 1).padStart(5, '0')}`,
      name: `${ITEMS[i % ITEMS.length]} ${String.fromCharCode(65 + (i % 26))}-${(i % 97) + 1}`,
      dept: DEPTS[i % DEPTS.length]!,
      owner: OWNERS[i % OWNERS.length]!,
      v,
    }
  }
  return rows
}

export const PEERS = [
  { name: '佐藤', color: '#e11d48' },
  { name: '鈴木', color: '#2563eb' },
  { name: '高橋', color: '#16a34a' },
  { name: '田中', color: '#d97706' },
  { name: '伊藤', color: '#7c3aed' },
  { name: '渡辺', color: '#0891b2' },
]
