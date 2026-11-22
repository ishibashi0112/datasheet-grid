// ログ 1,000,000 行と株価 2,000 銘柄のデータ(Solid 版と React 版で同じファイル)
export type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
export type LogRow = {
  id: number
  time: string
  level: Level
  service: string
  message: string
  traceId: string
}

export const SERVICES = ['api-gateway', 'auth', 'billing', 'search', 'inventory', 'notification', 'worker', 'frontend']
const LEVELS: Level[] = ['DEBUG', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'WARN', 'WARN', 'ERROR']

function createRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SHORT = [
  'リクエストを受け付けました',
  'キャッシュにヒットしました',
  'ユーザーがログインしました',
  'ジョブを開始しました',
  'ジョブが完了しました',
  'connection pool exhausted, retrying',
  'upstream timeout after 3000ms',
  '在庫の引当に失敗しました(在庫不足)',
  '決済サービスから 502 が返りました',
  'slow query detected',
]
const LONG_TAIL = [
  '。直前の 5 分間で同じエラーが 12 回発生しています。設定値 retry.maxAttempts=3、backoff=exponential、timeout=3000ms で再試行しましたが、いずれも上流のロードバランサーからの応答がありませんでした。',
  ' — stack: at handleRequest (server.ts:120) at processTicksAndRejections (node:internal/process/task_queues:95) at async Router.dispatch (router.ts:58)',
  '。ユーザー ID とセッション ID は detail を参照してください。',
  '',
  '',
  '',
]
// メッセージは 2,000 種類を使い回す(同じ文字列を共有してメモリを抑える)
const MESSAGES: string[] = (() => {
  const r = createRandom(42)
  return Array.from({ length: 2000 }, (_, i) => {
    const base = SHORT[Math.floor(r() * SHORT.length)]!
    const tail = LONG_TAIL[Math.floor(r() * LONG_TAIL.length)]!
    return `${base} (#${i})${tail}`
  })
})()

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
export function formatTime(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 古い順(末尾が今)
export function createLogs(count: number, endMs = Date.now(), spanDays = 40): LogRow[] {
  const r = createRandom(7)
  const start = endMs - spanDays * 86_400_000
  const step = (endMs - start) / count
  const rows: LogRow[] = new Array(count)
  for (let i = 0; i < count; i++) {
    rows[i] = {
      id: i + 1,
      time: formatTime(start + i * step),
      level: LEVELS[Math.floor(r() * LEVELS.length)]!,
      service: SERVICES[Math.floor(r() * SERVICES.length)]!,
      message: MESSAGES[Math.floor(r() * MESSAGES.length)]!,
      traceId: (i * 2654435761 >>> 0).toString(16).padStart(8, '0') + pad(i % 97),
    }
  }
  return rows
}

let nextId = 2_000_000
export function createLiveLogs(n: number): LogRow[] {
  const r = createRandom(nextId)
  const now = Date.now()
  return Array.from({ length: n }, () => ({
    id: nextId++,
    time: formatTime(now),
    level: LEVELS[Math.floor(r() * LEVELS.length)]!,
    service: SERVICES[Math.floor(r() * SERVICES.length)]!,
    message: MESSAGES[Math.floor(r() * MESSAGES.length)]!,
    traceId: (nextId * 2654435761 >>> 0).toString(16).padStart(8, '0'),
  }))
}

export function logPayload(row: LogRow) {
  return {
    id: row.id,
    traceId: row.traceId,
    service: row.service,
    level: row.level,
    http: { method: ['GET', 'POST', 'PUT'][row.id % 3], path: `/v1/${row.service}/items/${row.id % 1000}`, status: row.level === 'ERROR' ? 502 : 200 },
    user: { id: `u-${row.id % 5000}`, session: `s-${(row.id * 31) % 100000}` },
    durationMs: (row.id * 7) % 4000,
  }
}

// ---- 株価 ----
export type Signal = '買い' | '中立' | '売り'
export type Stock = {
  symbol: string
  name: string
  sector: string
  price: number
  prevClose: number
  changePct: number
  volume: number
  signal: Signal
  memo: string
}
export const SECTORS = ['電気機器', '情報・通信', '銀行', '輸送用機器', '医薬品', '小売', '化学', '機械', '不動産', 'サービス']
const KANA = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ', 'テ', 'ト']

export function createStocks(count = 2000): Stock[] {
  const r = createRandom(99)
  return Array.from({ length: count }, (_, i) => {
    const prevClose = Math.round(300 + r() * 9700)
    const price = Math.round(prevClose * (1 + (r() - 0.5) * 0.06))
    return {
      symbol: String(1300 + i * 4),
      name: `${KANA[i % 20]}${KANA[(i * 7) % 20]}${KANA[(i * 13) % 20]}${['工業', '電機', 'HD', '銀行', '製薬', '商事', '化学', '不動産'][i % 8]}`,
      sector: SECTORS[i % SECTORS.length]!,
      price,
      prevClose,
      changePct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
      volume: Math.floor(r() * 5_000_000),
      signal: (['買い', '中立', '売り'] as const)[Math.floor(r() * 3)]!,
      memo: '',
    }
  })
}

// 100 銘柄の値を動かした新しい配列(変わらない行は同じ参照)
const tickRandom = createRandom(1234)
export function tick(prev: readonly Stock[], n = 100): Stock[] {
  const next = prev.slice()
  for (let k = 0; k < n; k++) {
    const i = Math.floor(tickRandom() * next.length)
    const s = next[i]!
    const price = Math.max(1, Math.round(s.price * (1 + (tickRandom() - 0.5) * 0.01)))
    const changePct = Math.round(((price - s.prevClose) / s.prevClose) * 10000) / 100
    next[i] = {
      ...s,
      price,
      changePct,
      volume: s.volume + Math.floor(tickRandom() * 5000),
      signal: changePct > 1.5 ? '買い' : changePct < -1.5 ? '売り' : '中立',
    }
  }
  return next
}

export const INDICES: Stock[] = [
  { symbol: 'N225', name: '日経平均', sector: '指数', price: 38500, prevClose: 38200, changePct: 0.79, volume: 0, signal: '中立', memo: '' },
  { symbol: 'TOPIX', name: 'TOPIX', sector: '指数', price: 2710, prevClose: 2700, changePct: 0.37, volume: 0, signal: '中立', memo: '' },
]
