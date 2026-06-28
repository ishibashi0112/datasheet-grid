import type {
  ColumnFilterValue,
  GridFilterState,
  GridSortState,
  GridState,
  ParsedNumberFilter,
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
// 追加(state #2 / onStateChange): number フィルターの parsed(解釈結果)の構造等価です。
//   どちらか null なら参照(= null 同士)で判定。mode 不一致は不等、同一 mode は中身を比較します。
const isSameParsedNumberFilter = (
  a: ParsedNumberFilter | null,
  b: ParsedNumberFilter | null,
): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.mode === 'comparison' && b.mode === 'comparison') {
    return a.operator === b.operator && a.value === b.value;
  }
  if (a.mode === 'range' && b.mode === 'range') {
    return a.min === b.min && a.max === b.max;
  }
  return false;
};

// 追加(state #2 / onStateChange): 列フィルター値(判別共用体)の構造等価です。
//   kind が異なれば不等。各 kind の中身(set の values 配列・number の raw/parsed・text/date/select の
//   value)を比較します。custom の value(unknown)は深い比較が不能なため Object.is(参照同一)で判定し、
//   buildGridState が参照共有でコピーする規約と整合させます(同じ filter なら同一参照 → 等価)。
const isSameColumnFilterValue = (
  a: ColumnFilterValue,
  b: ColumnFilterValue,
): boolean => {
  switch (a.kind) {
    case 'set':
      return (
        b.kind === 'set' &&
        (a.mode ?? 'include') === (b.mode ?? 'include') &&
        a.values.length === b.values.length &&
        a.values.every((v, i) => v === b.values[i])
      );
    case 'number':
      return (
        b.kind === 'number' &&
        a.raw === b.raw &&
        isSameParsedNumberFilter(a.parsed, b.parsed)
      );
    case 'text':
      return b.kind === 'text' && a.value === b.value;
    case 'date':
      return b.kind === 'date' && a.value === b.value;
    case 'select':
      return b.kind === 'select' && a.value === b.value;
    case 'custom':
      return b.kind === 'custom' && Object.is(a.value, b.value);
  }
};

// number レコード(columnWidths)の構造等価です(キー集合 + 各値が一致)。
const isSameNumberRecord = (
  a: Record<string, number>,
  b: Record<string, number>,
): boolean => {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  for (const key of aKeys) {
    if (!(key in b) || a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};

// 列フィルターマップの構造等価です(キー集合 + 各値が isSameColumnFilterValue で一致)。
const isSameColumnFilters = (
  a: Record<string, ColumnFilterValue>,
  b: Record<string, ColumnFilterValue>,
): boolean => {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  for (const key of aKeys) {
    if (!(key in b) || !isSameColumnFilterValue(a[key], b[key])) {
      return false;
    }
  }
  return true;
};

// 追加(state #2 / onStateChange): GridState 同士の構造等価です。version / columnWidths /
//   filters(globalText + columnFilters)/ sort をすべて深く比較します。onStateChange の
//   「永続スライスが実際に変化したか」判定に使います(参照比較では毎回不等になり得るため)。
export const isSameGridState = (a: GridState, b: GridState): boolean => {
  if (a.version !== b.version) {
    return false;
  }
  if (!isSameNumberRecord(a.columnWidths, b.columnWidths)) {
    return false;
  }
  if (a.filters.globalText !== b.filters.globalText) {
    return false;
  }
  if (!isSameColumnFilters(a.filters.columnFilters, b.filters.columnFilters)) {
    return false;
  }
  if (a.sort.length !== b.sort.length) {
    return false;
  }
  for (let i = 0; i < a.sort.length; i += 1) {
    if (
      a.sort[i].columnKey !== b.sort[i].columnKey ||
      a.sort[i].direction !== b.sort[i].direction
    ) {
      return false;
    }
  }
  return true;
};

// 追加(state #2 / onStateChange): onStateChange を発火すべきかの判定結果です。
//   emit=発火するか / nextLast=次に保持すべき「最後に通知した state」(発火しない場合も更新規約あり)。
export type StateChangeDecision = {
  emit: boolean;
  nextLast: GridState | null;
};

// 追加(state #2 / onStateChange): onStateChange の発火可否を純粋に判定します(副作用なし)。
//   - isDragging(列リサイズ / 選択のドラッグ中): 確定前なので発火せず、lastEmitted も据え置きます
//     (prevLast を返す)。これで列リサイズの毎フレーム更新を握りつぶし、確定後 1 回に集約します。
//   - prevLast === null(初回): 発火せず、現在値を記録(nextLast=current)。マウント直後の通知を防ぎます。
//   - 前回通知と構造等価: 発火せず、記録は current で更新(参照だけ変わったケースを弾く)。
//   - それ以外: 発火し(emit=true)、current を記録します。
export const decideStateChangeEmit = (
  prevLast: GridState | null,
  current: GridState,
  isDragging: boolean,
): StateChangeDecision => {
  if (isDragging) {
    return { emit: false, nextLast: prevLast };
  }
  if (prevLast === null) {
    return { emit: false, nextLast: current };
  }
  if (isSameGridState(prevLast, current)) {
    return { emit: false, nextLast: current };
  }
  return { emit: true, nextLast: current };
};