// ログの生成(本物のアプリならサーバーから取る。ここでは決まった乱数で作る)

export type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

export type LogRow = {
  id: number
  ts: string // 'YYYY-MM-DD HH:mm:ss.SSS'(ローカル時刻)
  level: Level
  service: string
  message: string
  traceId: string
}

export const SERVICES = [
  'api-gateway',
  'auth',
  'billing',
  'catalog',
  'checkout',
  'inventory',
  'notification',
  'search',
] as const

const LEVELS: { level: Level; w: number }[] = [
  { level: 'DEBUG', w: 20 },
  { level: 'INFO', w: 60 },
  { level: 'WARN', w: 12 },
  { level: 'ERROR', w: 7 },
  { level: 'FATAL', w: 1 },
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad2 = (n: number) => (n < 10 ? '0' + n : '' + n)
const pad3 = (n: number) => (n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n)

export function formatTs(ms: number): string {
  const d = new Date(ms)
  return (
    d.getFullYear() +
    '-' +
    pad2(d.getMonth() + 1) +
    '-' +
    pad2(d.getDate()) +
    ' ' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes()) +
    ':' +
    pad2(d.getSeconds()) +
    '.' +
    pad3(d.getMilliseconds())
  )
}

const HEX = '0123456789abcdef'
function traceId(rand: () => number): string {
  let s = ''
  for (let i = 0; i < 16; i++) s += HEX[(rand() * 16) | 0]
  return s
}

const USERS = ['u-1024', 'u-2048', 'u-31337', 'u-777', 'u-4096', 'u-90210']
const PATHS = ['/v1/orders', '/v1/users/me', '/v1/cart/items', '/v1/search?q=shoes', '/v1/payments', '/healthz']

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[(rand() * arr.length) | 0] as T
}

function message(rand: () => number, level: Level, service: string): string {
  const r = rand()
  const user = pick(rand, USERS)
  const path = pick(rand, PATHS)
  const ms = (rand() * 900 + 3) | 0
  if (level === 'DEBUG') {
    return r < 0.5
      ? `cache lookup key=${service}:${user} hit=${rand() < 0.7}`
      : `SQL SELECT * FROM ${service}_items WHERE owner_id = '${user}' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50 (${ms}ms)`
  }
  if (level === 'INFO') {
    if (r < 0.4) return `GET ${path} 200 ${ms}ms user=${user}`
    if (r < 0.7) return `POST ${path} 201 ${ms}ms user=${user} bytes=${(rand() * 9000) | 0}`
    if (r < 0.85) return `ユーザー ${user} がログインしました(2 段階認証: ${rand() < 0.5 ? 'SMS' : 'アプリ'})`
    return `バッチ処理「在庫の同期」が完了しました。対象 ${(rand() * 5000) | 0} 件、更新 ${(rand() * 300) | 0} 件、スキップ ${(rand() * 20) | 0} 件。次回の実行は 15 分後です。`
  }
  if (level === 'WARN') {
    if (r < 0.5) return `slow request: ${path} took ${ms * 10}ms (threshold 2000ms) user=${user} upstream=${pick(rand, SERVICES)}`
    return `接続プールの使用率が ${(80 + rand() * 19) | 0}% を超えました。最大接続数 100 のうち空きが少なくなっています。設定 db.pool.max の見直しを検討してください。`
  }
  if (r < 0.3) {
    return `Unhandled exception in ${service}: TypeError: Cannot read properties of undefined (reading 'items')\n    at handler (${service}/src/handler.ts:${(rand() * 400) | 0}:13)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)`
  }
  if (r < 0.6) {
    return `upstream ${pick(rand, SERVICES)} returned 503 Service Unavailable after 3 retries (${ms * 3}ms). circuit breaker is now OPEN for 30s. path=${path} user=${user}`
  }
  return `決済の確定に失敗しました。カード会社からの応答がタイムアウトしました(${ms * 20}ms)。注文は「保留」のままです。ユーザー ${user} に再試行の案内を送ります。`
}

/** 時刻の昇順に count 行を作る。最後の行の時刻が endMs 付近になる */
export function generateLogs(count: number, endMs: number, seed = 42): LogRow[] {
  const rand = mulberry32(seed)
  const rows: LogRow[] = new Array(count)
  const spanMs = 7 * 24 * 3600 * 1000
  const step = spanMs / count
  let t = endMs - spanMs
  const totalW = LEVELS.reduce((s, l) => s + l.w, 0)
  for (let i = 0; i < count; i++) {
    t += step * (0.5 + rand())
    let x = rand() * totalW
    let level: Level = 'INFO'
    for (const l of LEVELS) {
      if (x < l.w) {
        level = l.level
        break
      }
      x -= l.w
    }
    const service = pick(rand, SERVICES)
    rows[i] = {
      id: i + 1,
      ts: formatTs(t),
      level,
      service,
      message: message(rand, level, service),
      traceId: traceId(rand),
    }
  }
  return rows
}

let liveSeed = 1000
let lastLiveMs = 0
/** 末尾に足す新しいログ(今の時刻) */
export function makeLiveLogs(count: number, startId: number): LogRow[] {
  const rand = mulberry32(liveSeed++)
  const out: LogRow[] = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const ms = Math.max(lastLiveMs + 1, now - 1000 + (i * 1000) / count)
    lastLiveMs = ms
    const lv = rand()
    const level: Level = lv < 0.2 ? 'DEBUG' : lv < 0.8 ? 'INFO' : lv < 0.92 ? 'WARN' : lv < 0.99 ? 'ERROR' : 'FATAL'
    const service = pick(rand, SERVICES)
    out.push({ id: startId + i, ts: formatTs(ms), level, service, message: message(rand, level, service), traceId: traceId(rand) })
  }
  return out
}

/** 展開行に出す詳細(本物のアプリなら開いたときにサーバーから取る) */
export function getPayload(row: LogRow) {
  const rand = mulberry32(row.id * 7919)
  return {
    timestamp: row.ts,
    level: row.level,
    service: row.service,
    traceId: row.traceId,
    spanId: traceId(rand).slice(0, 8),
    host: `${row.service}-${(rand() * 8) | 0}.prod.internal`,
    http: { method: rand() < 0.5 ? 'GET' : 'POST', status: row.level === 'ERROR' ? 500 : 200, durationMs: (rand() * 900) | 0 },
    user: { id: pick(rand, USERS), region: pick(rand, ['ap-northeast-1', 'us-east-1', 'eu-west-1']) },
  }
}

export function getStack(row: LogRow): string | null {
  if (row.level !== 'ERROR' && row.level !== 'FATAL') return null
  return [
    `Error: ${row.message.split('\n')[0]}`,
    `    at ${row.service}.handle (/app/${row.service}/src/handler.ts:120:15)`,
    `    at Router.dispatch (/app/node_modules/router/index.js:284:7)`,
    `    at Layer.handle (/app/node_modules/router/lib/layer.js:95:5)`,
    `    at async Server.<anonymous> (/app/server.ts:44:9)`,
  ].join('\n')
}