// 列の多い計画表(200 列 × 20,000 行)と、共同編集の模擬(ほかの人のカーソルを signal で持ち、セルに印を出す)。
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import {
  SpreadsheetGrid,
  numberFormatter,
  type CellRenderContext,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { createRows, DEPTS, MONTHS, PEERS, type PlanRow } from './data'

const params = new URLSearchParams(location.search)
const peerMode = params.get('peer') ?? 'jsx' // jsx | body | none
const ROWS = Number(params.get('rows') ?? 20000)
const fmt = numberFormatter()
type Peer = { name: string; color: string; rowKey: number; colKey: string }
const counters = { render: 0 }
;(window as unknown as { __counters: typeof counters }).__counters = counters

export function App() {
  const [rows, setRows] = createSignal<PlanRow[]>(createRows(ROWS))
  const [peers, setPeers] = createSignal<Peer[]>(
    PEERS.map((p, i) => ({ ...p, rowKey: 3 + i * 2, colKey: MONTHS[2 + i]!.key })),
  )
  const [running, setRunning] = createSignal(!params.has('nopeers'))
  const [activeKey, setActiveKey] = createSignal<string | null>(null)
  let grid: SpreadsheetGridHandle<PlanRow> | undefined
  let extraSeq = 0

  // rowKey:colKey → 人。セルの印はこれを引く
  const peerAt = createMemo(() => {
    const m = new Map<string, Peer>()
    for (const p of peers()) m.set(`${p.rowKey}:${p.colKey}`, p)
    return m
  })

  const PeerMark = (props: { peer: Peer }) => (
    <i class="peer" style={{ 'border-color': props.peer.color, background: props.peer.color }} data-peer={props.peer.name}>
      {props.peer.name[0]}
    </i>
  )

  const monthRenderCell = (ctx: CellRenderContext<PlanRow>) => {
    counters.render++
    if (peerMode === 'body') {
      // 関数の本体で外の signal を読む書き方
      const p = peerAt().get(`${ctx.rowKey}:${ctx.column.key}`)
      return (
        <span class={p ? 'cell has-peer' : 'cell'} style={p ? { 'box-shadow': `inset 0 0 0 2px ${p.color}` } : undefined}>
          {fmt({ value: ctx.value } as never)}
          {p && <PeerMark peer={p} />}
        </span>
      )
    }
    // JSX の中で読む書き方
    const key = `${ctx.rowKey}:${ctx.column.key}`
    const peer = () => peerAt().get(key)
    return (
      <span class={peer() ? 'cell has-peer' : 'cell'} style={peer() ? { 'box-shadow': `inset 0 0 0 2px ${peer()!.color}` } : undefined}>
        {fmt({ value: ctx.value } as never)}
        <Show when={peer()}>{(p) => <PeerMark peer={p()} />}</Show>
      </span>
    )
  }

  const monthColumns: GridColumn<PlanRow>[] = MONTHS.map((m, i) => ({
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
    ...(peerMode === 'none' ? {} : { renderCell: monthRenderCell }),
  }))

  const [columns, setColumns] = createSignal<GridColumn<PlanRow>[]>([
    { key: 'code', title: 'コード', width: 90, pinned: 'left', editable: false },
    { key: 'name', title: '品目', width: 150, pinned: 'left', editable: true },
    { key: 'dept', title: '部門', width: 90, editable: true, editor: { type: 'select', options: DEPTS.map((d) => ({ value: d, label: d })) }, filterType: 'set' },
    { key: 'owner', title: '担当', width: 80, editable: true, filterType: 'set' },
    ...monthColumns,
    {
      key: 'total',
      title: '合計',
      width: 110,
      align: 'right',
      pinned: 'right',
      editable: false,
      getValue: (row) => row.v.reduce((s, x) => s + x, 0),
      valueFormatter: fmt,
    },
  ])

  // 毎秒 20 回、ほかの人のカーソルを見えている辺りで動かす
  const tick = () => {
    if (!grid) return
    const range = grid.getVisibleRowRange()
    if (!range) return
    const left = grid.getScrollPosition()?.left ?? 0
    const firstMonth = Math.max(0, Math.floor(left / 84))
    const lo = range.startIndex + 2
    const hi = Math.max(lo, range.endIndex - 3)
    setPeers((prev) =>
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
  const timer = setInterval(() => running() && tick(), 50)
  onCleanup(() => clearInterval(timer))

  const addColumn = () => {
    extraSeq++
    const col: GridColumn<PlanRow> = { key: `extra${extraSeq}`, title: `追加${extraSeq}`, width: 100, editable: true }
    setColumns((prev) => {
      const at = prev.findIndex((c) => c.key === activeKey())
      const next = prev.slice()
      next.splice(at < 0 ? 4 : at + 1, 0, col)
      return next
    })
  }
  const removeColumn = () => {
    const key = activeKey()
    if (!key || key === 'code') return
    setColumns((prev) => prev.filter((c) => c.key !== key))
  }
  const pinLeft = () => {
    const key = activeKey()
    if (!key) return
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, pinned: 'left' } : c)))
  }

  ;(window as unknown as Record<string, unknown>).__app = {
    rows,
    columns,
    peers,
    setPeers,
    setRunning,
    tick,
    get grid() {
      return grid
    },
  }

  return (
    <div class="app">
      <header class="toolbar">
        <h1>生産計画(2011〜2026)</h1>
        <button type="button" data-testid="add-col" onClick={addColumn}>列を追加</button>
        <button type="button" data-testid="remove-col" onClick={removeColumn} disabled={!activeKey() || activeKey() === 'code'}>この列を削除</button>
        <button type="button" data-testid="pin-col" onClick={pinLeft} disabled={!activeKey()}>この列を左に固定</button>
        <button type="button" data-testid="far" onClick={() => grid?.scrollToCell(grid.getVisibleRowRange()?.startIndex ?? 0, grid.getColIndex(MONTHS.at(-1)!.key), { align: 'end' })}>
          2026/12 へ
        </button>
        <button type="button" data-testid="toggle-peers" onClick={() => setRunning((r) => !r)}>
          {running() ? '同期を止める' : '同期を再開'}
        </button>
        <span class="mode">印の書き方: {peerMode}</span>
      </header>
      <ul class="peers" data-testid="peers">
        <For each={peers()}>
          {(p) => (
            <li>
              <i class="dot" style={{ background: p.color }} />
              {p.name} {MONTHS.find((m) => m.key === p.colKey)?.title} / {p.rowKey}
            </li>
          )}
        </For>
      </ul>
      <div class="grid-area">
        <SpreadsheetGrid
          ref={(h) => (grid = h)}
          rows={rows()}
          columns={columns()}
          onRowsChange={(next) => setRows(next)}
          onColumnsChange={(next) => setColumns(next)}
          onActiveCellChange={(cell) => setActiveKey(cell?.columnKey ?? null)}
          rowKeyGetter={(row) => row.id}
          height="100%"
          columnDragMotion="live"
          ariaLabel="生産計画"
        />
      </div>
    </div>
  )
}
