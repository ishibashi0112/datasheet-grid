// React 版: Solid 版の S12 と同じ画面。ほかの人のカーソルは外部の store に置き、セルの中の小さな部品だけが購読する(jsx)。
//   body = React のふつうの書き方(renderCell が state を閉じ込めて読む → 列を作り直して全部のセルを描き直す)
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  SpreadsheetGrid,
  numberFormatter,
  type CellRenderContext,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { createRows, DEPTS, MONTHS, PEERS, type PlanRow } from './data'

const params = new URLSearchParams(location.search)
const peerMode = params.get('peer') ?? 'jsx'
const ROWS = Number(params.get('rows') ?? 20000)
const fmt = numberFormatter()
type Peer = { name: string; color: string; rowKey: number; colKey: string }
const counters = { render: 0 }
;(window as unknown as { __counters: typeof counters }).__counters = counters

// 外部の store
let peersValue: Peer[] = PEERS.map((p, i) => ({ ...p, rowKey: 3 + i * 2, colKey: MONTHS[2 + i]!.key }))
let peerMap = new Map<string, Peer>()
const rebuild = () => {
  peerMap = new Map()
  for (const p of peersValue) peerMap.set(`${p.rowKey}:${p.colKey}`, p)
}
rebuild()
const listeners = new Set<() => void>()
const peerStore = {
  get: () => peersValue,
  set: (next: Peer[] | ((prev: Peer[]) => Peer[])) => {
    peersValue = typeof next === 'function' ? next(peersValue) : next
    rebuild()
    for (const l of listeners) l()
  },
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

const getNull = () => null
function PeersList() {
  const peers = useSyncExternalStore(peerStore.subscribe, peerStore.get)
  return (
    <ul className="peers" data-testid="peers">
      {peers.map((p) => (
        <li key={p.name}>
          <i className="dot" style={{ background: p.color }} />
          {p.name} {MONTHS.find((m) => m.key === p.colKey)?.title} / {p.rowKey}
        </li>
      ))}
    </ul>
  )
}
function PeerSlot({ cellKey }: { cellKey: string }) {
  const p = useSyncExternalStore(peerStore.subscribe, () => peerMap.get(cellKey))
  if (!p) return null
  return (
    <>
      <b className="peer-box" style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 0 2px ${p.color}`, background: 'rgba(0,0,0,.03)' }} />
      <i className="peer" style={{ borderColor: p.color, background: p.color }} data-peer={p.name}>
        {p.name[0]}
      </i>
    </>
  )
}

const rowKeyGetter = (row: PlanRow) => row.id
export function App() {
  const [rows, setRows] = useState<PlanRow[]>(() => createRows(ROWS))
  // jsx のときは App で購読しない(App が毎回描き直されるのを避ける)。body のときだけ購読する
  const peers = useSyncExternalStore(peerStore.subscribe, peerMode === 'body' ? peerStore.get : getNull)
  const [running, setRunning] = useState(!params.has('nopeers'))
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const grid = useRef<SpreadsheetGridHandle<PlanRow>>(null)
  const onActiveCellChange = useCallback((cell: { columnKey: string } | null) => setActiveKey(cell?.columnKey ?? null), [])
  const extraSeq = useRef(0)
  const peerAtForBody = useMemo(() => (peers ? new Map(peers.map((p) => [`${p.rowKey}:${p.colKey}`, p])) : null), [peers])

  const monthColumns = useMemo<GridColumn<PlanRow>[]>(() => {
    const renderCell = (ctx: CellRenderContext<PlanRow>) => {
      counters.render++
      const key = `${ctx.rowKey}:${ctx.column.key}`
      if (peerMode === 'body') {
        const p = peerAtForBody!.get(key)
        return (
          <span className={p ? 'cell has-peer' : 'cell'} style={p ? { boxShadow: `inset 0 0 0 2px ${p.color}` } : undefined}>
            {fmt({ value: ctx.value } as never)}
            {p && <i className="peer" style={{ borderColor: p.color, background: p.color }} data-peer={p.name}>{p.name[0]}</i>}
          </span>
        )
      }
      return (
        <span className="cell">
          {fmt({ value: ctx.value } as never)}
          <PeerSlot cellKey={key} />
        </span>
      )
    }
    return MONTHS.map((m, i) => ({
      key: m.key,
      title: m.title,
      width: 84,
      align: 'right',
      editable: true,
      editor: { type: 'number', min: 0, integer: true },
      getValue: (row) => row.v[i],
      setValue: (row, value) => {
        const v = row.v.slice()
        v[i] = typeof value === 'number' ? value : Number(value)
        return { ...row, v }
      },
      valueFormatter: fmt,
      ...(peerMode === 'none' ? {} : { renderCell }),
    }))
  }, [peerAtForBody])

  const [extraCols, setColumnsState] = useState<GridColumn<PlanRow>[] | null>(null)
  const baseColumns = useMemo<GridColumn<PlanRow>[]>(
    () => [
      { key: 'code', title: 'コード', width: 90, pinned: 'left', editable: false },
      { key: 'name', title: '品目', width: 150, pinned: 'left', editable: true },
      { key: 'dept', title: '部門', width: 90, editable: true, editor: { type: 'select', options: DEPTS.map((d) => ({ value: d, label: d })) }, filterType: 'set' },
      { key: 'owner', title: '担当', width: 80, editable: true, filterType: 'set' },
      ...monthColumns,
      { key: 'total', title: '合計', width: 110, align: 'right', pinned: 'right', editable: false, getValue: (row) => row.v.reduce((s, x) => s + x, 0), valueFormatter: fmt },
    ],
    [monthColumns],
  )
  // 利用者が列を変えたら(並べ替え / 固定 / 追加 / 削除)その配列を使う。body のときは renderCell を差し替える
  const columns = useMemo(() => {
    if (!extraCols) return baseColumns
    const byKey = new Map(baseColumns.map((c) => [c.key, c]))
    return extraCols.map((c) => (byKey.has(c.key) && byKey.get(c.key)!.renderCell ? { ...c, renderCell: byKey.get(c.key)!.renderCell } : c))
  }, [extraCols, baseColumns])
  const setColumns = (fn: (prev: GridColumn<PlanRow>[]) => GridColumn<PlanRow>[]) => setColumnsState(fn(columns))

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const runningRef = useRef(running)
  runningRef.current = running

  const tick = () => {
    const h = grid.current
    if (!h) return
    const range = h.getVisibleRowRange()
    if (!range) return
    const left = h.getScrollPosition()?.left ?? 0
    const firstMonth = Math.max(0, Math.floor(left / 84))
    const lo = range.startIndex + 2
    const hi = Math.max(lo, range.endIndex - 3)
    peerStore.set((prev) =>
      prev.map((p, i) => {
        if ((i + counters.render) % 2 === 0 && Math.random() < 0.5) return p
        const rowKey = Math.min(hi + 1, Math.max(lo + 1, p.rowKey + (Math.random() < 0.5 ? -1 : 1)))
        let mi = MONTHS.findIndex((m) => m.key === p.colKey)
        if (mi < firstMonth || mi > firstMonth + 10) mi = firstMonth + 2 + i
        mi = Math.min(MONTHS.length - 1, Math.max(0, mi + (Math.random() < 0.5 ? -1 : 1)))
        return { ...p, rowKey, colKey: MONTHS[mi]!.key }
      }),
    )
  }
  useEffect(() => {
    const t = setInterval(() => runningRef.current && tick(), 50)
    return () => clearInterval(t)
  }, [])

  ;(window as unknown as Record<string, unknown>).__app = {
    rows: () => rowsRef.current,
    columns: () => columnsRef.current,
    peers: () => peerStore.get(),
    setPeers: peerStore.set,
    setRunning,
    tick,
    get grid() {
      return grid.current
    },
  }

  const addColumn = () => {
    extraSeq.current++
    const col: GridColumn<PlanRow> = { key: `extra${extraSeq.current}`, title: `追加${extraSeq.current}`, width: 100, editable: true }
    setColumns((prev) => {
      const at = prev.findIndex((c) => c.key === activeKey)
      const next = prev.slice()
      next.splice(at < 0 ? 4 : at + 1, 0, col)
      return next
    })
  }
  const removeColumn = () => {
    if (!activeKey || activeKey === 'code') return
    setColumns((prev) => prev.filter((c) => c.key !== activeKey))
  }
  const pinLeft = () => {
    if (!activeKey) return
    setColumns((prev) => prev.map((c) => (c.key === activeKey ? { ...c, pinned: 'left' } : c)))
  }

  return (
    <div className="app">
      <header className="toolbar">
        <h1>生産計画(2011〜2026)</h1>
        <button type="button" data-testid="add-col" onClick={addColumn}>列を追加</button>
        <button type="button" data-testid="remove-col" onClick={removeColumn} disabled={!activeKey || activeKey === 'code'}>この列を削除</button>
        <button type="button" data-testid="pin-col" onClick={pinLeft} disabled={!activeKey}>この列を左に固定</button>
        <button type="button" data-testid="far" onClick={() => grid.current?.scrollToCell(grid.current.getVisibleRowRange()?.startIndex ?? 0, grid.current.getColIndex(MONTHS.at(-1)!.key), { align: 'end' })}>2026/12 へ</button>
        <button type="button" data-testid="toggle-peers" onClick={() => setRunning((r) => !r)}>{running ? '同期を止める' : '同期を再開'}</button>
        <span className="mode">印の書き方: {peerMode}</span>
      </header>
      <PeersList />
      <div className="grid-area">
        <SpreadsheetGrid
          ref={grid}
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          onColumnsChange={setColumnsState}
          onActiveCellChange={onActiveCellChange}
          rowKeyGetter={rowKeyGetter}
          height="100%"
          columnDragMotion="live"
          ariaLabel="生産計画"
        />
      </div>
    </div>
  )
}
