// 追加(本体分解 E-1): 列解決と 3 ペインレイアウトの派生値計算です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「columns」「3ペイン geometry」「center 列の JS 算出 flex」セクションを移設)。
//   - createColumnResolver: 全列定義 + 設定 → 合成列(行ドラッグハンドル / 展開行トグル / 自動グループ列)を
//     注入した effectiveColumns、可視列 visibleColumns、ペイン順 orderedColumns を返します。
//     展開行トグル列のセル描画は描画側(React シェル)から renderDetailToggleCell として受け取ります
//     (合成列の定義は純粋ですが、セル本体だけがフレームワーク依存のため)。
//   - createPaneLayoutResolver: orderedColumns + 列幅 + ビューポート幅 → flex 解決幅と 3 ペイン geometry
//     (paneLayout)と各種の幅派生値を返します。
//   メモ化は createMemo(useMemo と同じ Object.is 比較)で、旧 useMemo の依存単位をそのまま保っています
//   (ライブリサイズ中に幅が変わらないペインの geometry / entries 参照が不変になる 11-B4 の性質を含む)。
import type { GridColumn } from '../model/gridTypes.unbound';
import {
  buildPaneGeometryFromWidthsKey,
  buildPaneWidthsKey,
  reorderColumnsByPane,
  splitOrderedColumnsByPane,
  type GridPaneLayout,
  type PaneSourceColumn,
  type PaneSourceColumns,
} from '../logic/geometry';
import { computeCenterFlexWidths, isFlexingColumn } from '../logic/columnFlex';
import { DETAIL_TOGGLE_COLUMN_KEY, DETAIL_TOGGLE_COLUMN_WIDTH } from '../logic/detailRow';
import {
  ROW_DRAG_HANDLE_COLUMN_KEY,
  ROW_DRAG_HANDLE_COLUMN_WIDTH,
  isRowDragAvailable,
} from '../logic/rowReorder';
import { GROUP_AUTO_COLUMN_KEY, collectGroupingColumns } from '../logic/grouping';
import { createMemo } from './memo';

// ── 列解決 ─────────────────────────────────────────────

export type ColumnResolutionInputs<T> = {
  // consumer の全列定義(非表示含む)。
  columns: GridColumn<T>[];
  // dataSource 指定(SSRM)か。グルーピングと行ドラッグは clientSide 限定。
  isServerSide: boolean;
  enableRowDrag: boolean;
  // onRowsChange 指定の有無(行ドラッグの結果を反映できるか)。
  hasRowsChange: boolean;
  // detailRow 指定かつ showToggleColumn !== false。
  detailToggleColumnActive: boolean;
  // 展開行トグル列のセル描画(描画側が提供。参照は安定させること)。
  renderDetailToggleCell: NonNullable<GridColumn<T>['renderCell']>;
};

export type ColumnResolution<T> = {
  // rowGroup 列(columns 出現順 = 階層順)と aggFunc 列。全列定義から導出(visible の影響を受けない)。
  groupColumns: GridColumn<T>[];
  aggColumns: GridColumn<T>[];
  rowGroupingActive: boolean;
  // 行ドラッグ並び替えの利用可否(ハンドル列を出すか)。
  rowDragAvailable: boolean;
  // 合成列を注入した内部列リスト(合成列なし・グルーピング無効なら columns と同一参照)。
  effectiveColumns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  // pinned 属性に応じて視覚順序(left → center → right)に並べ替えた可視列。
  orderedColumns: GridColumn<T>[];
};

export const createColumnResolver = <T,>() => {
  const memoGrouping = createMemo((columns: GridColumn<T>[]) => collectGroupingColumns(columns));
  // グルーピング有効時は先頭に自動グループ列(ツリー表示。consumer の columns には現れない合成列)を注入し、
  //   グループ元列(rowGroup)は表示から外します。展開行トグル列(T1)と行ドラッグハンドル列はさらに先頭へ
  //   (左固定列があれば左ペインへ pin)。いずれも無効なら columns をそのまま返します(既存経路はバイト等価)。
  const memoEffective = createMemo(
    (
      rowDragAvailable: boolean,
      detailToggleColumnActive: boolean,
      rowGroupingActive: boolean,
      columns: GridColumn<T>[],
      groupColumns: GridColumn<T>[],
      renderDetailToggleCell: NonNullable<GridColumn<T>['renderCell']>,
    ): GridColumn<T>[] => {
      const hasLeftPinnedColumn = columns.some((column) => column.pinned === 'left');
      const rowDragHandleColumn: GridColumn<T> | null = rowDragAvailable
        ? {
            key: ROW_DRAG_HANDLE_COLUMN_KEY,
            title: '',
            width: ROW_DRAG_HANDLE_COLUMN_WIDTH,
            minWidth: ROW_DRAG_HANDLE_COLUMN_WIDTH,
            readOnly: true,
            suppressAutoSize: true,
            resizable: false,
            pinned: hasLeftPinnedColumn ? 'left' : undefined,
            cellClassName: 'ssg-body-cell--row-drag-handle',
            // セル本体(掴み手)は描画側の renderCellContent が描きます(操作可否とハンドラを持つため)。
            renderCell: () => null,
          }
        : null;
      const detailToggleColumn: GridColumn<T> | null = detailToggleColumnActive
        ? {
            key: DETAIL_TOGGLE_COLUMN_KEY,
            title: '',
            width: DETAIL_TOGGLE_COLUMN_WIDTH,
            minWidth: DETAIL_TOGGLE_COLUMN_WIDTH,
            readOnly: true,
            suppressAutoSize: true,
            resizable: false,
            pinned: hasLeftPinnedColumn ? 'left' : undefined,
            cellClassName: 'ssg-body-cell--detail-toggle',
            renderCell: renderDetailToggleCell,
          }
        : null;
      const leadingColumns: GridColumn<T>[] = [];
      if (rowDragHandleColumn) leadingColumns.push(rowDragHandleColumn);
      if (detailToggleColumn) leadingColumns.push(detailToggleColumn);
      if (!rowGroupingActive) {
        return leadingColumns.length > 0 ? [...leadingColumns, ...columns] : columns;
      }
      const autoGroupColumn: GridColumn<T> = {
        key: GROUP_AUTO_COLUMN_KEY,
        title: groupColumns.map((column) => column.title || column.key).join(' › '),
        width: 240,
        minWidth: 120,
        readOnly: true,
        suppressAutoSize: true,
      };
      const grouped = [autoGroupColumn, ...columns.filter((column) => column.rowGroup !== true)];
      return leadingColumns.length > 0 ? [...leadingColumns, ...grouped] : grouped;
    },
  );
  const memoVisible = createMemo((effectiveColumns: GridColumn<T>[]) =>
    effectiveColumns.filter((column) => column.visible !== false),
  );
  const memoOrdered = createMemo((visibleColumns: GridColumn<T>[]) => reorderColumnsByPane(visibleColumns));

  return (inputs: ColumnResolutionInputs<T>): ColumnResolution<T> => {
    const { columns, isServerSide, enableRowDrag, hasRowsChange, detailToggleColumnActive, renderDetailToggleCell } =
      inputs;
    const { groupColumns, aggColumns } = memoGrouping(columns);
    const rowGroupingActive = !isServerSide && groupColumns.length > 0;
    const rowDragAvailable = isRowDragAvailable({
      enableRowDrag,
      isServerSide,
      rowGroupingActive,
      hasRowsChange,
    });
    const effectiveColumns = memoEffective(
      rowDragAvailable,
      detailToggleColumnActive,
      rowGroupingActive,
      columns,
      groupColumns,
      renderDetailToggleCell,
    );
    const visibleColumns = memoVisible(effectiveColumns);
    const orderedColumns = memoOrdered(visibleColumns);
    return {
      groupColumns,
      aggColumns,
      rowGroupingActive,
      rowDragAvailable,
      effectiveColumns,
      visibleColumns,
      orderedColumns,
    };
  };
};

// ── 3 ペインレイアウト ───────────────────────────────────

// flex 解決幅の共有空 map(未計測 / flex 列なしのときは参照不変)。
const EMPTY_FLEX_WIDTHS: Record<string, number> = {};

export type PaneLayoutInputs<T> = {
  orderedColumns: GridColumn<T>[];
  // 手動リサイズ / autosize 済みの列幅(uiState.columnWidths)。
  columnWidths: Record<string, number>;
  // スクロールコンテナの clientWidth。0 は未計測(flex を適用せず column.width にフォールバック)。
  viewportWidth: number;
  rowHeaderWidth: number;
};

export type PaneLayoutResolution<T> = {
  paneSourceColumns: PaneSourceColumns<T>;
  hasFlexColumn: boolean;
  // columnWidths[key] ?? flex 算出[key] ?? column.width の前段(flex 列なしなら columnWidths と同一参照)。
  effectiveColumnWidths: Record<string, number>;
  paneLayout: GridPaneLayout<T>;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  // 行ヘッダー(#・行番号)を中央ペインが持つか(左固定列がなければ中央)。
  centerOwnsRowHeader: boolean;
  // 各ペインで列の前に確保する先頭幅。
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  leftPaneTotalWidth: number;
  rightPaneTotalWidth: number;
  centerContentWidth: number;
  // 共有スクロールコンテナの内側コンテンツ全幅。
  totalScrollWidth: number;
};

const sumResolvedWidths = <T,>(items: PaneSourceColumn<T>[], columnWidths: Record<string, number>): number =>
  items.reduce((acc, { column }) => acc + (columnWidths[column.key] ?? column.width), 0);

export const createPaneLayoutResolver = <T,>() => {
  const memoSource = createMemo((orderedColumns: GridColumn<T>[]) => splitOrderedColumnsByPane(orderedColumns));
  const memoCenterColumns = createMemo((center: PaneSourceColumn<T>[]) => center.map(({ column }) => column));
  const memoHasFlex = createMemo((centerColumns: GridColumn<T>[]) => centerColumns.some(isFlexingColumn));
  const memoFlexWidths = createMemo(
    (
      hasFlexColumn: boolean,
      viewportWidth: number,
      centerColumns: GridColumn<T>[],
      columnWidths: Record<string, number>,
      availableWidth: number,
    ) => {
      if (!hasFlexColumn || viewportWidth <= 0) {
        return EMPTY_FLEX_WIDTHS;
      }
      return computeCenterFlexWidths(centerColumns, columnWidths, availableWidth);
    },
  );
  const memoEffectiveWidths = createMemo((flexWidths: Record<string, number>, columnWidths: Record<string, number>) =>
    flexWidths === EMPTY_FLEX_WIDTHS ? columnWidths : { ...flexWidths, ...columnWidths },
  );
  const memoLeftGeometry = createMemo((items: PaneSourceColumn<T>[], widthsKey: string) =>
    buildPaneGeometryFromWidthsKey('left', items, widthsKey),
  );
  const memoCenterGeometry = createMemo((items: PaneSourceColumn<T>[], widthsKey: string) =>
    buildPaneGeometryFromWidthsKey('center', items, widthsKey),
  );
  const memoRightGeometry = createMemo((items: PaneSourceColumn<T>[], widthsKey: string) =>
    buildPaneGeometryFromWidthsKey('right', items, widthsKey),
  );
  const memoLayout = createMemo(
    (left: GridPaneLayout<T>['left'], center: GridPaneLayout<T>['center'], right: GridPaneLayout<T>['right']) => ({
      left,
      center,
      right,
    }),
  );

  return (inputs: PaneLayoutInputs<T>): PaneLayoutResolution<T> => {
    const { orderedColumns, columnWidths, viewportWidth, rowHeaderWidth } = inputs;
    const paneSourceColumns = memoSource(orderedColumns);

    // center 列の flex: 「利用可能幅 − 固定列合計」を比率配分します。左右ペインは pinned(= flex 非対象)なので
    //   center 列幅に依存せず先に確定でき、循環しません。
    const leftPaneFixedWidth = sumResolvedWidths(paneSourceColumns.left, columnWidths);
    const rightPaneFixedWidth = sumResolvedWidths(paneSourceColumns.right, columnWidths);
    const hasLeftPinned = paneSourceColumns.left.length > 0;
    const flexLeftPaneTotalWidth = hasLeftPinned ? rowHeaderWidth + leftPaneFixedWidth : 0;
    const flexCenterLeadingWidth = hasLeftPinned ? 0 : rowHeaderWidth;
    const centerColumns = memoCenterColumns(paneSourceColumns.center);
    const hasFlexColumn = memoHasFlex(centerColumns);
    const availableCenterFlexWidth = viewportWidth - flexLeftPaneTotalWidth - rightPaneFixedWidth - flexCenterLeadingWidth;
    const centerFlexWidths = memoFlexWidths(
      hasFlexColumn,
      viewportWidth,
      centerColumns,
      columnWidths,
      availableCenterFlexWidth,
    );
    const effectiveColumnWidths = memoEffectiveWidths(centerFlexWidths, columnWidths);

    // ペインごとの「解決済み幅 join キー」。columnWidths の参照が変わっても、そのペインの幅が実際に変わらない
    //   限り同一文字列になるため、geometry のメモ依存として機能します(center は flex 解決済み幅で作る)。
    const leftPaneWidthsKey = buildPaneWidthsKey(paneSourceColumns.left, columnWidths);
    const centerPaneWidthsKey = buildPaneWidthsKey(paneSourceColumns.center, effectiveColumnWidths);
    const rightPaneWidthsKey = buildPaneWidthsKey(paneSourceColumns.right, columnWidths);
    const paneLayout = memoLayout(
      memoLeftGeometry(paneSourceColumns.left, leftPaneWidthsKey),
      memoCenterGeometry(paneSourceColumns.center, centerPaneWidthsKey),
      memoRightGeometry(paneSourceColumns.right, rightPaneWidthsKey),
    );

    const hasLeftPane = paneLayout.left.entries.length > 0;
    const hasRightPane = paneLayout.right.entries.length > 0;
    const centerOwnsRowHeader = !hasLeftPane;
    const leftLeadingWidth = rowHeaderWidth;
    const centerLeadingWidth = centerOwnsRowHeader ? rowHeaderWidth : 0;
    const rightLeadingWidth = 0;
    const leftPaneTotalWidth = hasLeftPane ? leftLeadingWidth + paneLayout.left.totalWidth : 0;
    const rightPaneTotalWidth = paneLayout.right.totalWidth;
    const centerContentWidth = centerLeadingWidth + paneLayout.center.totalWidth;
    const totalScrollWidth = leftPaneTotalWidth + centerContentWidth + rightPaneTotalWidth;

    return {
      paneSourceColumns,
      hasFlexColumn,
      effectiveColumnWidths,
      paneLayout,
      hasLeftPane,
      hasRightPane,
      centerOwnsRowHeader,
      leftLeadingWidth,
      centerLeadingWidth,
      rightLeadingWidth,
      leftPaneTotalWidth,
      rightPaneTotalWidth,
      centerContentWidth,
      totalScrollWidth,
    };
  };
};