import type { GridFilterState, GridSortState, GridStatePatch } from '@ishibashi0112/spreadsheet-grid-solid'

/** URL のクエリ: s = 並び(due.asc,priority.desc)、f = 列フィルター(JSON)、q = 上部バーの検索 */
export type ViewSearch = { s?: string | undefined; f?: string | undefined; q?: string | undefined }

export function sortToParam(sort: GridSortState): string | undefined {
  if (!sort.length) return undefined
  return sort.map((s) => `${s.columnKey}.${s.direction}`).join(',')
}

export function paramToSort(s: string | undefined): GridSortState {
  if (!s) return []
  return s
    .split(',')
    .map((part) => part.split('.'))
    .filter(([key]) => !!key)
    .map(([columnKey, dir]) => ({ columnKey: columnKey!, direction: dir === 'desc' ? ('desc' as const) : ('asc' as const) }))
}

export function filtersToParams(filters: GridFilterState): { f: string | undefined; q: string | undefined } {
  const hasColumn = Object.keys(filters.columnFilters).length > 0
  return {
    f: hasColumn ? JSON.stringify(filters.columnFilters) : undefined,
    q: filters.globalText ? filters.globalText : undefined,
  }
}

export function searchToState(search: ViewSearch): Omit<GridStatePatch, 'columns'> {
  let columnFilters: GridFilterState['columnFilters'] = {}
  try {
    if (search.f) columnFilters = JSON.parse(search.f)
  } catch {
    columnFilters = {}
  }
  return {
    sort: paramToSort(search.s),
    filters: { globalText: search.q ?? '', columnFilters },
  }
}

export function sameView(a: ViewSearch, b: ViewSearch) {
  return (a.s ?? '') === (b.s ?? '') && (a.f ?? '') === (b.f ?? '') && (a.q ?? '') === (b.q ?? '')
}
