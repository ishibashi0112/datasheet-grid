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
import { sortOrder } from '../logic/sorting';
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
import { getCellValue } from '../utils/permissions';
import { createMemo } from './memo';

const EMPTY_SERVER_QUERY: ServerSideQuery = {};
const EMPTY_COLUMN_FILTERS: Record<string, ColumnFilterValue> = {};
const EMPTY_SORT: GridSortState = [];
// number 列シグネチャの区切り(NUL は列キーへの混入が実質ありえないため)。
const SIGNATURE_SEPARATOR = '\u0000';

export type RowOrderInputs<T> = {
  rows: T[];
  visibleColumns: GridColumn<T>[];
  // 列フィルター評価値(描画側で遅延化した値を渡してよい)。
  columnFilters: Record<string, ColumnFilterValue>;
  // グローバルフィルター済み order(globalFilteredOrder コントローラの出力)。
  globalFilteredOrder: RowOrder;
  sort: GridSortState;
  rowDragAvailable: boolean;
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
  groupColumns: GridColumn<T>[];
  aggColumns: GridColumn<T>[];
  collapsedGroupKeys: ReadonlySet<string>;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
};

export type ClientSideRowModelResolution<T> = {
  groupTree: GroupTree<T> | null;
  groupedDisplay: GroupedDisplay | null;
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
};

export type ServerSideQueryResolution = {
  query: ServerSideQuery;
  queryKey: string;
};

export const createRowPipelineResolver = <T,>() => {
  const memoBaseOrder = createMemo((rowCount: number) => createSourceOrder(rowCount));

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
  const memoColumnFiltered = createMemo(
    (
      rows: T[],
      globalFilteredOrder: RowOrder,
      visibleColumns: GridColumn<T>[],
      columnFilters: Record<string, ColumnFilterValue>,
      numericKeys: Map<string, Float64Array>,
    ) => filterOrderByColumns(rows, globalFilteredOrder, visibleColumns, columnFilters, numericKeys),
  );
  const memoSorted = createMemo(
    (rows: T[], columnFilteredOrder: RowOrder, visibleColumns: GridColumn<T>[], sort: GridSortState) =>
      sortOrder(rows, columnFilteredOrder, visibleColumns, sort),
  );
  const memoIdentity = createMemo((rowDragAvailable: boolean, order: RowOrder, rowCount: number) =>
    rowDragAvailable && isIdentityOrder(order, rowCount),
  );

  // グループツリー(集計込み)。開閉状態に依存しないため、開閉操作では再計算されません。
  const memoGroupTree = createMemo(
    (rowGroupingActive: boolean, rows: T[], order: RowOrder, groupColumns: GridColumn<T>[], aggColumns: GridColumn<T>[]) =>
      rowGroupingActive ? buildGroupTree(rows, order, groupColumns, aggColumns) : null,
  );
  const memoGroupedDisplay = createMemo((groupTree: GroupTree<T> | null, collapsedGroupKeys: ReadonlySet<string>) =>
    groupTree ? flattenGroupTree(groupTree, collapsedGroupKeys) : null,
  );
  // RowModel シーム。viewIndex は表示上の行 index、getSourceIndex(= order[viewIndex])は元 rows の index。
  //   グルーピング有効時は groupedDisplay(開閉適用済み displayOrder + groups)を参照し、グループ行では
  //   getRow / getSourceIndex が実行時 undefined・getGroupRow が記述子を返します。
  const memoRowModel = createMemo(
    (
      groupedDisplay: GroupedDisplay | null,
      order: RowOrder,
      rows: T[],
      rowKeyGetter: (row: T, index: number) => GridRowKey,
    ): RowModel<T> => {
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
  const memoServerQueryKey = createMemo((isServerSide: boolean, query: ServerSideQuery) =>
    isServerSide ? serializeServerSideQuery(query) : '',
  );
  const memoServerQueryPair = createMemo(
    (query: ServerSideQuery, queryKey: string): ServerSideQueryResolution => ({ query, queryKey }),
  );

  return {
    resolveBaseOrder: (rowCount: number): RowOrder => memoBaseOrder(rowCount),
    resolveOrder: (inputs: RowOrderInputs<T>): RowOrderResolution => {
      const { rows, visibleColumns, columnFilters, globalFilteredOrder, sort, rowDragAvailable } = inputs;
      const signature = memoNumberSignature(visibleColumns, columnFilters);
      const numericKeys = memoNumericKeys(rows, visibleColumns, signature);
      const columnFilteredOrder = memoColumnFiltered(rows, globalFilteredOrder, visibleColumns, columnFilters, numericKeys);
      const order = memoSorted(rows, columnFilteredOrder, visibleColumns, sort);
      const orderIsIdentity = memoIdentity(rowDragAvailable, order, rows.length);
      return {
        order,
        orderIsIdentity,
        rowDragOperable: isRowDragOperable(rowDragAvailable, orderIsIdentity),
      };
    },
    resolveClientSideRowModel: (inputs: ClientSideRowModelInputs<T>): ClientSideRowModelResolution<T> => {
      const { rows, order, rowGroupingActive, groupColumns, aggColumns, collapsedGroupKeys, rowKeyGetter } = inputs;
      const groupTree = memoGroupTree(rowGroupingActive, rows, order, groupColumns, aggColumns);
      const groupedDisplay = memoGroupedDisplay(groupTree, collapsedGroupKeys);
      const rowModel = memoRowModel(groupedDisplay, order, rows, rowKeyGetter);
      return { groupTree, groupedDisplay, rowModel };
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
      return memoServerQueryPair(query, memoServerQueryKey(isServerSide, query));
    },
  };
};

export type RowPipelineResolver<T> = ReturnType<typeof createRowPipelineResolver<T>>;