// 並び・フィルターを URL のクエリへ(sort=name.asc,logins.desc / q=... / f=<JSON>)
import type { GridFilterState, GridSortState, GridState } from '@ishibashi0112/spreadsheet-grid-solid'

export type UrlGridState = { sort: GridSortState; filters: GridFilterState }

export function parseUrlState(search: Record<string, string | string[] | undefined>): UrlGridState {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sortRaw = one(search.sort) ?? ''
  const sort: GridSortState = sortRaw
    ? sortRaw.split(',').map((part) => {
        const [columnKey, dir] = part.split('.')
        return { columnKey: columnKey ?? '', direction: dir === 'desc' ? 'desc' : 'asc' }
      })
    : []
  let columnFilters: GridFilterState['columnFilters'] = {}
  const f = one(search.f)
  if (f) {
    try {
      columnFilters = JSON.parse(f)
    } catch {
      columnFilters = {}
    }
  }
  return { sort, filters: { globalText: one(search.q) ?? '', columnFilters } }
}

export function toSearch(state: Pick<GridState, 'sort' | 'filters'>): Record<string, string | undefined> {
  const sort = state.sort.map((s) => `${s.columnKey}.${s.direction}`).join(',')
  const cf = state.filters.columnFilters
  return {
    sort: sort || undefined,
    q: state.filters.globalText || undefined,
    f: Object.keys(cf).length ? JSON.stringify(cf) : undefined,
  }
}

export const sameState = (a: Pick<GridState, 'sort' | 'filters'>, b: Pick<GridState, 'sort' | 'filters'>) =>
  JSON.stringify(toSearch(a)) === JSON.stringify(toSearch(b))
