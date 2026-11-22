// URL のクエリ(?date=today / ?from=2026-11-01&to=2026-11-15 / ?room=A,B / ?sort=date.desc)と
// グリッドの状態(フィルター / ソート)を行き来させる。
import type { ColumnFilterValue, GridState, GridStatePatch } from '@ishibashi0112/spreadsheet-grid-solid'

export type UrlQuery = Partial<Record<string, string | string[]>>

const PRESETS = new Set(['today', 'thisMonth', 'last30days'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export function stateFromQuery(query: UrlQuery): Omit<GridStatePatch, 'columns'> {
  const columnFilters: Record<string, ColumnFilterValue> = {}
  const date = one(query.date)
  const from = one(query.from)
  const to = one(query.to)
  if (date && PRESETS.has(date)) {
    columnFilters.date = { kind: 'dateSet', condition: { mode: 'preset', preset: date }, set: null }
  } else if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    columnFilters.date = { kind: 'dateSet', condition: { mode: 'range', from, to }, set: null }
  } else if (from && DATE_RE.test(from)) {
    columnFilters.date = { kind: 'dateSet', condition: { mode: 'onOrAfter', value: from }, set: null }
  }
  const extra = one(query.f)
  if (extra) {
    try {
      Object.assign(columnFilters, JSON.parse(extra) as Record<string, ColumnFilterValue>)
    } catch {
      // 壊れた f は捨てる
    }
  }
  const room = one(query.room)
  if (room) {
    columnFilters.room = { kind: 'set', mode: 'include', values: room.split(',').filter(Boolean) }
  }
  const sortParam = one(query.sort)
  const sort = sortParam
    ? sortParam
        .split(',')
        .map((part) => part.split('.'))
        .filter(([key]) => !!key)
        .map(([columnKey, dir]) => ({ columnKey: columnKey!, direction: dir === 'desc' ? ('desc' as const) : ('asc' as const) }))
    : []
  return { filters: { globalText: one(query.q) ?? '', columnFilters }, sort }
}

/** グリッドの状態 → URL のクエリ(書けないフィルターは URL に載せない) */
export function queryFromState(state: GridState): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = { date: undefined, from: undefined, to: undefined, room: undefined, sort: undefined, q: undefined, f: undefined }
  const others: Record<string, ColumnFilterValue> = {}
  for (const [key, value] of Object.entries(state.filters.columnFilters)) {
    if (key === 'date' && value.kind === 'dateSet' && !value.set && value.condition && ['preset', 'range', 'onOrAfter'].includes(value.condition.mode)) continue
    if (key === 'room' && value.kind === 'set' && (value.mode ?? 'include') === 'include') continue
    others[key] = value
  }
  const dateFilter = state.filters.columnFilters.date
  if (dateFilter?.kind === 'dateSet' && dateFilter.condition) {
    const c = dateFilter.condition
    if (c.mode === 'preset') result.date = c.preset
    else if (c.mode === 'range') {
      result.from = c.from
      result.to = c.to
    } else if (c.mode === 'onOrAfter') result.from = c.value
  }
  const roomFilter = state.filters.columnFilters.room
  if (roomFilter?.kind === 'set' && (roomFilter.mode ?? 'include') === 'include') {
    result.room = roomFilter.values.join(',')
  }
  if (state.sort.length > 0) result.sort = state.sort.map((s) => `${s.columnKey}.${s.direction}`).join(',')
  if (state.filters.globalText) result.q = state.filters.globalText
  if (Object.keys(others).length > 0) result.f = JSON.stringify(others)
  return result
}

/** 比べるための正規化した文字列 */
export function queryKey(query: Record<string, string | string[] | undefined>) {
  return ['date', 'from', 'to', 'room', 'sort', 'q', 'f'].map((k) => `${k}=${one(query[k]) ?? ''}`).join('&')
}
