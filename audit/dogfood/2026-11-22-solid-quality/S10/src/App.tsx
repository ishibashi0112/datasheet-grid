// Orders (top) and the lines of the active order (bottom). Both grids live in this component.
import { createMemo, createSignal, onSettled, Show, untrack } from 'solid-js'
import {
  numberFormatter,
  restoreColumnsFromState,
  SpreadsheetGrid,
  type GridColumn,
  type GridState,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'
import { createData, LINE_STATUSES, ORDER_STATUSES, PRODUCTS, totals, type Line, type Order } from './data'

const q = new URLSearchParams(location.search)
const TOTALS_MODE = (q.get('totals') ?? 'applyRows') as 'applyRows' | 'signal' | 'getValue' | 'getValueMemo'
const GETVALUE = TOTALS_MODE === 'getValue' || TOTALS_MODE === 'getValueMemo'
const BOTTOM_MODE = (q.get('bottom') ?? 'swap') as 'swap' | 'remount'
const GUARD = q.get('guard') !== '0'
const ORDER_COUNT = Number(q.get('n') ?? 2000)

const opts = (values: readonly string[]) => values.map((value) => ({ value, label: value }))
const money = numberFormatter({ maximumFractionDigits: 0 })
const fmt = new Intl.NumberFormat('en-US')
const SHARED = ['code', 'date', 'status', 'qty', 'amount', 'note']

const lineColumns: GridColumn<Line>[] = [
  { key: 'code', title: 'Line', width: 70, align: 'right' },
  { key: 'product', title: 'Product', width: 150, editable: true, editor: { type: 'select', options: opts(PRODUCTS) }, filterType: 'set' },
  { key: 'date', title: 'Delivery', width: 120, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'status', title: 'Status', width: 100, editable: true, editor: { type: 'select', options: opts(LINE_STATUSES) }, filterType: 'set' },
  { key: 'qty', title: 'Qty', width: 80, align: 'right', editable: true, editor: { type: 'number', min: 1, integer: true }, filterType: 'number', aggFunc: 'sum' },
  { key: 'unitPrice', title: 'Unit price', width: 100, align: 'right', editable: true, editor: { type: 'number', min: 0 }, valueFormatter: money },
  { key: 'amount', title: 'Amount', width: 110, align: 'right', getValue: (row) => row.qty * row.unitPrice, valueFormatter: money, aggFunc: 'sum' },
  { key: 'note', title: 'Note', width: 200, flex: 1, editable: true },
]

declare global {
  interface Window {
    __top?: SpreadsheetGridHandle<Order>
    __bottom?: SpreadsheetGridHandle<Line> | undefined
    __log: string[]
  }
}
window.__log = []

export function App() {
  const data = createData(ORDER_COUNT)
  const [orders, setOrders] = createSignal<Order[]>(data.orders)
  const [lines, setLines] = createSignal<Record<string, Line[]>>(data.lines)
  const [activeId, setActiveId] = createSignal<string | null>(null)
  const [dark, setDark] = createSignal(q.get('dark') === '1')
  const [linked, setLinked] = createSignal(q.get('link') === '1')

  const totalsById = createMemo(() => {
    const m = new Map<string, { qty: number; amount: number }>()
    for (const [id, ls] of Object.entries(lines())) m.set(id, totals(ls))
    return m
  })

  const makeOrderColumns = (): GridColumn<Order>[] => [
    { key: 'code', title: 'Order', width: 100, pinned: 'left', filterType: 'text' },
    { key: 'customer', title: 'Customer', width: 170, editable: true, filterType: 'set' },
    { key: 'date', title: 'Date', width: 120, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
    {
      key: 'status',
      title: 'Status',
      width: 110,
      editable: true,
      editor: { type: 'select', options: opts(ORDER_STATUSES) },
      filterType: 'set',
      conditionalFormat: { chips: { Draft: 'neutral', Confirmed: 'info', Shipped: 'good', Cancelled: 'critical' } },
    },
    {
      key: 'qty',
      title: 'Qty',
      width: 80,
      align: 'right',
      filterType: 'number',
      aggFunc: 'sum',
      ...(GETVALUE ? { getValue: (row: Order) => totalsById().get(row.id)?.qty ?? 0 } : {}),
    },
    {
      key: 'amount',
      title: 'Amount',
      width: 120,
      align: 'right',
      valueFormatter: money,
      filterType: 'number',
      aggFunc: 'sum',
      ...(GETVALUE ? { getValue: (row: Order) => totalsById().get(row.id)?.amount ?? 0 } : {}),
    },
    { key: 'note', title: 'Note', width: 200, flex: 1, editable: true },
  ]
  // getValueMemo: 集計が変わるたびに列を作り直す(React の useMemo と同じ形)
  const [orderColumns, setOrderColumns] =
    TOTALS_MODE === 'getValueMemo'
      ? createSignal<GridColumn<Order>[]>(() => {
          totalsById()
          return untrack(makeOrderColumns)
        })
      : createSignal<GridColumn<Order>[]>(makeOrderColumns())
  const [lineCols, setLineCols] = createSignal(lineColumns)

  let top!: SpreadsheetGridHandle<Order>
  let bottom: SpreadsheetGridHandle<Line> | undefined
  // bottom=remount: the lines grid is re-created per order; carry its layout over
  let bottomLayout: GridState | undefined

  const activeOrder = createMemo(() => orders().find((o) => o.id === activeId()) ?? null)
  const activeLines = createMemo(() => {
    const id = activeId()
    return id ? (lines()[id] ?? []) : []
  })

  const onLinesChange = (orderId: string, next: Line[]) => {
    window.__log.push(`lines:${orderId}:${next.length}`)
    setLines((prev) => ({ ...prev, [orderId]: next }))
    const t = totals(next)
    if (TOTALS_MODE === 'applyRows') {
      top.applyRows((prev) => prev.map((o) => (o.id === orderId ? { ...o, qty: t.qty, amount: t.amount } : o)), { undoable: false })
    } else if (TOTALS_MODE === 'signal') {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, qty: t.qty, amount: t.amount } : o)))
    }
  }

  // ---- column layout link (widths via applyState, order via applyState({ columns }))
  const pickShared = (widths: Record<string, number>) => Object.fromEntries(Object.entries(widths).filter(([k]) => SHARED.includes(k)))
  const sameWidths = (a: Record<string, number>, b: Record<string, number>) => {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
  }
  const syncWidths = (from: GridState, to: SpreadsheetGridHandle<Order> | SpreadsheetGridHandle<Line> | undefined) => {
    if (!linked() || !to) return
    const want = pickShared(from.columnWidths)
    const cur = pickShared(to.getState().columnWidths)
    if (!sameWidths(want, cur)) {
      window.__log.push(`syncWidths:${JSON.stringify(want)}`)
      to.applyState({ columnWidths: { ...to.getState().columnWidths, ...want } })
    }
  }
  /** order the shared columns of `target` like `source`, keeping the slots of the others */
  const reorderShared = <T,>(target: GridColumn<T>[], sourceKeys: string[]): GridColumn<T>[] => {
    const sharedOrder = sourceKeys.filter((k) => SHARED.includes(k) && target.some((c) => c.key === k))
    let i = 0
    return target.map((c) => {
    if (!SHARED.includes(String(c.key))) return c
    const k = sharedOrder[i++]
    return target.find((t) => t.key === k)!
  })
  }
  const sameOrder = (cur: { key: string }[] | undefined, want: { key: unknown }[]) =>
    !!cur && cur.length === want.length && cur.every((c, i) => c.key === String(want[i]!.key))
  const onOrderColumnsChange = (next: GridColumn<Order>[]) => {
    window.__log.push(`topCols:${next.map((c) => c.key).join(',')}`)
    setOrderColumns(next)
    if (linked() && bottom) {
      const order = reorderShared(lineCols(), next.map((c) => String(c.key)))
      // applyState は並びが同じでも onColumnsChange を呼ぶので、同じなら渡さない(渡すと 2 つの表で呼び合って止まらない)
      if (GUARD && sameOrder(bottom.getState().columns, order)) return
      window.__log.push(`syncOrder:bottom:${order.map((c) => c.key).join(',')}`)
      bottom.applyState({ columns: order.map((c) => ({ key: String(c.key), visible: c.visible, pinned: c.pinned })) })
    }
  }
  const onLineColumnsChange = (next: GridColumn<Line>[]) => {
    window.__log.push(`botCols:${next.map((c) => c.key).join(',')}`)
    setLineCols(next)
    if (linked()) {
      const order = reorderShared(orderColumns(), next.map((c) => String(c.key)))
      if (GUARD && sameOrder(top.getState().columns, order)) return
      window.__log.push(`syncOrder:top:${order.map((c) => c.key).join(',')}`)
      top.applyState({ columns: order.map((c) => ({ key: String(c.key), visible: c.visible, pinned: c.pinned })) })
    }
  }

  // F6 moves the focus between the two grids
  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return
      e.preventDefault()
      const inTop = document.querySelector('[data-grid=orders]')?.contains(document.activeElement)
      window.__log.push(`F6:${inTop ? 'toBottom' : 'toTop'}`)
      if (inTop) bottom?.focus()
      else top.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const linesGrid = (orderId?: string) => (
    <SpreadsheetGrid
      ref={(h) => {
        bottom = h
        window.__bottom = h
      }}
      rows={activeLines()}
      columns={BOTTOM_MODE === 'remount' && bottomLayout ? restoreColumnsFromState(lineCols(), bottomLayout) : lineCols()}
      onColumnsChange={onLineColumnsChange}
      onRowsChange={(next) => {
        const id = orderId ?? activeId()
        if (id) onLinesChange(id, next)
      }}
      rowKeyGetter={(row) => row.id}
      localeText={localeTextEn}
      theme={dark() ? 'dark' : 'light'}
      height="100%"
      totalRow
      fillHandle
      initialState={BOTTOM_MODE === 'remount' ? bottomLayout : undefined}
      onStateChange={(s) => syncWidths(s, top)}
      ariaLabel="Lines"
      noRowsText="No lines"
    />
  )

  return (
    <div class="app">
      <header class="toolbar">
        <h1>Orders</h1>
        <label>
          <input type="checkbox" checked={dark()} onChange={(e) => setDark(e.currentTarget.checked)} /> Dark lines
        </label>
        <label>
          <input type="checkbox" checked={linked()} onChange={(e) => setLinked(e.currentTarget.checked)} /> Link column layout
        </label>
        <button type="button" onClick={() => top.downloadCsv('orders.csv')}>
          Export orders
        </button>
        <button type="button" onClick={() => bottom?.downloadCsv(`lines-${activeId() ?? 'none'}.csv`)}>
          Export lines
        </button>
        <button type="button" onClick={() => bottom?.focus()}>
          Go to lines (F6)
        </button>
        <span class="mode">
          totals={TOTALS_MODE} bottom={BOTTOM_MODE}
        </span>
      </header>
      <section class="top" data-grid="orders">
        <SpreadsheetGrid
          ref={(h) => {
            top = h
            window.__top = h
          }}
          rows={orders()}
          columns={orderColumns()}
          onColumnsChange={onOrderColumnsChange}
          onRowsChange={(next) => setOrders(next)}
          rowKeyGetter={(row) => row.id}
          onActiveCellChange={(cell) => {
            const id = cell ? String(cell.rowKey) : null
            window.__log.push(`active:${id}`)
            if (id === activeId()) return
            if (BOTTOM_MODE === 'remount' && bottom) bottomLayout = bottom.getState()
            setActiveId(id)
          }}
          onStateChange={(s) => syncWidths(s, bottom)}
          localeText={localeTextEn}
          height="100%"
          totalRow
          ariaLabel="Orders"
        />
      </section>
      <section class={['bottom', { dark: dark() }]} data-grid="lines">
        <h2>
          <Show when={activeOrder()} fallback="Select an order to see its lines">
            {(o) => (
              <>
                Lines of {o().code} — {o().customer} ({activeLines().length} lines, total {fmt.format(o().amount)})
              </>
            )}
          </Show>
        </h2>
        <div class="grid-box">
          <Show when={BOTTOM_MODE === 'remount'} fallback={linesGrid()}>
            <Show when={activeId()} keyed fallback={<p class="empty">No order selected</p>}>
              {(id) => linesGrid(id)}
            </Show>
          </Show>
        </div>
      </section>
    </div>
  )
}
