// サーバーの代わり。ブラウザの中に 100,000 件の受注データを持ち、遅延を付けて返します。
//   実際のアプリではここが API の呼び出し(fetch)になり、サーバーは query を
//   データベースの WHERE / ORDER BY へ、startIndex / endIndex を OFFSET / LIMIT へ読み替えます。
import type { ColumnFilterValue, ServerSideQuery } from '@ishibashi0112/spreadsheet-grid'

export type Order = {
  id: number
  code: string
  customer: string
  category: string
  status: string
  qty: number
  price: number
  orderedAt: string
}

export const TOTAL_ORDERS = 100_000
export const CATEGORIES = ['家電', '食品', '衣料', '書籍', '雑貨']
export const STATUSES = ['受注', '出荷準備', '出荷済', 'キャンセル']
const CUSTOMERS = ['山田商事', '鈴木物産', '佐藤工業', '田中電機', '高橋製作所', '伊藤商店', '渡辺興業', '中村流通']

const READ_DELAY_MS = 400
const SAVE_DELAY_MS = 600

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

const random = createRandom(20261025)
const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)]
const orders: Order[] = Array.from({ length: TOTAL_ORDERS }, (_, index) => ({
  id: index + 1,
  code: `ORD-${String(index + 1).padStart(6, '0')}`,
  customer: pick(CUSTOMERS),
  category: pick(CATEGORIES),
  status: pick(STATUSES),
  qty: 1 + Math.floor(random() * 200),
  price: (1 + Math.floor(random() * 1000)) * 100,
  orderedAt: `2026-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`,
}))

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    // スクロールで通り過ぎた範囲の取得は、グリッドが signal で取り消します
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

// 列フィルター 1 つの判定。この例の列で使う種類(text / date / set / number)だけを扱います。
function matchFilter(value: unknown, filter: ColumnFilterValue): boolean {
  switch (filter.kind) {
    case 'text':
    case 'date':
      return String(value ?? '').toLowerCase().includes(filter.value.toLowerCase())
    case 'set': {
      const hit = filter.values.includes(String(value ?? ''))
      return filter.mode === 'exclude' ? !hit : hit
    }
    case 'number': {
      const parsed = filter.parsed
      if (parsed === null) return String(value ?? '').includes(filter.raw)
      if (parsed.mode === 'blank' || parsed.mode === 'notBlank') {
        return (value === null || value === undefined || value === '') === (parsed.mode === 'blank')
      }
      const num = Number(value)
      if (parsed.mode === 'range') return num >= parsed.min && num <= parsed.max
      switch (parsed.operator) {
        case '>':
          return num > parsed.value
        case '>=':
          return num >= parsed.value
        case '<':
          return num < parsed.value
        case '<=':
          return num <= parsed.value
        case '=':
          return num === parsed.value
        case '!=':
          return num !== parsed.value
      }
      return true
    }
    default:
      // select / textSet / numberSet / dateSet / custom はこの例の列では使いません
      return true
  }
}

const collator = new Intl.Collator('ja')

function applyQuery(query: ServerSideQuery): Order[] {
  let result = orders
  const globalText = query.globalText?.toLowerCase()
  if (globalText) {
    result = result.filter((order) => Object.values(order).some((value) => String(value).toLowerCase().includes(globalText)))
  }
  for (const [key, filter] of Object.entries(query.columnFilters ?? {})) {
    result = result.filter((order) => matchFilter(order[key as keyof Order], filter))
  }
  const sort = query.sort ?? []
  if (sort.length > 0) {
    result = [...result].sort((a, b) => {
      for (const { columnKey, direction } of sort) {
        const av = a[columnKey as keyof Order]
        const bv = b[columnKey as keyof Order]
        const diff = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv))
        if (diff !== 0) return direction === 'desc' ? -diff : diff
      }
      return 0
    })
  }
  return result
}

// 同じ条件での続きの取得(スクロール)で毎回並べ替えないよう、直前の結果を覚えておきます
let lastQueryKey: string | null = null
let lastResult: Order[] = []

export async function fetchOrders(params: {
  startIndex: number
  endIndex: number
  query: ServerSideQuery
  signal: AbortSignal
}): Promise<{ rows: Order[]; totalRowCount: number }> {
  await delay(READ_DELAY_MS, params.signal)
  const queryKey = JSON.stringify(params.query)
  if (queryKey !== lastQueryKey) {
    lastResult = applyQuery(params.query)
    lastQueryKey = queryKey
  }
  return { rows: lastResult.slice(params.startIndex, params.endIndex), totalRowCount: lastResult.length }
}

let failSaves = false

// 画面の「保存を失敗させる」から切り替えます
export function setFailSaves(value: boolean) {
  failSaves = value
}

export async function saveOrders(rows: Order[]): Promise<void> {
  await delay(SAVE_DELAY_MS)
  if (failSaves) throw new Error('保存に失敗しました(サンプルの設定)')
  for (const row of rows) orders[row.id - 1] = row
  lastQueryKey = null
}