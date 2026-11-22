// ログと株価のライブ画面(Solid 版)
import { render } from '@solidjs/web'
import { createEffect, createMemo, createSignal, onSettled, Show, type Accessor, type Setter } from 'solid-js'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { INDICES, createLiveLogs, createLogs, createStocks, logPayload, tick, type LogRow, type Stock } from './data'

const params = new URLSearchParams(location.search)
const LOG_COUNT = Number(params.get('n') ?? 1_000_000)
const w = window as any

const chipsService = { 'api-gateway': 'info', auth: 'good', billing: 'warning', search: 'info', inventory: 'neutral', notification: 'neutral', worker: 'neutral', frontend: 'good' } as const

const logColumns: GridColumn<LogRow>[] = [
  { key: 'time', title: '時刻', width: 170, pinned: 'left', filterType: 'dateSet', editable: false },
  {
    key: 'level',
    title: 'レベル',
    width: 100,
    filterType: 'set',
    editable: false,
    conditionalFormat: { chips: { ERROR: 'critical', WARN: 'warning', INFO: 'info', DEBUG: 'neutral' } },
  },
  { key: 'service', title: 'サービス', width: 140, filterType: 'set', editable: false, conditionalFormat: { chips: chipsService } },
  { key: 'message', title: 'メッセージ', width: 480, autoHeight: true, filterType: 'text', editable: false },
  { key: 'traceId', title: 'traceId', width: 150, filterType: 'text', editable: false },
]

function LogsView(props: { rows: LogRow[]; setRows: Setter<LogRow[]> }) {
  let grid!: SpreadsheetGridHandle<LogRow>
  const [tail, setTail] = createSignal(params.has('tail'))
  const [following, setFollowing] = createSignal(true)
  let follow = true
  onSettled(() => {
    const id = setInterval(() => {
      if (!tail()) return
      // 足す前に、末尾にいるかを覚えておく
      follow = grid?.isAtBottom() ?? true
      props.setRows((prev) => [...prev, ...createLiveLogs(50)])
    }, 1000)
    return () => clearInterval(id)
  })
  // 足した行が描かれた後に末尾へ
  createEffect(
    () => ({ rows: props.rows, tail: tail() }),
    (v) => {
      // 初回の effect ではまだ grid が入っていない(所見 S5-01)ので ?. で読む
      if (follow && v.tail) grid?.scrollToBottom()
    },
  )
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
        <label>
          <input type="checkbox" data-testid="tail" checked={tail()} onChange={(e) => setTail(e.currentTarget.checked)} /> 末尾を追う(毎秒 50 行)
        </label>
        <span data-testid="following">{following() ? '末尾にいます' : '上を見ています'}</span>
        <button onClick={() => grid.scrollToBottom()}>末尾へ</button>
        <span data-testid="logcount">{props.rows.length.toLocaleString()} 行</span>
      </div>
      <div style={{ flex: 1, 'min-height': 0 }}>
        <SpreadsheetGrid
          ref={(h) => {
            grid = h
            w.__logGrid = h
          }}
          rows={props.rows}
          columns={logColumns}
          rowKeyGetter={(row) => row.id}
          readOnly
          find
          autoHeight
          detailRow={{
            height: 200,
            render: (ctx) => (
              <pre data-testid="detail-json" style={{ margin: 0, 'font-size': '12px' }}>
                {JSON.stringify(logPayload(ctx.row), null, 2)}
              </pre>
            ),
          }}
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
    {
      key: 'changePct',
      title: '前日比',
      width: 100,
      align: 'right',
      editable: false,
      valueFormatter: fmtPct,
      aggFunc: 'avg',
      conditionalFormat: { colorScale: { type: 'diverging', min: -3, mid: 0, max: 3 } },
    },
    {
      key: 'volume',
      title: '出来高',
      width: 140,
      align: 'right',
      editable: false,
      valueFormatter: numberFormatter(),
      aggFunc: 'sum',
      conditionalFormat: { dataBar: {} },
    },
    { key: 'signal', title: 'シグナル', width: 100, editable: false, filterType: 'set', conditionalFormat: { chips: { 買い: 'good', 中立: 'neutral', 売り: 'critical' } } },
    { key: 'memo', title: 'メモ', width: 200 },
  ]
}

function StocksView(props: { rows: Accessor<Stock[]>; setRows: Setter<Stock[]> }) {
  let grid!: SpreadsheetGridHandle<Stock>
  const [mode, setMode] = createSignal<'signal' | 'apply' | 'off'>((params.get('mode') as any) ?? 'signal')
  const [grouped, setGrouped] = createSignal(params.has('group'))
  const columns = createMemo(() => stockColumns(grouped()))
  const [ticks, setTicks] = createSignal(0)
  onSettled(() => {
    w.__setMode = setMode
    w.__stocks = () => props.rows()
    const id = setInterval(() => {
      const m = mode()
      if (m === 'signal') props.setRows((prev) => tick(prev))
      else if (m === 'apply') grid.applyRows((prev) => tick(prev), { undoable: false })
      if (m !== 'off') setTicks((t) => t + 1)
    }, 250)
    return () => clearInterval(id)
  })
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
        <select data-testid="mode" value={mode()} onChange={(e) => setMode(e.currentTarget.value as any)}>
          <option value="signal">signal の配列を作り直す</option>
          <option value="apply">applyRows(undoable: false)</option>
          <option value="off">止める</option>
        </select>
        <label>
          <input type="checkbox" data-testid="group" checked={grouped()} onChange={(e) => setGrouped(e.currentTarget.checked)} /> 業種でまとめる
        </label>
        <span data-testid="ticks">更新 {ticks()} 回</span>
      </div>
      <div style={{ flex: 1, 'min-height': 0 }}>
        <SpreadsheetGrid
          ref={(h) => {
            grid = h
            w.__stockGrid = h
          }}
          rows={props.rows()}
          onRowsChange={(next) => props.setRows(next)}
          columns={columns()}
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
  const [tab, setTab] = createSignal<'logs' | 'stocks'>((params.get('tab') as any) ?? 'logs')
  const t0 = performance.now()
  const [logs, setLogs] = createSignal<LogRow[]>(createLogs(LOG_COUNT))
  w.__genMs = performance.now() - t0
  const [stocks, setStocks] = createSignal<Stock[]>(createStocks())
  w.__setTab = setTab
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', padding: '8px', 'box-sizing': 'border-box', gap: '6px' }}>
      <nav style={{ display: 'flex', gap: '6px' }}>
        <button data-testid="tab-logs" aria-pressed={tab() === 'logs' ? 'true' : 'false'} onClick={() => setTab('logs')}>ログ</button>
        <button data-testid="tab-stocks" aria-pressed={tab() === 'stocks' ? 'true' : 'false'} onClick={() => setTab('stocks')}>株価</button>
      </nav>
      <div style={{ flex: 1, 'min-height': 0 }}>
        <Show when={tab() === 'logs'} fallback={<StocksView rows={stocks} setRows={setStocks} />}>
          <LogsView rows={logs()} setRows={setLogs} />
        </Show>
      </div>
    </div>
  )
}

render(() => <App />, document.getElementById('root')!)
