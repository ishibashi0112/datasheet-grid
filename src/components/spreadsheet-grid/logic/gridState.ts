import type {
  ColumnFilterValue,
  GridColumn,
  GridColumnState,
  GridFilterState,
  GridSortState,
  GridState,
  ParsedNumberFilter,
} from '../model/gridTypes';
// 追加(state v2): 列メタ適用時、pinned/order を AG Grid 互換の視覚順(left→center→right)へ
//   正規化するために再利用します。grid 本体の reorder 経路と同じ関数で、適用結果の pane 連結を
//   一致させます(視覚順 = 論理 index 空間の不変条件を applyState でも守るため)。
import { reorderColumnsByPane } from './geometry';

// 追加(state #1): 列状態のシリアライズ(getState / applyState)の純ロジックです。ハンドル
//   (SpreadsheetGridHandle)から呼ばれ、DOM や reducer には触れません(値の組み立て / 複製 /
//   正規化だけを行います)。永続化(localStorage 等)は consumer に委ね、ここは「純粋な snapshot と、
//   外部入力を現行スキーマへ畳む migrate」だけを提供します。

// 状態スキーマのバージョンです。GridState.version に焼き、将来形式が変わったとき applyState 側で
//   旧バージョンを移行できるようにします。
//   - v1: columnWidths(手動リサイズ幅)/ filters / sort のみ。
//   - v2: 上記に加え columns(列メタ: 可視 / 順序 / ピン)を含めます。flex / width は含めません
//     (flex は grid UI で不変・width は columnWidths でカバー済みのため。詳細は GridColumnState 型参照)。
//   v1 保存値(columns フィールド無し)は migrateGridState で columns:undefined となり、列メタを
//   触らず幅 / フィルター / ソートのみ適用します(完全後方互換)。
export const GRID_STATE_VERSION = 2;

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

// 追加(state v2): GridColumnState 1 件を新規オブジェクトとして複製します(buildGridState の
//   「全フィールド新規」契約のため)。未指定(undefined)フィールドは付与しません。
const cloneColumnStateEntry = (entry: GridColumnState): GridColumnState => {
  const next: GridColumnState = { key: entry.key };
  if (entry.visible !== undefined) {
    next.visible = entry.visible;
  }
  if (entry.pinned !== undefined) {
    next.pinned = entry.pinned;
  }
  return next;
};

// 追加(state v2): columns prop(consumer 所有・GridColumn 配列)から、シリアライズ対象の列メタ
//   (key / visible / pinned)だけを配列順で抽出します(純粋・read-only)。
//   - 配列順 = 列順です(grid は reorderColumnsByPane で pane 連結正規化済みの順序を columns へ載せます)。
//   - visible / pinned が未指定(undefined)のエントリは当該フィールドを省略し、JSON 往復後の形
//     (フィールド absent)と一致させます。これにより isSameColumnStateArray の比較が対称になります。
//   - flex / width は意図的に含めません(flex は grid UI で不変・width は columnWidths でカバー済み)。
export const extractColumnState = <T,>(
  columns: GridColumn<T>[],
): GridColumnState[] =>
  columns.map((column) => {
    const entry: GridColumnState = { key: column.key };
    if (column.visible !== undefined) {
      entry.visible = column.visible;
    }
    if (column.pinned !== undefined) {
      entry.pinned = column.pinned;
    }
    return entry;
  });

// 現在の永続スライス(手動リサイズ幅 / フィルター / ソート)+ 列メタ(v2)から GridState snapshot を
//   組み立てます(純粋・副作用なし)。返り値は全フィールドが新規オブジェクト/配列で、consumer がその
//   まま mutate しても reducer の内部状態へは波及しません(逆も同様)。そのまま JSON.stringify して
//   保存できます。columns は extractColumnState で抽出済みの GridColumnState 配列を渡します
//   (空配列でも version は v2 のまま=列メタ「全列なし」ではなく「空グリッド」の意。実運用では
//   getState が常に全列を渡すため、空配列は列ゼロのグリッドだけです)。
export const buildGridState = (
  columnWidths: Record<string, number>,
  filters: GridFilterState,
  sort: GridSortState,
  columns: GridColumnState[] = [],
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
  // 列メタも 1 件ずつ新規オブジェクトへ複製します(呼び出し側が共有配列を渡しても安全)。
  columns: columns.map(cloneColumnStateEntry),
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

  // 追加(state v2): columns(列メタ)。配列のときだけ、各エントリを防御的に正規化します。
  //   - key は string 必須(無し/非 string は drop)。
  //   - visible は boolean のときだけ採用(それ以外は省略 = 未指定)。
  //   - pinned は 'left' | 'right' のときだけ採用(それ以外は省略 = 非固定)。
  //   columns フィールドが配列なら正規化済み配列(全無効なら空配列)を、配列でない / 非存在なら undefined を
  //   返します。undefined = 列メタ未適用(v1 後方互換: v1 保存値は columns フィールドが無いため undefined)。
  //   空配列([])は「present だが列メタ無し(0 列 or 全無効)」で、buildGridState 出力との往復一致のため
  //   undefined へ潰しません(applyState では [] 適用=実質 no-op)。
  let columns: GridColumnState[] | undefined;
  const rawColumns = source.columns;
  if (Array.isArray(rawColumns)) {
    const normalized: GridColumnState[] = [];
    for (const item of rawColumns) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const e = item as Record<string, unknown>;
      if (typeof e.key !== 'string') {
        continue;
      }
      const entry: GridColumnState = { key: e.key };
      if (typeof e.visible === 'boolean') {
        entry.visible = e.visible;
      }
      if (e.pinned === 'left' || e.pinned === 'right') {
        entry.pinned = e.pinned;
      }
      normalized.push(entry);
    }
    columns = normalized;
  }

  return {
    version: GRID_STATE_VERSION,
    columnWidths,
    filters: { globalText, columnFilters },
    sort,
    columns,
  };
};

// 追加(state v2): 保存列メタ(GridColumnState[])を現在の columns 定義へ key ベースでマージし、
//   新しい columns 配列を返します(純粋・副作用なし)。applyState から onColumnsChange へ渡す前提です。
//   方針:
//   - 保存メタの key 順で現 columns を並べ替えます(reorder の復元)。保存に在って現 columns に無い
//     key は drop(削除列)。現 columns に在って保存に無い key は末尾へ追加(新規列・相対順を保持)。
//   - 各列へ保存の visible / pinned を適用します(undefined もそのまま反映 = 既定へ戻す)。新規列(保存
//     メタ無し)は consumer 宣言の visible / pinned を保持します。
//   - render fn / title / filterType / flex など非シリアライズ項目は現 columns から引き継ぎます
//     ({ ...column } で spread。flex は触らないため素通しです)。
//   - 【幅の保全】savedWidths(v1 columnWidths)にエントリがある列は column.width へ焼き込みます。
//     列メタ適用で columns prop が変わると grid の「columns → columnWidths/sync」effect が
//     column.width 起点で columnWidths を全置換するため、焼かないと手動リサイズ幅が消えます
//     (grid 本体の pin / visible / reorder ハンドラと同じ"保全"方向)。
//   - 最後に reorderColumnsByPane で pane 連結正規化します(視覚順 = 論理 index 空間。grid の reorder
//     経路と一致させ、pinned 復元後のグルーピングを確定します)。
export const applyColumnState = <T,>(
  currentColumns: GridColumn<T>[],
  savedColumnState: GridColumnState[],
  savedWidths: Record<string, number>,
): GridColumn<T>[] => {
  const byKey = new Map(currentColumns.map((column) => [column.key, column]));
  const consumedKeys = new Set<string>();

  // 1 列分の適用(meta 有無 / 保存幅有無で分岐)。変更不要なら参照を保持します。
  const applyOne = (
    column: GridColumn<T>,
    meta: GridColumnState | undefined,
  ): GridColumn<T> => {
    const savedWidth = savedWidths[column.key];
    const hasSavedWidth = typeof savedWidth === 'number';
    if (!meta && !hasSavedWidth) {
      return column;
    }
    const next: GridColumn<T> = { ...column };
    if (meta) {
      // visible / pinned は保存値(undefined 含む)をそのまま反映=保存時のレイアウトへ復元。
      next.visible = meta.visible;
      next.pinned = meta.pinned;
    }
    if (hasSavedWidth) {
      next.width = savedWidth;
    }
    return next;
  };

  // 1) 保存 key 順で並べ替え(現 columns に在るものだけ。無い key=削除列は drop)。
  const ordered: GridColumn<T>[] = [];
  for (const meta of savedColumnState) {
    const column = byKey.get(meta.key);
    if (!column) {
      continue;
    }
    consumedKeys.add(meta.key);
    ordered.push(applyOne(column, meta));
  }
  // 2) 保存に無い新規列を末尾へ(現 columns の相対順を保持。consumer 宣言の visible/pinned は維持)。
  for (const column of currentColumns) {
    if (consumedKeys.has(column.key)) {
      continue;
    }
    ordered.push(applyOne(column, undefined));
  }
  // 3) pane 連結正規化(grid の reorder と同じ視覚順)。
  return reorderColumnsByPane(ordered);
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

// 追加(state v2): columns(列メタ)配列の構造等価です。順序 + key + visible + pinned を比較します。
//   - undefined 同士は等価。片方だけ undefined は不等(v1↔v2 の取り違え / 列メタ有無の差を検出)。
//   - visible / pinned は未指定(extractColumnState で省略 → 値は undefined)同士も等価になります。
const isSameColumnStateArray = (
  a: GridColumnState[] | undefined,
  b: GridColumnState[] | undefined,
): boolean => {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].key !== b[i].key ||
      a[i].visible !== b[i].visible ||
      a[i].pinned !== b[i].pinned
    ) {
      return false;
    }
  }
  return true;
};

// 追加(state #2 / onStateChange): GridState 同士の構造等価です。version / columnWidths /
//   filters(globalText + columnFilters)/ sort / columns(v2 列メタ)をすべて深く比較します。
//   onStateChange の「永続スライスが実際に変化したか」判定に使います(参照比較では毎回不等になり得る
//   ため)。columns は順序 + visible + pinned の変化を検出します(列の可視 / 順序 / ピン変更で発火)。
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
  if (!isSameColumnStateArray(a.columns, b.columns)) {
    return false;
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