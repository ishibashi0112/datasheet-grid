// 追加(本体分解 E-2): 行モデルパイプラインの派生値計算です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「row order pipeline(DS-2)」「行グルーピング stage」「row model seam(DS-3-0)」「serverSide query 配線」
//   セクションを移設)。
//   - resolveBaseOrder: 恒等 order [0..n-1](長さのみ依存)。
//   - resolveOrder: グローバルフィルター済み order(非同期ランナーの出力。描画側から受け取る)→ 列フィルター
//     (number 用 Float64 key の前計算込み)→ ソート → 表示順が恒等かの判定(行ドラッグの操作可否)。
//   - resolveClientSideRowModel: グループツリー(集計込み)→ 開閉適用 flatten → RowModel シーム。
//   - resolveServerSideQuery: UI 状態 → ServerSideQuery + 安定 queryKey(clientSide では空固定)。
//   メモ単位は旧 useMemo と同一で、no-op dispatch(selection 等)では order / rowModel の参照が不変です
//   (11-A 系 / DS-2 の参照安定方針を維持)。
import type {
  ColumnFilterValue,
  GridColumn,
  GridGroupRow,
  GridRowKey,
  GridSortState,
  LabelRowSortMode,
  RowModel,
  ServerSideQuery,
} from '../model/gridTypes.unbound';
import {
  coerceNumberFilterCellValue,
  columnFilterUsesNumericKey,
  createSourceOrder,
  filterOrderByColumns,
  type RowOrder,
} from '../logic/filtering';
import {
  decorateSortKeys,
  diffSortKeys,
  repositionSortedPositions,
  sortPositionsByKeys,
  undecorateSortedPositions,
  type DecoratedSortKeys,
} from '../logic/sorting';
import { isIdentityOrder, isRowDragOperable } from '../logic/rowReorder';
import {
  buildGroupTree,
  flattenGroupTree,
  groupIndexOfOrderValue,
  groupRowKey,
  isGroupOrderValue,
  type GroupTree,
  type GroupedDisplay,
} from '../logic/grouping';
import { buildServerSideQuery, serializeServerSideQuery } from '../logic/serverSideQuery';
import {
  buildLabelDisplay,
  createLabelFreeOrder,
  createLabelRowModel,
  isSameOrder,
  resolveLabelRowLayout,
  type LabelDisplay,
  type LabelRowLayout,
} from '../logic/labelRows';
import { getCellValue } from '../utils/permissions';
import { createMemo } from './memo';

const EMPTY_SERVER_QUERY: ServerSideQuery = {};
const EMPTY_COLUMN_FILTERS: Record<string, ColumnFilterValue> = {};
const EMPTY_SORT: GridSortState = [];
// number 列シグネチャの区切り(NUL は列キーへの混入が実質ありえないため)。
const SIGNATURE_SEPARATOR = '\u0000';
// 追加(監査 B-10): rows だけが変わったとき、キーが変わった行がこの件数以下なら全件ソートせず差し込み直します
//   (比較は O(件数 × log n)。超えたら decorate 済みのキーで全件ソート)。
const SORT_REPOSITION_LIMIT = 1024;

export type RowOrderInputs<T> = {
  rows: T[];
  // 追加(label-row ①): ラベル行の配置(resolveLabelRowLayout の結果)。null / 未指定はラベル行なし。
  //   恒等判定(行ドラッグ可否)を「データ行 order = ラベル行を除いた恒等 order」で行うために使います。
  labelLayout?: LabelRowLayout | null;
  // 変更(監査 L-02): 列フィルター / ソートの評価対象列(旧 visibleColumns)。非表示列(visible: false)を
  //   含む全列(effectiveColumns)を渡します。非表示列のフィルター / ソートも行の絞り込み / 並べ替えに効かせ、
  //   バー表示・管理パネルの「適用中」と結果を一致させるためです(AG Grid と同じ)。
  filterSortColumns: GridColumn<T>[];
  // 列フィルター評価値(描画側で遅延化した値を渡してよい)。
  columnFilters: Record<string, ColumnFilterValue>;
  // グローバルフィルター済み order(globalFilteredOrder コントローラの出力)。
  globalFilteredOrder: RowOrder;
  sort: GridSortState;
  rowDragAvailable: boolean;
  // 追加(manual-mode): true のとき列フィルターを評価しない(空の columnFilters として扱う。number 用の
  //   Float64 key も作らない)。フィルター UI / 状態はそのまま、絞り込みだけを外部(サーバ側 WHERE 等)へ委ねる用途。
  manualFiltering?: boolean;
  // 追加(manual-mode): true のときソートを適用しない(空 sort として扱う)。rows の並びがそのまま表示順になり、
  //   恒等判定(行ドラッグ可否)も「並べ替えていない」側になる。
  manualSorting?: boolean;
  // 追加(監査 L-15): 相対日付プリセット(今日 等)を基準日で解決した範囲のキー(logic/filtering の
  //   resolveRelativeDateFilterKey)。列フィルターに相対プリセットがあるときだけ渡します(無ければ '' / 未指定)。
  //   値が変わる = 日付が変わって範囲も変わったら、列フィルターを評価し直します。
  relativeDateKey?: string;
};

export type RowOrderResolution = {
  // フィルター + ソート済みの表示順(order[i] = ビュー位置 i の元 rows index)。
  order: RowOrder;
  orderIsIdentity: boolean;
  // 表示順が恒等(ソート / フィルターなし)のときだけ行ドラッグを操作可能にします。
  rowDragOperable: boolean;
};

export type ClientSideRowModelInputs<T> = {
  rows: T[];
  order: RowOrder;
  rowGroupingActive: boolean;
  // 追加(label-row ①): ラベル行の配置と表示設定。labelLayout が null / 未指定、または rowGroupingActive の
  //   ときはラベル行の stage をバイパスします(従来経路とバイト等価)。
  labelLayout?: LabelRowLayout | null;
  labelSortMode?: LabelRowSortMode;
  keepEmptySections?: boolean;
  sortActive?: boolean;
  getLabel?: (row: T) => string;
  groupColumns: GridColumn<T>[];
  aggColumns: GridColumn<T>[];
  collapsedGroupKeys: ReadonlySet<string>;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
};

export type ClientSideRowModelResolution<T> = {
  groupTree: GroupTree<T> | null;
  groupedDisplay: GroupedDisplay | null;
  // 追加(label-row ①): ラベル行の表示順(有効時のみ。無効時は null)。
  labelDisplay: LabelDisplay<T> | null;
  rowModel: RowModel<T>;
};

export type ServerSideQueryInputs = {
  isServerSide: boolean;
  globalFilterEnabled: boolean;
  globalText: string;
  columnFilterEnabled: boolean;
  // 即時値(遅延化しない)。
  columnFilters: Record<string, ColumnFilterValue>;
  sortingEnabled: boolean;
  sort: GridSortState;
  // 追加(監査 L-15): 相対日付プリセットを解決した範囲のキー(RowOrderInputs.relativeDateKey と同じ)。'' 以外なら
  //   queryKey に含め、範囲が変わったら取り直します(プリセットは相対のままサーバへ送るため、query 自体は変わらない)。
  relativeDateKey?: string;
};

export type ServerSideQueryResolution = {
  query: ServerSideQuery;
  queryKey: string;
};

export const createRowPipelineResolver = <T,>() => {
  const memoBaseOrder = createMemo((rowCount: number) => createSourceOrder(rowCount));
  // 追加(label-row ①): ラベル行の配置(rows / 述語が変わったときだけ 1 パス)と、ラベル行を除いた恒等 order。
  const memoLabelLayout = createMemo(
    (rows: T[], isLabelRow: ((row: T, sourceIndex: number) => boolean) | undefined): LabelRowLayout | null =>
      isLabelRow ? resolveLabelRowLayout(rows, isLabelRow) : null,
  );
  const memoLabelFreeOrder = createMemo((layout: LabelRowLayout, rowCount: number) =>
    createLabelFreeOrder(layout, rowCount),
  );

  // number 記述子が当たっている可視列の「集合シグネチャ」(B-2)。値編集(>50 → >500 等)では同一列のままなので
  //   不変 → 下の numericFilterKeys を保持し、Float64 key をフィルタ値編集をまたいで再利用します。
  const memoNumberSignature = createMemo(
    (visibleColumns: GridColumn<T>[], columnFilters: Record<string, ColumnFilterValue>) => {
      const keys: string[] = [];
      for (const column of visibleColumns) {
        if (columnFilterUsesNumericKey(columnFilters[column.key])) {
          keys.push(column.key);
        }
      }
      return keys.join(SIGNATURE_SEPARATOR);
    },
  );
  // number(comparison/range)用に、列ごとの Number(セル値) を rows 全長・sourceIndex 添字の Float64Array へ
  //   前計算したキャッシュ(signature に載った列ぶんだけ。number 未使用なら空 Map = 実質ゼロコスト)。
  const memoNumericKeys = createMemo((rows: T[], visibleColumns: GridColumn<T>[], signature: string) => {
    const keyMap = new Map<string, Float64Array>();
    if (signature.length === 0) {
      return keyMap;
    }
    const targetKeys = new Set(signature.split(SIGNATURE_SEPARATOR));
    const rowCount = rows.length;
    for (const column of visibleColumns) {
      if (!targetKeys.has(column.key)) {
        continue;
      }
      const keys = new Float64Array(rowCount);
      for (let i = 0; i < rowCount; i += 1) {
        // 数値化は coerceNumberFilterCellValue(空白 = NaN)へ統一(compileSingleColumnFilter の非 key 経路と同一規則)。
        keys[i] = coerceNumberFilterCellValue(getCellValue(rows[i], column));
      }
      keyMap.set(column.key, keys);
    }
    return keyMap;
  });
  // 列フィルター済み order。入力がすべて前回と同じ参照なら前回の結果を返します(旧 createMemo と同じ)。
  // 変更(監査 L-15): 相対日付プリセットの範囲のキー(relativeDateKey)も入力に足し、範囲が変わったら評価し直します。
  // 変更(監査 B-10): 評価し直した結果の中身が前回と同じなら前回の参照を返します。1 セル編集で rows の参照が変わっても
  //   絞り込み結果が変わらなければ、下流(ソート / グルーピング / ラベル行 / RowModel の利用側)が「並びは不変」と
  //   判断できるようにするためです(中身の比較は O(n) で、絞り込み自体の O(n) に比べて十分小さい)。
  let filterCache: {
    rows: T[];
    globalFilteredOrder: RowOrder;
    columns: GridColumn<T>[];
    columnFilters: Record<string, ColumnFilterValue>;
    numericKeys: Map<string, Float64Array>;
    relativeDateKey: string;
    result: RowOrder;
  } | null = null;
  const resolveColumnFiltered = (
    rows: T[],
    globalFilteredOrder: RowOrder,
    columns: GridColumn<T>[],
    columnFilters: Record<string, ColumnFilterValue>,
    numericKeys: Map<string, Float64Array>,
    relativeDateKey: string,
  ): RowOrder => {
    const cached = filterCache;
    if (
      cached !== null &&
      cached.rows === rows &&
      cached.globalFilteredOrder === globalFilteredOrder &&
      cached.columns === columns &&
      cached.columnFilters === columnFilters &&
      cached.numericKeys === numericKeys &&
      cached.relativeDateKey === relativeDateKey
    ) {
      return cached.result;
    }
    let result = filterOrderByColumns(rows, globalFilteredOrder, columns, columnFilters, numericKeys);
    if (cached !== null && result !== cached.result && isSameOrder(result, cached.result)) {
      result = cached.result;
    }
    filterCache = { rows, globalFilteredOrder, columns, columnFilters, numericKeys, relativeDateKey, result };
    return result;
  };

  // ソート済み order。
  // 変更(監査 B-10): 前回の decorate 結果(位置ごとのソートキー)と並べ替えた位置を持ち、入力の order が前回と同じ
  //   (= 上の列フィルターの結果が不変)なら、今回のキーと比べて
  //   - どの位置のキーも同じ(ソート列以外の編集 / 同じ行の配列の作り直し)→ 前回の結果をそのまま返す、
  //   - 変わった位置が SORT_REPOSITION_LIMIT 件以下 → その位置だけ差し込み直す(repositionSortedPositions)、
  //   - それ以外 → decorate 済みのキーで全件ソート、
  //   とします。比べるのは「値」なので、行オブジェクトをその場で書き換えて新しい配列を渡す使い方でも結果は全件ソートと
  //   同じです。キーの decorate(O(n))は全件ソートでも必要なため、差分経路で増えるのは比較の O(n) だけです。
  //   ソートが無い / 有効な列が無いときは入力の order をそのまま返し、保持しているキーも捨てます(メモリを抱えない)。
  let sortCache: {
    rows: T[];
    input: RowOrder;
    columns: GridColumn<T>[];
    sort: GridSortState;
    keys: DecoratedSortKeys;
    positions: number[];
    result: RowOrder;
  } | null = null;
  const resolveSorted = (rows: T[], input: RowOrder, columns: GridColumn<T>[], sort: GridSortState): RowOrder => {
    const cached = sortCache;
    if (
      cached !== null &&
      cached.rows === rows &&
      cached.input === input &&
      cached.columns === columns &&
      cached.sort === sort
    ) {
      return cached.result;
    }
    const keys = decorateSortKeys(rows, input, columns, sort);
    if (keys === null) {
      sortCache = null;
      return input;
    }
    let positions: number[] | null = null;
    let result: RowOrder | null = null;
    if (cached !== null && cached.input === input) {
      const changed = diffSortKeys(cached.keys, keys, SORT_REPOSITION_LIMIT);
      if (changed !== null && changed.length === 0) {
        positions = cached.positions;
        result = cached.result;
      } else if (changed !== null) {
        positions = repositionSortedPositions(cached.positions, changed, keys, input);
      }
    }
    if (positions === null) {
      positions = sortPositionsByKeys(keys, input);
    }
    if (result === null) {
      result = undecorateSortedPositions(input, positions);
    }
    sortCache = { rows, input, columns, sort, keys, positions, result };
    return result;
  };
  const memoIdentity = createMemo((rowDragAvailable: boolean, order: RowOrder, rowCount: number) =>
    rowDragAvailable && isIdentityOrder(order, rowCount),
  );
  // ラベル行あり: データ行 order がラベル行を除いた恒等 order と一致するか(= 表示はラベル行込みで rows の
  //   並びそのもの。view index = source index が成り立つので行ドラッグは従来どおり動く)。
  const memoIdentityWithLabels = createMemo(
    (rowDragAvailable: boolean, order: RowOrder, labelFreeOrder: RowOrder) =>
      rowDragAvailable && isSameOrder(order, labelFreeOrder),
  );

  // グループツリー(集計込み)。開閉状態に依存しないため、開閉操作では再計算されません。
  const memoGroupTree = createMemo(
    (rowGroupingActive: boolean, rows: T[], order: RowOrder, groupColumns: GridColumn<T>[], aggColumns: GridColumn<T>[]) =>
      rowGroupingActive ? buildGroupTree(rows, order, groupColumns, aggColumns) : null,
  );
  const memoGroupedDisplay = createMemo((groupTree: GroupTree<T> | null, collapsedGroupKeys: ReadonlySet<string>) =>
    groupTree ? flattenGroupTree(groupTree, collapsedGroupKeys) : null,
  );
  // 追加(label-row ①): ラベル行の表示順。グルーピング有効時はバイパス(null)。
  const memoLabelDisplay = createMemo(
    (
      layout: LabelRowLayout | null,
      rows: T[],
      order: RowOrder,
      sortMode: LabelRowSortMode,
      keepEmptySections: boolean,
      sortActive: boolean,
      getLabel: ((row: T) => string) | undefined,
    ): LabelDisplay<T> | null =>
      layout && getLabel
        ? buildLabelDisplay({ rows, order, layout, sortMode, keepEmptySections, sortActive, getLabel })
        : null,
  );
  // RowModel シーム。viewIndex は表示上の行 index、getSourceIndex(= order[viewIndex])は元 rows の index。
  //   グルーピング有効時は groupedDisplay(開閉適用済み displayOrder + groups)を参照し、グループ行では
  //   getRow / getSourceIndex が実行時 undefined・getGroupRow が記述子を返します。
  const memoRowModel = createMemo(
    (
      groupedDisplay: GroupedDisplay | null,
      labelDisplay: LabelDisplay<T> | null,
      order: RowOrder,
      rows: T[],
      rowKeyGetter: (row: T, index: number) => GridRowKey,
    ): RowModel<T> => {
      if (labelDisplay) {
        return createLabelRowModel(labelDisplay, rows, rowKeyGetter);
      }
      if (groupedDisplay) {
        const { displayOrder, groups } = groupedDisplay;
        return {
          getRowCount: () => displayOrder.length,
          // グループ行では displayOrder 値が負のため rows[負値] = undefined(型は T のまま・実行時 undefined)。
          getRow: (viewIndex) => rows[displayOrder[viewIndex]],
          getSourceIndex: (viewIndex) => {
            const value = displayOrder[viewIndex];
            return value >= 0 ? value : (undefined as unknown as number);
          },
          getRowKey: (viewIndex) => {
            const value = displayOrder[viewIndex];
            if (isGroupOrderValue(value)) {
              return groupRowKey(groups[groupIndexOfOrderValue(value)]);
            }
            return rowKeyGetter(rows[value], value);
          },
          getGroupRow: (viewIndex): GridGroupRow | undefined => {
            const value = displayOrder[viewIndex];
            return isGroupOrderValue(value) ? groups[groupIndexOfOrderValue(value)] : undefined;
          },
        };
      }
      return {
        getRowCount: () => order.length,
        getRow: (viewIndex) => rows[order[viewIndex]],
        getSourceIndex: (viewIndex) => order[viewIndex],
        getRowKey: (viewIndex) => rowKeyGetter(rows[order[viewIndex]], order[viewIndex]),
      };
    },
  );

  const memoServerQuery = createMemo(
    (
      isServerSide: boolean,
      globalFilterEnabled: boolean,
      globalText: string,
      columnFilterEnabled: boolean,
      columnFilters: Record<string, ColumnFilterValue>,
      sortingEnabled: boolean,
      sort: GridSortState,
    ): ServerSideQuery =>
      isServerSide
        ? buildServerSideQuery({
            globalText: globalFilterEnabled ? globalText : '',
            columnFilters: columnFilterEnabled ? columnFilters : EMPTY_COLUMN_FILTERS,
            sort: sortingEnabled ? sort : EMPTY_SORT,
          })
        : EMPTY_SERVER_QUERY,
  );
  // 変更(監査 L-15): 相対日付プリセットの範囲のキー(relativeDateKey)が '' 以外なら queryKey の末尾に足します。
  //   範囲が変わると queryKey が変わり、取り直しになります(プリセットが無ければ従来と同じキー)。
  const memoServerQueryKey = createMemo((isServerSide: boolean, query: ServerSideQuery, relativeDateKey: string) =>
    isServerSide
      ? relativeDateKey === ''
        ? serializeServerSideQuery(query)
        : `${serializeServerSideQuery(query)}${SIGNATURE_SEPARATOR}${relativeDateKey}`
      : '',
  );
  const memoServerQueryPair = createMemo(
    (query: ServerSideQuery, queryKey: string): ServerSideQueryResolution => ({ query, queryKey }),
  );

  return {
    // 追加(label-row ①): ラベル行の配置(述語なしなら null)。
    resolveLabelRowLayout: (
      rows: T[],
      isLabelRow: ((row: T, sourceIndex: number) => boolean) | undefined,
    ): LabelRowLayout | null => memoLabelLayout(rows, isLabelRow),
    // 変更(label-row ①): labelLayout を渡すとラベル行を除いた恒等 order(データ行のみ)を返します。
    resolveBaseOrder: (rowCount: number, labelLayout?: LabelRowLayout | null): RowOrder =>
      labelLayout ? memoLabelFreeOrder(labelLayout, rowCount) : memoBaseOrder(rowCount),
    resolveOrder: (inputs: RowOrderInputs<T>): RowOrderResolution => {
      const { rows, filterSortColumns, globalFilteredOrder, rowDragAvailable, labelLayout } = inputs;
      // 追加(manual-mode): 手動モードでは空定数へ差し替える(下流 memo の引数が安定し、絞り込み / 並べ替え /
      //   Float64 key 前計算のいずれも走らない)。
      const columnFilters = inputs.manualFiltering ? EMPTY_COLUMN_FILTERS : inputs.columnFilters;
      const sort = inputs.manualSorting ? EMPTY_SORT : inputs.sort;
      const signature = memoNumberSignature(filterSortColumns, columnFilters);
      const numericKeys = memoNumericKeys(rows, filterSortColumns, signature);
      const columnFilteredOrder = resolveColumnFiltered(
        rows,
        globalFilteredOrder,
        filterSortColumns,
        columnFilters,
        numericKeys,
        inputs.relativeDateKey ?? '',
      );
      const order = resolveSorted(rows, columnFilteredOrder, filterSortColumns, sort);
      const orderIsIdentity = labelLayout
        ? memoIdentityWithLabels(rowDragAvailable, order, memoLabelFreeOrder(labelLayout, rows.length))
        : memoIdentity(rowDragAvailable, order, rows.length);
      return {
        order,
        orderIsIdentity,
        rowDragOperable: isRowDragOperable(rowDragAvailable, orderIsIdentity),
      };
    },
    resolveClientSideRowModel: (inputs: ClientSideRowModelInputs<T>): ClientSideRowModelResolution<T> => {
      const {
        rows,
        order,
        rowGroupingActive,
        groupColumns,
        aggColumns,
        collapsedGroupKeys,
        rowKeyGetter,
        labelLayout,
        labelSortMode = 'section',
        keepEmptySections = false,
        sortActive = false,
        getLabel,
      } = inputs;
      const groupTree = memoGroupTree(rowGroupingActive, rows, order, groupColumns, aggColumns);
      const groupedDisplay = memoGroupedDisplay(groupTree, collapsedGroupKeys);
      // ラベル行はグルーピングと併用しません(rowGroup 有効時はラベル行の stage をバイパス)。
      const labelDisplay = memoLabelDisplay(
        rowGroupingActive ? null : (labelLayout ?? null),
        rows,
        order,
        labelSortMode,
        keepEmptySections,
        sortActive,
        getLabel,
      );
      const rowModel = memoRowModel(groupedDisplay, labelDisplay, order, rows, rowKeyGetter);
      return { groupTree, groupedDisplay, labelDisplay, rowModel };
    },
    resolveServerSideQuery: (inputs: ServerSideQueryInputs): ServerSideQueryResolution => {
      const { isServerSide, globalFilterEnabled, globalText, columnFilterEnabled, columnFilters, sortingEnabled, sort } =
        inputs;
      const query = memoServerQuery(
        isServerSide,
        globalFilterEnabled,
        globalText,
        columnFilterEnabled,
        columnFilters,
        sortingEnabled,
        sort,
      );
      return memoServerQueryPair(query, memoServerQueryKey(isServerSide, query, inputs.relativeDateKey ?? ''));
    },
  };
};

export type RowPipelineResolver<T> = ReturnType<typeof createRowPipelineResolver<T>>;