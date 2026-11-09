import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SpreadsheetGrid,
  type GridColumn,
  type GridContextMenuItem,
  type SpreadsheetGridHandle,
  type DetailRowRenderContext,
  type FindChangeParams,
  type GridContextMenuParams,
  type GridScrollEventParams,
} from '@ishibashi0112/spreadsheet-grid'
import { SERVICES, generateLogs, getPayload, getStack, makeLiveLogs, type LogRow } from './logs'

const params = new URLSearchParams(location.search)
const ROW_COUNT = Number(params.get('rows') ?? 1_000_000)

// 計測用(Playwright から読む)
declare global {
  interface Window {
    __perf: Record<string, number>
    __grid: SpreadsheetGridHandle<LogRow> | null
    __findEvents: FindChangeParams[]
  }
}
window.__perf = window.__perf ?? {}
window.__findEvents = []

const t0 = performance.now()
const INITIAL_ROWS = generateLogs(ROW_COUNT, Date.now())
window.__perf.generateMs = performance.now() - t0

const SERVICE_COLORS: Record<string, string> = {
  'api-gateway': '#6366f1',
  auth: '#0ea5e9',
  billing: '#f59e0b',
  catalog: '#10b981',
  checkout: '#ef4444',
  inventory: '#8b5cf6',
  notification: '#ec4899',
  search: '#14b8a6',
}

const columns: GridColumn<LogRow>[] = [
  {
    key: 'ts',
    title: '時刻',
    width: 200,
    pinned: 'left',
    filterType: 'dateSet',
    // 回避策の確認用: 候補(日付)を静的に渡す
    filterOptions: params.get('tsopts')
      ? Array.from({ length: 9 }, (_, i) => {
          const d = new Date(Date.now() - (8 - i) * 86400000)
          const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          return { label: v, value: v }
        })
      : undefined,
    dateFilterPresets: [
      'today',
      {
        id: 'yesterday',
        label: '昨日',
        resolve: (now) => {
          const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
          return { from: y, to: y }
        },
      },
      {
        id: 'last7days',
        label: '過去 7 日',
        resolve: (now) => ({ from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), to: now }),
      },
      'last30days',
    ],
  },
  {
    key: 'level',
    title: 'レベル',
    width: 110,
    filterType: 'set',
    filterOptions: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].map((v) => ({ label: v, value: v })),
    conditionalFormat: {
      chips: {
        DEBUG: 'neutral',
        INFO: 'info',
        WARN: 'warning',
        ERROR: 'critical',
        FATAL: { tone: 'critical', label: 'FATAL!' },
      },
    },
  },
  {
    key: 'service',
    title: 'サービス',
    width: 150,
    filterType: 'set',
    conditionalFormat: {
      chips: Object.fromEntries(SERVICES.map((s) => [s, { tone: 'neutral' as const, color: SERVICE_COLORS[s], icon: false }])),
    },
  },
  {
    key: 'message',
    title: 'メッセージ',
    width: 520,
    flex: 1,
    minWidth: 300,
    autoHeight: true,
    filterType: 'text',
  },
  { key: 'traceId', title: 'traceId', width: 170, filterType: 'text' },
]

function DetailCard({ row, collapse, onTrace }: { row: LogRow; collapse: () => void; onTrace: (id: string) => void }) {
  const payload = useMemo(() => getPayload(row), [row])
  const stack = getStack(row)
  return (
    <div className="detail">
      <div className="detail-head">
        <strong>#{row.id}</strong> {row.ts} <span className="muted">{row.service}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => onTrace(row.traceId)}>この traceId で絞り込む</button>
        <button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(payload, null, 2))}>
          JSON をコピー
        </button>
        <button type="button" onClick={collapse}>閉じる</button>
      </div>
      <div className="detail-body">
        <pre className="json">{JSON.stringify(payload, null, 2)}</pre>
        {stack && <pre className="stack">{stack}</pre>}
      </div>
    </div>
  )
}

export function App() {
  const [rows, setRows] = useState<LogRow[]>(INITIAL_ROWS)
  const [live, setLive] = useState(params.get('live') === '1')
  const [follow, setFollow] = useState(true)
  const [findLabel, setFindLabel] = useState('')
  const [expanded, setExpanded] = useState<number>(0)
  const gridRef = useRef<SpreadsheetGridHandle<LogRow>>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(ROW_COUNT + 1)

  useEffect(() => {
    window.__grid = gridRef.current
    window.__perf.mountedMs = performance.now()
  }, [])

  // ライブ: 毎秒 50 行を末尾に足す
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      const startId = nextId.current
      nextId.current += 50
      const added = makeLiveLogs(50, startId)
      setRows((prev) => [...prev, ...added])
    }, 1000)
    return () => clearInterval(timer)
  }, [live])

  // 末尾を追う: 行が増えたら、追っているときだけ下へ
  useEffect(() => {
    if (live && follow) gridRef.current?.scrollToBottom()
  }, [rows, live, follow])

  const onScroll = useCallback(({ source, top }: GridScrollEventParams) => {
    const el = wrapRef.current?.querySelector<HTMLElement>('.ssg-scroll-container')
    ;(window as unknown as { __scrollEvents?: unknown[] }).__scrollEvents?.push({
      t: Math.round(performance.now()),
      source,
      top: Math.round(top),
      gap: el ? Math.round(el.scrollHeight - el.clientHeight - el.scrollTop) : null,
    })
    if (source !== 'user') return
    if (!el) return
    const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 4
    setFollow(atBottom)
  }, [])

  const filterByTrace = useCallback((traceId: string) => {
    const g = gridRef.current
    if (!g) return
    const cur = g.getState().filters.columnFilters
    g.applyState({ filters: { columnFilters: { ...cur, traceId: { kind: 'text', value: traceId } } } })
  }, [])

  const onlyErrors = () => {
    const g = gridRef.current
    if (!g) return
    const cur = g.getState().filters.columnFilters
    g.applyState({ filters: { columnFilters: { ...cur, level: { kind: 'set', mode: 'include', values: ['ERROR', 'FATAL'] } } } })
  }
  const clearFilters = () => gridRef.current?.applyState({ filters: { globalText: '', columnFilters: {} } })
  const sortTs = (direction: 'asc' | 'desc') => gridRef.current?.applyState({ sort: [{ columnKey: 'ts', direction }] })

  const getContextMenuItems = useCallback(
    (p: GridContextMenuParams<LogRow>) => {
      const row = p.target.row
      if (!row) return []
      const items: GridContextMenuItem[] = [
        { kind: 'label', label: `ログ #${row.id}` },
        { label: '行を JSON でコピー', onSelect: () => navigator.clipboard.writeText(JSON.stringify(row)) },
        { label: 'メッセージをコピー', onSelect: () => navigator.clipboard.writeText(row.message) },
        { kind: 'separator' },
        { label: 'この traceId で絞り込む', onSelect: () => filterByTrace(row.traceId) },
        {
          label: `${row.service} だけ表示`,
          onSelect: () => {
            const g = gridRef.current
            if (!g) return
            const cur = g.getState().filters.columnFilters
            g.applyState({ filters: { columnFilters: { ...cur, service: { kind: 'set', mode: 'include', values: [row.service] } } } })
          },
        },
        { kind: 'separator' },
        {
          label: '詳細を開く / 閉じる',
          onSelect: () => {
            const g = gridRef.current
            if (!g) return
            const open = g.getExpandedDetailRowKeys().includes(row.id)
            g.setDetailRowExpanded(row.id, !open)
          },
        },
      ]
      return items
    },
    [filterByTrace],
  )

  const detailRow = useMemo(
    () => ({
      height: 240,
      render: ({ row, collapse }: DetailRowRenderContext<LogRow>) => (
        <DetailCard row={row} collapse={collapse} onTrace={filterByTrace} />
      ),
    }),
    [filterByTrace],
  )

  return (
    <div className="app">
      <header className="toolbar">
        <h1>ログビューア</h1>
        <span className="muted">{rows.length.toLocaleString()} 件</span>
        <label>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> ライブ(毎秒 50 行)
        </label>
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => {
              setFollow(e.target.checked)
              if (e.target.checked) gridRef.current?.scrollToBottom()
            }}
          />{' '}
          末尾を追う
        </label>
        <button type="button" onClick={onlyErrors}>ERROR 以上</button>
        <button type="button" onClick={clearFilters}>絞り込みを解除</button>
        <button type="button" onClick={() => sortTs('desc')}>新しい順</button>
        <button type="button" onClick={() => sortTs('asc')}>古い順</button>
        <button type="button" onClick={() => gridRef.current?.openFind()}>検索</button>
        <span className="muted" data-testid="find-label">{findLabel}</span>
        <span className="muted" data-testid="expanded">展開中 {expanded}</span>
        <button type="button" onClick={() => gridRef.current?.downloadCsv('logs.csv')}>CSV</button>
      </header>
      <div className={params.get('padfix') ? 'grid-wrap pad-fix' : 'grid-wrap'} ref={wrapRef}>
        <SpreadsheetGrid<LogRow>
          ref={gridRef}
          ariaLabel="ログ"
          rows={rows}
          onRowsChange={setRows}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          readOnly
          density={(params.get('density') as 'compact' | 'standard' | 'comfortable' | null) ?? 'compact'}
          height="100%"
          autoHeight
          find
          scrollHint
          showFilterChipBar
          showCellOverflowTooltip
          onFindChange={(p) => {
            window.__findEvents.push(p)
            setFindLabel(p.open && p.query ? `${p.currentIndex === null ? 0 : p.currentIndex + 1} / ${p.matchCount}` : '')
          }}
          detailRow={detailRow}
          onExpandedDetailRowKeysChange={(keys) => setExpanded(keys.length)}
          enableContextMenu
          getContextMenuItems={getContextMenuItems}
          onScroll={onScroll}
        />
      </div>
    </div>
  )
}