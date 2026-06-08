import type { GridColumn } from '../model/gridTypes';

// ────────────────────────────────────────────────
// 既存: 列の座標計算を共通化するための measurement 型です。
// ────────────────────────────────────────────────

export type ColumnMeasurement<T> = {
  index: number;
  column: GridColumn<T>;
  start: number;
  // 追加: 各列の実表示幅です。
  size: number;
  end: number;
};

// 追加: 値を min/max に収めるユーティリティです。
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// 追加: columns + columnWidths から、列座標の measurement 一覧を生成します。
export const buildColumnMeasurements = <T,>(
  columns: GridColumn<T>[],
  columnWidths: Record<string, number>,
): ColumnMeasurement<T>[] => {
  let start = 0;
  return columns.map((column, index) => {
    const size = columnWidths[column.key] ?? column.width;
    const measurement: ColumnMeasurement<T> = {
      index,
      column,
      start,
      size,
      end: start + size,
    };
    start += size;
    return measurement;
  });
};

// 追加: x 座標から列 index を特定するための二分探索です。
export const findColumnIndexFromOffset = <T,>(
  measurements: ColumnMeasurement<T>[],
  offset: number,
) => {
  if (measurements.length === 0) {
    return -1;
  }
  if (offset <= 0) {
    return 0;
  }
  let low = 0;
  let high = measurements.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = measurements[mid];
    if (offset < current.start) {
      high = mid - 1;
      continue;
    }
    if (offset >= current.end) {
      low = mid + 1;
      continue;
    }
    return current.index;
  }
  return Math.max(0, Math.min(low, measurements.length - 1));
};

// ────────────────────────────────────────────────
// 追加(10-A): 3 ペイン（pinned-left / center / pinned-right）
//             分離に必要な型と helper 群です。
//             ここでは型定義と純粋関数のみ追加し、
//             レンダリングは一切変更しません。
// ────────────────────────────────────────────────

// 追加(10-A): 列が所属するペインの種別です。
export type ColumnPane = 'left' | 'center' | 'right';

// 追加(10-A): 列定義から所属ペインを判定します。
export const getColumnPane = <T,>(column: GridColumn<T>): ColumnPane => {
  if (column.pinned === 'left') return 'left';
  if (column.pinned === 'right') return 'right';
  return 'center';
};

// 追加(10-A): visibleColumns を AG Grid 互換の視覚順序に並べ替えます。
//             pinned-left → center → pinned-right の順になります。
//             各グループ内では元配列の相対順序が保持されます。
//             ※ この関数で返る配列が「論理列 index」の基準になります。
export const reorderColumnsByPane = <T,>(
  columns: GridColumn<T>[],
): GridColumn<T>[] => {
  const left: GridColumn<T>[] = [];
  const center: GridColumn<T>[] = [];
  const right: GridColumn<T>[] = [];

  for (const column of columns) {
    const pane = getColumnPane(column);
    if (pane === 'left') left.push(column);
    else if (pane === 'right') right.push(column);
    else center.push(column);
  }

  return [...left, ...center, ...right];
};

// 追加(10-A): 1 つのペイン内における列の座標情報です。
//             paneLocalStart / paneLocalEnd はペイン内ローカル座標（0 始まり）です。
//             logicalIndex は reorder 後の visibleColumns 配列上の index です。
export type PaneColumnEntry<T> = {
  column: GridColumn<T>;
  logicalIndex: number;
  paneLocalStart: number;
  paneLocalSize: number;
  paneLocalEnd: number;
};

// 追加(10-A): 1 つのペインの geometry 情報です。
export type PaneGeometry<T> = {
  pane: ColumnPane;
  entries: PaneColumnEntry<T>[];
  totalWidth: number;
};

// 追加(10-A): 3 ペイン全体のレイアウト情報です。
export type GridPaneLayout<T> = {
  left: PaneGeometry<T>;
  center: PaneGeometry<T>;
  right: PaneGeometry<T>;
};

// 追加(10-A): reorder 済み visibleColumns + columnWidths から
//             3 ペインレイアウトを構築します。
//             引数の columns は reorderColumnsByPane() 済みを前提とします。
export const buildGridPaneLayout = <T,>(
  orderedColumns: GridColumn<T>[],
  columnWidths: Record<string, number>,
): GridPaneLayout<T> => {
  // 追加(10-A): 列を 3 グループに振り分けつつ論理 index を記録します。
  const groups: Record<ColumnPane, { column: GridColumn<T>; logicalIndex: number }[]> = {
    left: [],
    center: [],
    right: [],
  };

  orderedColumns.forEach((column, logicalIndex) => {
    const pane = getColumnPane(column);
    groups[pane].push({ column, logicalIndex });
  });

  // 追加(10-A): 1 ペイン分の PaneGeometry を生成する内部 helper です。
  const buildPane = (
    pane: ColumnPane,
    items: { column: GridColumn<T>; logicalIndex: number }[],
  ): PaneGeometry<T> => {
    let offset = 0;
    const entries: PaneColumnEntry<T>[] = items.map(({ column, logicalIndex }) => {
      const size = columnWidths[column.key] ?? column.width;
      const entry: PaneColumnEntry<T> = {
        column,
        logicalIndex,
        paneLocalStart: offset,
        paneLocalSize: size,
        paneLocalEnd: offset + size,
      };
      offset += size;
      return entry;
    });
    return { pane, entries, totalWidth: offset };
  };

  return {
    left: buildPane('left', groups.left),
    center: buildPane('center', groups.center),
    right: buildPane('right', groups.right),
  };
};

// 追加(10-A): ペイン + エントリをまとめて返す lookup 結果型です。
export type PaneColumnLookupResult<T> = {
  pane: ColumnPane;
  entry: PaneColumnEntry<T>;
};

// 追加(10-A): 論理列 index からペインとローカル座標を逆引きします。
//             見つからない場合は null を返します。
export const lookupPaneColumn = <T,>(
  layout: GridPaneLayout<T>,
  logicalIndex: number,
): PaneColumnLookupResult<T> | null => {
  const panes: [ColumnPane, PaneGeometry<T>][] = [
    ['left', layout.left],
    ['center', layout.center],
    ['right', layout.right],
  ];

  for (const [pane, geometry] of panes) {
    const entry = geometry.entries.find((e) => e.logicalIndex === logicalIndex);
    if (entry) {
      return { pane, entry };
    }
  }

  return null;
};

// 追加(10-A): ペイン内ローカル x 座標から論理列 index を特定します。
//             pointer interaction でペインごとにヒットテストするために使います。
export const findLogicalIndexFromPaneOffset = <T,>(
  paneGeometry: PaneGeometry<T>,
  offset: number,
): number => {
  const { entries } = paneGeometry;
  if (entries.length === 0) {
    return -1;
  }
  if (offset <= 0) {
    return entries[0].logicalIndex;
  }

  let low = 0;
  let high = entries.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const entry = entries[mid];

    if (offset < entry.paneLocalStart) {
      high = mid - 1;
      continue;
    }
    if (offset >= entry.paneLocalEnd) {
      low = mid + 1;
      continue;
    }
    // 追加(10-A): ヒットしたエントリの論理 index を返します。
    return entry.logicalIndex;
  }

  // 追加(10-A): 範囲外の場合は最も近いエントリの論理 index を返します。
  const clampedIndex = Math.max(0, Math.min(low, entries.length - 1));
  return entries[clampedIndex].logicalIndex;
};

// 追加(10-A): 3 ペインそれぞれに pinned 列が何本あるかを返す convenience helper です。
export const countPinnedColumns = <T,>(
  layout: GridPaneLayout<T>,
): { left: number; center: number; right: number } => ({
  left: layout.left.entries.length,
  center: layout.center.entries.length,
  right: layout.right.entries.length,
});

// 追加(10-A): pinned 列が 1 本もなければ true を返します。
//             10-B 以降で「従来の単一スクロール描画にフォールバックするか」の判定に使います。
export const isPlainLayout = <T,>(layout: GridPaneLayout<T>): boolean =>
  layout.left.entries.length === 0 && layout.right.entries.length === 0;
// ────────────────────────────────────────────────
// 追加(10-D): Overlay / Editor をペイン別座標系で描画するための helper 群です。
//             10-C までで「セル本体・ヘッダー」はペインローカル座標になりましたが、
//             SelectionOverlay / ActiveCellOverlay / CellEditorLayer はまだ
//             グローバル座標（columnMeasurements + rowHeaderWidth）前提でした。
//             ここで「論理列 index 範囲 → 各ペインのローカル水平 extent」を求める
//             純粋関数を用意し、overlay を各ペイン内へ正しく配置できるようにします。
//             ※ 返す座標は leadingWidth を含まない「列領域内ローカル座標」です。
//               leadingWidth（行ヘッダー幅）は描画側で加算します。
// ────────────────────────────────────────────────

// 追加(10-D): 1 ペイン内における水平 extent（列領域ローカル座標, leadingWidth 非含有）です。
//             start / end は paneLocalStart / paneLocalEnd 起点で、width = end - start です。
export type PaneColumnExtent = {
  start: number;
  end: number;
  width: number;
};

// 追加(10-D): 3 ペインそれぞれの水平 extent をまとめた結果です。
//             該当ペインに範囲内の列が 1 本も無い場合は null になります。
export type PaneColumnExtentMap = Record<ColumnPane, PaneColumnExtent | null>;

// 追加(10-D): 1 ペイン分の extent を、論理列 index 範囲 [startLogicalIndex, endLogicalIndex]
//             （両端含む）から求める内部 helper です。
const computeExtentForPane = <T,>(
  geometry: PaneGeometry<T>,
  startLogicalIndex: number,
  endLogicalIndex: number,
): PaneColumnExtent | null => {
  const lo = Math.min(startLogicalIndex, endLogicalIndex);
  const hi = Math.max(startLogicalIndex, endLogicalIndex);

  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const entry of geometry.entries) {
    if (entry.logicalIndex < lo || entry.logicalIndex > hi) {
      continue;
    }
    found = true;
    if (entry.paneLocalStart < start) start = entry.paneLocalStart;
    if (entry.paneLocalEnd > end) end = entry.paneLocalEnd;
  }

  if (!found) {
    return null;
  }
  return { start, end, width: end - start };
};

// 追加(10-D): 論理列 index 範囲から、3 ペインそれぞれの水平 extent を求めます。
//             cell / col 選択や行ヘッダー以外の overlay の水平範囲決定に使います。
export const computePaneColumnExtents = <T,>(
  layout: GridPaneLayout<T>,
  startLogicalIndex: number,
  endLogicalIndex: number,
): PaneColumnExtentMap => ({
  left: computeExtentForPane(layout.left, startLogicalIndex, endLogicalIndex),
  center: computeExtentForPane(
    layout.center,
    startLogicalIndex,
    endLogicalIndex,
  ),
  right: computeExtentForPane(layout.right, startLogicalIndex, endLogicalIndex),
});

// 追加(10-D): 「全列」を覆う extent を 3 ペイン分求めます（行選択 overlay 用）。
//             各ペインは自分の列領域全幅（0 〜 totalWidth）を覆います。
//             列が無いペインは null になります。
export const computeFullWidthPaneExtents = <T,>(
  layout: GridPaneLayout<T>,
): PaneColumnExtentMap => {
  const toExtent = (geometry: PaneGeometry<T>): PaneColumnExtent | null =>
    geometry.entries.length === 0
      ? null
      : { start: 0, end: geometry.totalWidth, width: geometry.totalWidth };

  return {
    left: toExtent(layout.left),
    center: toExtent(layout.center),
    right: toExtent(layout.right),
  };
};

// 追加(10-D): 単一論理列 index が属するペインと、その列のローカル extent を求めます。
//             ActiveCellOverlay / CellEditorLayer のように単一セル列を扱う場合に使います。
//             見つからなければ null を返します。
export type SinglePaneColumnExtent = {
  pane: ColumnPane;
  extent: PaneColumnExtent;
};

export const computeSinglePaneColumnExtent = <T,>(
  layout: GridPaneLayout<T>,
  logicalIndex: number,
): SinglePaneColumnExtent | null => {
  const lookup = lookupPaneColumn(layout, logicalIndex);
  if (!lookup) {
    return null;
  }
  const { pane, entry } = lookup;
  return {
    pane,
    extent: {
      start: entry.paneLocalStart,
      end: entry.paneLocalEnd,
      width: entry.paneLocalSize,
    },
  };
};
