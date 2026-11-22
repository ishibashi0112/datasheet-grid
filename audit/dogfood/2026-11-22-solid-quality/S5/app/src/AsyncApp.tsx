// ?async: ログと株価をサーバー(遅延付きの擬似 API)から読む形。
// 行は非同期の書き込める signal(createSignal(() => fetch…))で持ち、<Loading> / <Errored> で包む。
// 環境(ログ)/ 市場(株価)を切り替えると取り直す。取り直しの間は前の行を出し続け、isPending で「更新中」を出す。
// ?loadingon を付けると <Loading on={…}> で取り直しの間も読み込み中の表示に戻す。
import { createDeferred, createMemo, createSignal, Errored, isPending, Loading, Show, type Setter } from 'solid-js'
import { LogsView, StocksView } from './main'
import { createLogs, createStocks, type LogRow, type Stock } from './data'

const params = new URLSearchParams(location.search)
const N = Number(params.get('n') ?? 200_000)
const w = window as any
type Env = 'prod' | 'stg' | 'dev' | 'broken'
type Market = 'tse' | 'nyse'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
w.__fetches = []
async function fetchLogs(env: Env): Promise<LogRow[]> {
  const t0 = performance.now()
  w.__fetches.push(`logs:${env}:start`)
  await delay(Number(params.get('delay') ?? 1200))
  if (env === 'broken') {
    w.__fetches.push(`logs:${env}:fail`)
    throw new Error('ログ サーバーが 503 を返しました')
  }
  const count = env === 'prod' ? N : env === 'stg' ? Math.floor(N / 2) : Math.floor(N / 4)
  const offset = env === 'prod' ? 0 : env === 'stg' ? 10_000_000 : 20_000_000
  const rows = createLogs(count).map((r) => (offset ? { ...r, id: r.id + offset, traceId: env + '-' + r.traceId } : r))
  w.__fetches.push(`logs:${env}:done ${Math.round(performance.now() - t0)}ms ${rows.length}`)
  return rows
}
async function fetchStocks(market: Market): Promise<Stock[]> {
  w.__fetches.push(`stocks:${market}:start`)
  await delay(Number(params.get('delay') ?? 1200))
  const rows = createStocks(market === 'tse' ? 2000 : 1000).map((s) => (market === 'tse' ? s : { ...s, symbol: 'NY' + s.symbol, name: s.name + '(米)' }))
  w.__fetches.push(`stocks:${market}:done ${rows.length}`)
  return rows
}

export function AsyncApp() {
  const [tab, setTab] = createSignal<'logs' | 'stocks'>((params.get('tab') as any) ?? 'logs')
  const [env, setEnv] = createSignal<Env>('prod')
  const [market, setMarket] = createSignal<Market>('tse')
  // ?deferred: createDeferred(取り直しの間は前の値のまま、ほかの画面は先へ進む)+ 末尾に足した行は別の signal
  const deferred = params.has('deferred')
  const [asyncLogs, setAsyncLogs] = createSignal<LogRow[]>(() => (deferred ? [] : fetchLogs(env())))
  const base = deferred ? createDeferred(() => fetchLogs(env())) : null
  const [appended, setAppended] = createSignal<LogRow[]>([])
  const logs = deferred ? createMemo(() => { const b = base!(); const a = appended(); return a.length ? [...b, ...a] : b }) : asyncLogs
  const setLogs = (deferred
    ? (fn: (prev: LogRow[]) => LogRow[]) => { const next = fn(logs()); setAppended(next.slice(base!().length)) }
    : setAsyncLogs) as Setter<LogRow[]>
  const [stocks, setStocks] = createSignal<Stock[]>(() => fetchStocks(market()))
  w.__setTab = setTab
  w.__setEnv = setEnv
  w.__setMarket = setMarket
  const loadingOn = params.has('loadingon')
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', padding: '8px', 'box-sizing': 'border-box', gap: '6px' }}>
      <nav style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
        <button data-testid="tab-logs" aria-pressed={tab() === 'logs' ? 'true' : 'false'} onClick={() => setTab('logs')}>ログ</button>
        <button data-testid="tab-stocks" aria-pressed={tab() === 'stocks' ? 'true' : 'false'} onClick={() => setTab('stocks')}>株価</button>
        <Show when={tab() === 'logs'} fallback={
          <select data-testid="market" value={market()} onChange={(e) => setMarket(e.currentTarget.value as Market)}>
            <option value="tse">東証</option>
            <option value="nyse">NY</option>
          </select>
        }>
          <select data-testid="env" value={env()} onChange={(e) => setEnv(e.currentTarget.value as Env)}>
            <option value="prod">本番</option>
            <option value="stg">検証</option>
            <option value="dev">開発</option>
            <option value="broken">(落ちている環境)</option>
          </select>
        </Show>
      </nav>
      <div style={{ flex: 1, 'min-height': 0 }}>
        <Errored
          fallback={(err, reset) => (
            <div data-testid="error" style={{ padding: '16px', color: '#b91c1c' }}>
              読み込みに失敗しました: {String((err() as Error)?.message ?? err())}{' '}
              <button data-testid="retry" onClick={() => { setEnv('prod'); reset() }}>本番に戻して再読み込み</button>
            </div>
          )}
        >
          <Show when={tab() === 'logs'} fallback={
            <Loading fallback={<div data-testid="loading">株価を読み込み中…</div>} on={loadingOn ? market() : undefined}>
              <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
                <span data-testid="pending">{isPending(() => stocks()) ? '更新中…' : '最新'}</span>
                <div style={{ flex: 1, 'min-height': 0 }}>
                  <StocksView rows={stocks} setRows={setStocks} />
                </div>
              </div>
            </Loading>
          }>
            <Loading fallback={<div data-testid="loading">ログを読み込み中…</div>} on={loadingOn ? env() : undefined}>
              <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
                <span data-testid="pending">{isPending(() => logs()) ? '更新中…' : '最新'}</span>
                <div style={{ flex: 1, 'min-height': 0 }}>
                  <LogsView rows={logs()} setRows={setLogs} />
                </div>
              </div>
            </Loading>
          </Show>
        </Errored>
      </div>
    </div>
  )
}
