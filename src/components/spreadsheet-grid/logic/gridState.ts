import type {
  ColumnFilterValue,
  GridFilterState,
  GridSortState,
  GridState,
} from '../model/gridTypes';

// 追加(state #1): 列状態のシリアライズ(getState / applyState)の純ロジックです。ハンドル
//   (SpreadsheetGridHandle)から呼ばれ、DOM や reducer には触れません(値の組み立て / 複製 /
//   正規化だけを行います)。永続化(localStorage 等)は consumer に委ね、ここは「純粋な snapshot と、
//   外部入力を現行スキーマへ畳む migrate」だけを提供します。

// 状態スキーマのバージョンです。GridState.version に焼き、将来形式が変わったとき applyState 側で
//   旧バージョンを移行できるようにします(現行は 1)。
export const GRID_STATE_VERSION = 1;

// 列フィルター値(判別共用体)を 1 段深くコピーします。getState の snapshot / applyState の正規化で、
//   reducer の現在オブジェクトと consumer 保持オブジェクトが参照を共有しないようにするためです。
//   - set    : values 配列を複製(mode はプリミティブ)。
//   - number : parsed(入れ子オブジェクト)も複製(null はそのまま)。
//   - text / date / select : 浅いコピーで十分(中身はプリミティブ)。
//   - custom : value は unknown(任意形)のため参照共有のまま(深いコピーは consumer 責務)。
export const cloneColumnFilterValue = (
  value: ColumnFilterValue,
): ColumnFilterValue => {
  switch (value.kind) {
    case 'set':
      return { ...value, values: [...value.values] };
    case 'number':
      return { ...value, parsed: value.parsed ? { ...value.parsed } : null };
    case 'text':
    case 'date':
    case 'select':
      return { ...value };
    case 'custom':
      return { ...value };
  }
};

// columnFilters マップを値ごと clone して新規マップを返します(キー集合は同一)。
const cloneColumnFilters = (
  columnFilters: Record<string, ColumnFilterValue>,
): Record<string, ColumnFilterValue> => {
  const next: Record<string, ColumnFilterValue> = {};
  for (const key of Object.keys(columnFilters)) {
    next[key] = cloneColumnFilterValue(columnFilters[key]);
  }
  return next;
};

// 現在の永続スライス(手動リサイズ幅 / フィルター / ソート)から GridState snapshot を組み立てます
//   (純粋・副作用なし)。返り値は全フィールドが新規オブジェクト/配列で、consumer がそのまま mutate
//   しても reducer の内部状態へは波及しません(逆も同様)。そのまま JSON.stringify して保存できます。
export const buildGridState = (
  columnWidths: Record<string, number>,
  filters: GridFilterState,
  sort: GridSortState,
  version: number = GRID_STATE_VERSION,
): GridState => ({
  version,
  columnWidths: { ...columnWidths },
  filters: {
    globalText: filters.globalText,
    columnFilters: cloneColumnFilters(filters.columnFilters),
  },
  // エントリ(columnKey / direction)も複製します。
  sort: sort.map((entry) => ({ ...entry })),
});

// applyState に渡る外部入力(localStorage 等の deserialize 結果)を、現行スキーマの GridState へ
//   防御的に正規化します。型不一致 / 欠損フィールドは既定へ畳み、reducer が消費できる形へ揃えます。
//   - columnWidths : 有限数値のエントリだけ採用(それ以外は捨てる)。
//   - filters      : globalText は string(既定 '')、columnFilters は kind を持つオブジェクトだけ採用。
//                    値の kind 中身までは検証しません(getState 出力の往復を前提とします)。
//   - sort         : columnKey(string)+ direction('asc' | 'desc')のエントリだけ採用。
//   version は入力値に関わらず現行(GRID_STATE_VERSION)へ揃えます。返り値は新規オブジェクト/配列で、
//   consumer 保持オブジェクトと参照を共有しません(applyState の dispatch ペイロードとして安全)。
export const migrateGridState = (input: unknown): GridState => {
  const source =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};

  // columnWidths: number(有限)値のみ採用します。
  const columnWidths: Record<string, number> = {};
  const rawWidths = source.columnWidths;
  if (rawWidths && typeof rawWidths === 'object') {
    const widthMap = rawWidths as Record<string, unknown>;
    for (const key of Object.keys(widthMap)) {
      const w = widthMap[key];
      if (typeof w === 'number' && Number.isFinite(w)) {
        columnWidths[key] = w;
      }
    }
  }

  // filters: globalText(string)+ columnFilters(object)を防御的に取り出します。
  const rawFilters =
    source.filters && typeof source.filters === 'object'
      ? (source.filters as Record<string, unknown>)
      : {};
  const globalText =
    typeof rawFilters.globalText === 'string' ? rawFilters.globalText : '';
  const columnFilters: Record<string, ColumnFilterValue> = {};
  const rawColumnFilters = rawFilters.columnFilters;
  if (rawColumnFilters && typeof rawColumnFilters === 'object') {
    const filterMap = rawColumnFilters as Record<string, unknown>;
    for (const key of Object.keys(filterMap)) {
      const v = filterMap[key];
      // kind を持つオブジェクトのみ採用(深い検証はしない)。値は clone して参照を切ります。
      if (v && typeof v === 'object' && 'kind' in v) {
        columnFilters[key] = cloneColumnFilterValue(v as ColumnFilterValue);
      }
    }
  }

  // sort: 配列のうち columnKey(string)+ direction('asc' | 'desc')のエントリだけ採用します。
  const sort: GridSortState = [];
  const rawSort = source.sort;
  if (Array.isArray(rawSort)) {
    for (const entry of rawSort) {
      if (entry && typeof entry === 'object') {
        const e = entry as Record<string, unknown>;
        if (
          typeof e.columnKey === 'string' &&
          (e.direction === 'asc' || e.direction === 'desc')
        ) {
          sort.push({ columnKey: e.columnKey, direction: e.direction });
        }
      }
    }
  }

  return {
    version: GRID_STATE_VERSION,
    columnWidths,
    filters: { globalText, columnFilters },
    sort,
  };
};