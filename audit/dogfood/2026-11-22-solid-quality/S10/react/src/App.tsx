// React 版で同じ 2 つの表(比べる用)。S10 の Solid 版の App.tsx と同じ形
import { useEffect, useMemo, useRef, useState } from 'react'
import { numberFormatter, restoreColumnsFromState, SpreadsheetGrid, type GridColumn, type GridState, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en'
import { createData, LINE_STATUSES, ORDER_STATUSES, PRODUCTS, totals, type Line, type Order } from './data'

const q = new URLSearchParams(location.search)
const TOTALS_MODE = (q.get('totals') ?? 'applyRows') as 'applyRows' | 'signal' | 'getValue'
const BOTTOM_MODE = (q.get('bottom') ?? 'swap') as 'swap' | 'remount'
const ORDER_COUNT = Number(q.get('n') ?? 2000)
const opts = (values: readonly string[]) => values.map((value) => ({ value, label: value }))
const money = numberFormatter({ maximumFractionDigits: 0 })
const fmt = new Intl.NumberFormat('en-US')
const SHARED = ['code', 'date', 'status', 'qty', 'amount', 'note']
const data = createData(ORDER_COUNT)

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
    __top?: SpreadsheetGridHandle<Order> | null
    __bottom?: SpreadsheetGridHandle<Line> | null
    __log: string[]
  }
}
window.__log = []

export function App() {
  const [orders, setOrders] = useState<Order[]>(data.orders)
  const [lines, setLines] = useState<Record<string, Line[]>>(data.lines)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dark, setDark] = useState(q.get('dark') === '1')
  const [linked, setLinked] = useState(q.get('link') === '1')
  const top = useRef<SpreadsheetGridHandle<Order>>(null)
  const bottom = useRef<SpreadsheetGridHandle<Line>>(null)
  const bottomLayout = useRef<GridState | undefined>(undefined)

  const totalsById = useMemo(() => {
    const m = new Map<string, { qty: number; amount: number }>()
    for (const [id, ls] of Object.entries(lines)) m.set(id, totals(ls))
    return m
  }, [lines])

  const orderColumnsDefault = useMemo<GridColumn<Order>[]>(() => [
    { key: 'code', title: 'Order', width: 100, pinned: 'left', filterType: 'text' },
    { key: 'customer', title: 'Customer', width: 170, editable: true, filterType: 'set' },
    { key: 'date', title: 'Date', width: 120, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
    { key: 'status', title: 'Status', width: 110, editable: true, editor: { type: 'select', options: opts(ORDER_STATUSES) }, filterType: 'set', conditionalFormat: { chips: { Draft: 'neutral', Confirmed: 'info', Shipped: 'good', Cancelled: 'critical' } } },
    { key: 'qty', title: 'Qty', width: 80, align: 'right', filterType: 'number', aggFunc: 'sum', ...(TOTALS_MODE === 'getValue' ? { getValue: (row: Order) => totalsById.get(row.id)?.qty ?? 0 } : {}) },
    { key: 'amount', title: 'Amount', width: 120, align: 'right', valueFormatter: money, filterType: 'number', aggFunc: 'sum', ...(TOTALS_MODE === 'getValue' ? { getValue: (row: Order) => totalsById.get(row.id)?.amount ?? 0 } : {}) },
    { key: 'note', title: 'Note', width: 200, flex: 1, editable: true },
  // getValue モードは集計が変わるたびに列を作り直す(React の書き方)
  ], [TOTALS_MODE === 'getValue' ? totalsById : null])
  const [orderColumns, setOrderColumns] = useState(orderColumnsDefault)
  useEffect(() => setOrderColumns(orderColumnsDefault), [orderColumnsDefault])
  const [lineCols, setLineCols] = useState(lineColumns)

  const activeOrder = orders.find((o) => o.id === activeId) ?? null
  const activeLines = activeId ? (lines[activeId] ?? []) : []

  const onLinesChange = (orderId: string, next: Line[]) => {
    window.__log.push(`lines:${orderId}:${next.length}`)
    setLines((prev) => ({ ...prev, [orderId]: next }))
    const t = totals(next)
    if (TOTALS_MODE === 'applyRows') top.current?.applyRows((prev) => prev.map((o) => (o.id === orderId ? { ...o, qty: t.qty, amount: t.amount } : o)), { undoable: false })
    else if (TOTALS_MODE === 'signal') setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, qty: t.qty, amount: t.amount } : o)))
  }

  const pickShared = (w: Record<string, number>) => Object.fromEntries(Object.entries(w).filter(([k]) => SHARED.includes(k)))
  const sameWidths = (a: Record<string, number>, b: Record<string, number>) => { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]) }
  const syncWidths = (from: GridState, to: SpreadsheetGridHandle<Order> | SpreadsheetGridHandle<Line> | null) => {
    if (!linked || !to) return
    const want = pickShared(from.columnWidths)
    const cur = pickShared(to.getState().columnWidths)
    if (!sameWidths(want, cur)) { window.__log.push(`syncWidths:${JSON.stringify(want)}`); to.applyState({ columnWidths: { ...to.getState().columnWidths, ...want } }) }
  }
  const reorderShared = <T,>(target: GridColumn<T>[], sourceKeys: string[]): GridColumn<T>[] => {
    const sharedOrder = sourceKeys.filter((k) => SHARED.includes(k) && target.some((c) => c.key === k))
    let i = 0
    return target.map((c) => {
    if (!SHARED.includes(String(c.key))) return c
    const k = sharedOrder[i++]
    return target.find((t) => t.key === k)!
  })
  }
  const onOrderColumnsChange = (next: GridColumn<Order>[]) => {
    window.__log.push(`topCols:${next.map((c) => c.key).join(',')}`)
    setOrderColumns(next)
    if (linked && bottom.current) { const order = reorderShared(lineCols, next.map((c) => String(c.key))); window.__log.push(`syncOrder:bottom:${order.map((c) => c.key).join(',')}`); bottom.current.applyState({ columns: order.map((c) => ({ key: String(c.key), visible: c.visible, pinned: c.pinned })) }) }
  }
  const onLineColumnsChange = (next: GridColumn<Line>[]) => {
    window.__log.push(`botCols:${next.map((c) => c.key).join(',')}`)
    setLineCols(next)
    if (linked && top.current) { const order = reorderShared(orderColumns, next.map((c) => String(c.key))); window.__log.push(`syncOrder:top:${order.map((c) => c.key).join(',')}`); top.current.applyState({ columns: order.map((c) => ({ key: String(c.key), visible: c.visible, pinned: c.pinned })) }) }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return
      e.preventDefault()
      const inTop = document.querySelector('[data-grid=orders]')?.contains(document.activeElement)
      window.__log.push(`F6:${inTop ? 'toBottom' : 'toTop'}`)
      if (inTop) bottom.current?.focus(); else top.current?.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => { window.__top = top.current; window.__bottom = bottom.current })

  const linesGrid = (orderId?: string) => (
    <SpreadsheetGrid
      key={orderId ?? 'swap'}
      ref={bottom}
      rows={activeLines}
      columns={BOTTOM_MODE === 'remount' && bottomLayout.current ? restoreColumnsFromState(lineCols, bottomLayout.current) : lineCols}
      onColumnsChange={onLineColumnsChange}
      onRowsChange={(next) => { const id = orderId ?? activeId; if (id) onLinesChange(id, next) }}
      rowKeyGetter={(row) => row.id}
      localeText={localeTextEn}
      theme={dark ? 'dark' : 'light'}
      height="100%"
      totalRow
      fillHandle
      initialState={BOTTOM_MODE === 'remount' ? bottomLayout.current : undefined}
      onStateChange={(s) => syncWidths(s, top.current)}
      ariaLabel="Lines"
      noRowsText="No lines"
    />
  )

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Orders</h1>
        <label><input type="checkbox" checked={dark} onChange={(e) => setDark(e.currentTarget.checked)} /> Dark lines</label>
        <label><input type="checkbox" checked={linked} onChange={(e) => setLinked(e.currentTarget.checked)} /> Link column layout</label>
        <button type="button" onClick={() => top.current?.downloadCsv('orders.csv')}>Export orders</button>
        <button type="button" onClick={() => bottom.current?.downloadCsv(`lines-${activeId ?? 'none'}.csv`)}>Export lines</button>
        <button type="button" onClick={() => bottom.current?.focus()}>Go to lines (F6)</button>
        <span className="mode">totals={TOTALS_MODE} bottom={BOTTOM_MODE} (React)</span>
      </header>
      <section className="top" data-grid="orders">
        <SpreadsheetGrid
          ref={top}
          rows={orders}
          columns={orderColumns}
          onColumnsChange={onOrderColumnsChange}
          onRowsChange={(next) => setOrders(next)}
          rowKeyGetter={(row) => row.id}
          onActiveCellChange={(cell) => {
            const id = cell ? String(cell.rowKey) : null
            window.__log.push(`active:${id}`)
            if (id === activeId) return
            if (BOTTOM_MODE === 'remount' && bottom.current) bottomLayout.current = bottom.current.getState()
            setActiveId(id)
          }}
          onStateChange={(s) => syncWidths(s, bottom.current)}
          localeText={localeTextEn}
          height="100%"
          totalRow
          ariaLabel="Orders"
        />
      </section>
      <section className={'bottom' + (dark ? ' dark' : '')} data-grid="lines">
        <h2>{activeOrder ? <>Lines of {activeOrder.code} — {activeOrder.customer} ({activeLines.length} lines, total {fmt.format(activeOrder.amount)})</> : 'Select an order to see its lines'}</h2>
        <div className="grid-box">
          {BOTTOM_MODE === 'remount' ? (activeId ? linesGrid(activeId) : <p className="empty">No order selected</p>) : linesGrid()}
        </div>
      </section>
    </div>
  )
}
