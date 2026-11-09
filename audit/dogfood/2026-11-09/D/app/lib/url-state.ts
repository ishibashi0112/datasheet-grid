import type { ColumnFilterValue, GridSortState } from '@ishibashi0112/spreadsheet-grid';

export type UrlGridState = {
  sort: GridSortState;
  globalText: string;
  columnFilters: Record<string, ColumnFilterValue>;
};

type SearchLike = { get(name: string): string | null };

export function parseUrlState(sp: SearchLike): UrlGridState {
  const sort: GridSortState = [];
  const rawSort = sp.get('sort');
  if (rawSort) {
    for (const part of rawSort.split(',')) {
      const [columnKey, dir] = part.split('.');
      if (columnKey) sort.push({ columnKey, direction: dir === 'desc' ? 'desc' : 'asc' });
    }
  }
  let columnFilters: Record<string, ColumnFilterValue> = {};
  const rawFilters = sp.get('filters');
  if (rawFilters) {
    try {
      const parsed = JSON.parse(rawFilters);
      if (parsed && typeof parsed === 'object') columnFilters = parsed;
    } catch {
      // ignore broken URLs
    }
  }
  return { sort, globalText: sp.get('q') ?? '', columnFilters };
}

export function toSearchString(state: UrlGridState): string {
  const sp = new URLSearchParams();
  if (state.sort.length) sp.set('sort', state.sort.map((s) => `${s.columnKey}.${s.direction}`).join(','));
  if (state.globalText) sp.set('q', state.globalText);
  if (Object.keys(state.columnFilters).length) sp.set('filters', JSON.stringify(state.columnFilters));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function fromRecord(rec: Record<string, string | string[] | undefined>): UrlGridState {
  return parseUrlState({
    get: (name) => {
      const v = rec[name];
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    },
  });
}
