// ダッシュボード用の生成データ(乱数は固定の種で毎回同じ)

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T

export const REGIONS = ['北海道', '東北', '関東', '中部', '関西', '中国', '四国', '九州'] as const
export const STATUSES = ['受注', '出荷済', '請求済', '入金済', '取消'] as const
export const WAREHOUSES = ['東京第一', '東京第二', '大阪', '名古屋', '福岡'] as const
export const REPS = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤'] as const
const PRODUCTS = ['ノートPC 14型', 'モニター 27型', 'キーボード', 'マウス', 'ドッキングステーション', 'Webカメラ', 'ヘッドセット', 'USB-C ハブ', 'プリンター', 'スキャナー', 'タブレット', '外付けSSD 1TB']
const COMPANY_A = ['東邦', '北斗', '大和', '富士', '浜松', '青葉', '桜', '高砂', '双葉', '旭']
const COMPANY_B = ['商事', '工業', '電機', '物産', 'システムズ', '製作所', 'ホールディングス', '運輸']

export type SaleRow = {
  id: number
  date: string
  region: (typeof REGIONS)[number]
  customer: string
  product: string
  qty: number
  unitPrice: number
  status: (typeof STATUSES)[number]
  paid: boolean
  note: string
}

export type StockRow = {
  sku: string
  name: string
  warehouse: (typeof WAREHOUSES)[number]
  stock: number
  reorder: number
  updatedAt: string
}

export type OrderRow = {
  orderNo: string
  orderedAt: string
  customer: string
  rep: (typeof REPS)[number]
  amount: number
  dueDate: string
  priority: '高' | '中' | '低'
  shipped: boolean
}

export type KpiRow = {
  rep: (typeof REPS)[number]
  target: number
  actual: number
  deals: number
  growth: number
}

export type CustomerRow = {
  code: string
  name: string
  region: (typeof REGIONS)[number]
  rank: 'S' | 'A' | 'B' | 'C'
  contractDate: string
  active: boolean
  memo: string
}

function isoDate(base: Date, offsetDays: number): string {
  const d = new Date(base.getTime() + offsetDays * 86400000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const BASE = new Date(2026, 10, 9)

export function makeCompany(rnd: () => number): string {
  return `${pick(rnd, COMPANY_A)}${pick(rnd, COMPANY_B)}`
}

export function makeSales(n: number): SaleRow[] {
  const rnd = mulberry32(1)
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    date: isoDate(BASE, -Math.floor(rnd() * 365)),
    region: pick(rnd, REGIONS),
    customer: makeCompany(rnd),
    product: pick(rnd, PRODUCTS),
    qty: 1 + Math.floor(rnd() * 50),
    unitPrice: (5 + Math.floor(rnd() * 300)) * 100,
    status: pick(rnd, STATUSES),
    paid: rnd() < 0.5,
    note: rnd() < 0.2 ? '至急対応。担当者へ折り返し連絡すること' : '',
  }))
}

export function makeStock(n: number): StockRow[] {
  const rnd = mulberry32(2)
  return Array.from({ length: n }, (_, i) => ({
    sku: `SKU-${String(i + 1).padStart(5, '0')}`,
    name: `${pick(rnd, PRODUCTS)}(${pick(rnd, ['黒', '白', '銀', '青'])})`,
    warehouse: pick(rnd, WAREHOUSES),
    stock: Math.floor(rnd() * 1000),
    reorder: 50 + Math.floor(rnd() * 200),
    updatedAt: isoDate(BASE, -Math.floor(rnd() * 60)),
  }))
}

export function makeOrders(n: number): OrderRow[] {
  const rnd = mulberry32(3)
  return Array.from({ length: n }, (_, i) => {
    const ordered = -Math.floor(rnd() * 120)
    return {
      orderNo: `ORD-${String(20260000 + i + 1)}`,
      orderedAt: isoDate(BASE, ordered),
      customer: makeCompany(rnd),
      rep: pick(rnd, REPS),
      amount: Math.floor(rnd() * 5000) * 1000,
      dueDate: isoDate(BASE, ordered + 7 + Math.floor(rnd() * 30)),
      priority: pick(rnd, ['高', '中', '低'] as const),
      shipped: rnd() < 0.6,
    }
  })
}

export function makeKpi(): KpiRow[] {
  const rnd = mulberry32(4)
  return REPS.map((rep) => {
    const target = (50 + Math.floor(rnd() * 100)) * 100000
    return {
      rep,
      target,
      actual: Math.floor(target * (0.5 + rnd() * 0.9)),
      deals: 5 + Math.floor(rnd() * 40),
      growth: Math.round((rnd() * 60 - 30) * 10) / 10,
    }
  })
}

export function makeCustomers(n: number): CustomerRow[] {
  const rnd = mulberry32(5)
  return Array.from({ length: n }, (_, i) => ({
    code: `C${String(i + 1).padStart(4, '0')}`,
    name: makeCompany(rnd) + ' 株式会社',
    region: pick(rnd, REGIONS),
    rank: pick(rnd, ['S', 'A', 'B', 'C'] as const),
    contractDate: isoDate(BASE, -Math.floor(rnd() * 2000)),
    active: rnd() < 0.8,
    memo: '',
  }))
}
