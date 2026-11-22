// ログと株価のライブ画面(React 版 1.2.1。Solid 版と同じ画面)
import { createRoot } from 'react-dom/client'
import { Suspense, use, useEffect, useMemo, useRef, useState, useTransition, type Dispatch, type SetStateAction } from 'react'
import { SpreadsheetGrid, numberFormatter, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { INDICES, createLiveLogs, createLogs, createStocks, logPayload, tick, type LogRow, type Stock } from './data'

const params = new URLSearchParams(location.search)
const LOG_COUNT = Number(params.get('n') ?? 1_000_000)
const w = window as any

const chipsService = { 'api-gateway': 'info', auth: 'good', billing: 'warning', search: 'info', inventory: 'neutral', notification: 'neutral', worker: 'neutral', frontend: 'good' } as const

const logColumns: GridColumn<LogRow>[] = [
  { key: 'time', title: '時刻', width: 170, pinned: 'left', filterType: 'dateSet', editable: false },
  { key: 'level', title: 'レベル', width: 100, filterType: 'set', editable: false, conditionalFormat: { chips: { ERROR: 'critical', WARN: 'warning', INFO: 'info', DEBUG: 'neutral' } } },
  { key: 'service', title: 'サービス', width: 140, filterType: 'set', editable: false, conditionalFormat: { chips: chipsService } },
  { key: 'message', title: 'メッセージ', width: 480, autoHeight: true, filterType: 'text', editable: false },
  { key: 'traceId', title: 'traceId', width: 150, filterType: 'text', editable: false },
]

const detailRow = {
  height: 200,
  render: (ctx: { row: LogRow }) => (
    <pre data-testid="detail-json" style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(logPayload(ctx.row), null, 2)}</pre>
  ),
}

function LogsView({ rows, setRows }: { rows: LogRow[]; setRows: Dispatch<SetStateAction<LogRow[]>> }) {
  const grid = useRef<SpreadsheetGridHandle<LogRow>>(null)
  const [tail, setTail] = useState(params.has('tail'))
  const [following, setFollowing] = useState(true)
  const follow = useRef(true)
  const tailRef = useRef(tail)
  tailRef.current = tail
  useEffect(() => {
    w.__logGrid = grid.current
    const id = setInterval(() => {
      if (!tailRef.current) return
      follow.current = grid.current?.isAtBottom() ?? true
      setRows((prev) => [...prev, ...createLiveLogs(50)])
    }, 1000)
    return () => clearInterval(id)
  }, [setRows])
  useEffect(() => {
    if (follow.current && tailRef.current) grid.current?.scrollToBottom()
  }, [rows])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label><input type="checkbox" data-testid="tail" checked={tail} onChange={(e) => setTail(e.currentTarget.checked)} /> 末尾を追う(毎秒 50 行)</label>
        <span data-testid="following">{following ? '末尾にいます' : '上を見ています'}</span>
        <button onClick={() => grid.current?.scrollToBottom()}>末尾へ</button>
        <span data-testid="logcount">{rows.length.toLocaleString()} 行</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SpreadsheetGrid
          ref={grid}
          rows={rows}
          columns={logColumns}
          rowKeyGetter={(row) => row.id}
          readOnly
          find
          autoHeight
          detailRow={detailRow}
          onScroll={(p) => setFollowing(p.atBottom ?? false)}
          height="100%"
        />
      </div>
    </div>
  )
}

const fmtPct = ({ value }: { value: unknown }) => (typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '')
function stockColumns(grouped: boolean): GridColumn<Stock>[] {
  return [
    { key: 'symbol', title: 'コード', width: 80, pinned: 'left', editable: false },
    { key: 'name', title: '銘柄', width: 150, editable: false, filterType: 'text' },
    { key: 'sector', title: '業種', width: 110, editable: false, rowGroup: grouped, filterType: 'set' },
    { key: 'price', title: '株価', width: 100, align: 'right', editable: false, valueFormatter: numberFormatter(), aggFunc: 'avg' },
    { key: 'changePct', title: '前日比', width: 100, align: 'right', editable: false, valueFormatter: fmtPct, aggFunc: 'avg', conditionalFormat: { colorScale: { type: 'diverging', min: -3, mid: 0, max: 3 } } },
    { key: 'volume', title: '出来高', width: 140, align: 'right', editable: false, valueFormatter: numberFormatter(), aggFunc: 'sum', conditionalFormat: { dataBar: {} } },
    { key: 'signal', title: 'シグナル', width: 100, editable: false, filterType: 'set', conditionalFormat: { chips: { 買い: 'good', 中立: 'neutral', 売り: 'critical' } } },
    { key: 'memo', title: 'メモ', width: 200 },
  ]
}

function StocksView({ rows, setRows }: { rows: Stock[]; setRows: Dispatch<SetStateAction<Stock[]>> }) {
  const grid = useRef<SpreadsheetGridHandle<Stock>>(null)
  const [mode, setMode] = useState<'signal' | 'apply' | 'off'>((params.get('mode') as any) ?? 'signal')
  const [grouped, setGrouped] = useState(params.has('group'))
  const columns = useMemo(() => stockColumns(grouped), [grouped])
  const [ticks, setTicks] = useState(0)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  useEffect(() => {
    w.__stockGrid = grid.current
    w.__setMode = setMode
    w.__stocks = () => rowsRef.current
    const id = setInterval(() => {
      const m = modeRef.current
      if (m === 'signal') setRows((prev) => tick(prev))
      else if (m === 'apply') grid.current?.applyRows((prev) => tick(prev), { undoable: false })
      if (m !== 'off') setTicks((t) => t + 1)
    }, 250)
    return () => clearInterval(id)
  }, [setRows])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select data-testid="mode" value={mode} onChange={(e) => setMode(e.currentTarget.value as any)}>
          <option value="signal">signal の配列を作り直す</option>
          <option value="apply">applyRows(undoable: false)</option>
          <option value="off">止める</option>
        </select>
        <label><input type="checkbox" data-testid="group" checked={grouped} onChange={(e) => setGrouped(e.currentTarget.checked)} /> 業種でまとめる</label>
        <span data-testid="ticks">更新 {ticks} 回</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SpreadsheetGrid
          ref={grid}
          rows={rows}
          onRowsChange={setRows}
          columns={columns}
          rowKeyGetter={(row) => row.symbol}
          highlightChanges
          animateRows
          activeCellFollows="row"
          pinnedTopRows={INDICES}
          height="100%"
        />
      </div>
    </div>
  )
}

function App() {
  const [tab, setTab] = useState<'logs' | 'stocks'>((params.get('tab') as any) ?? 'logs')
  const [logs, setLogs] = useState<LogRow[]>(() => {
    const t0 = performance.now()
    const r = createLogs(LOG_COUNT)
    w.__genMs = performance.now() - t0
    return r
  })
  const [stocks, setStocks] = useState<Stock[]>(createStocks)
  w.__setTab = setTab
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, boxSizing: 'border-box', gap: 6 }}>
      <nav style={{ display: 'flex', gap: 6 }}>
        <button data-testid="tab-logs" aria-pressed={tab === 'logs'} onClick={() => setTab('logs')}>ログ</button>
        <button data-testid="tab-stocks" aria-pressed={tab === 'stocks'} onClick={() => setTab('stocks')}>株価</button>
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'logs' ? <LogsView rows={logs} setRows={setLogs} /> : <StocksView rows={stocks} setRows={setStocks} />}
      </div>
    </div>
  )
}

// ?async: React 19 の use() + <Suspense> + startTransition で取り直す(Solid 版の ?async と同じ画面)
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function fetchLogs(env: string): Promise<LogRow[]> {
  await delay(Number(params.get('delay') ?? 1200))
  const N = Number(params.get('n') ?? 200_000)
  const count = env === 'prod' ? N : env === 'stg' ? Math.floor(N / 2) : Math.floor(N / 4)
  const offset = env === 'prod' ? 0 : env === 'stg' ? 10_000_000 : 20_000_000
  return createLogs(count).map((r) => (offset ? { ...r, id: r.id + offset, traceId: env + '-' + r.traceId } : r))
}
function AsyncLogs({ promise, pending }: { promise: Promise<LogRow[]>; pending: boolean }) {
  const data = use(promise)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <span data-testid="pending">{pending ? '更新中…' : '最新'}</span>
      <div style={{ flex: 1, minHeight: 0 }}><LogsView rows={data} setRows={() => {}} /></div>
    </div>
  )
}
function AsyncApp() {
  const [env, setEnv] = useState('prod')
  const [promise, setPromise] = useState(() => fetchLogs('prod'))
  const [pending, startTransition] = useTransition()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, boxSizing: 'border-box', gap: 6 }}>
      <nav>
        <select data-testid="env" value={env} onChange={(e) => { const v = e.currentTarget.value; setEnv(v); startTransition(() => setPromise(fetchLogs(v))) }}>
          <option value="prod">本番</option><option value="stg">検証</option><option value="dev">開発</option>
        </select>
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={<div data-testid="loading">ログを読み込み中…</div>}>
          <AsyncLogs promise={promise} pending={pending} />
        </Suspense>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(params.has('async') ? <AsyncApp /> : <App />)
