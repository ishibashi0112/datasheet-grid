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
import type { GridCoreFeatures } from './features';

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
  // 追加(1.0 前の最終チェック FC-08): 列フィルター / ソートを評価する列。グルーピング中は表示から外したグループ元列
  //   (rowGroup)も含めます(グループ元列のソートでグループごと並び替わる、フィルターで絞れる = ドキュメントどおり)。
  //   グルーピング無効なら effectiveColumns と同一参照。
  filterSortColumns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  // pinned 属性に応じて視覚順序(left → center → right)に並べ替えた可視列。
  orderedColumns: GridColumn<T>[];
};

// 変更(差し込み式 段階 5): 機能セットに grouping が無ければ行グルーピングは常に無効(rowGroup 列もそのまま表示)。
export const createColumnResolver = <T,>(features: Pick<GridCoreFeatures, 'grouping'>) => {
  const groupingAvailable = features.grouping !== undefined;
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
      // 修正(audit B-07): 非表示の左固定列は数えません(合成列だけの左ペインができ、行ヘッダーも左へ移っていた)。
      //   グルーピング中のグループ元列(rowGroup)も表示から外れるため数えません。
      const hasLeftPinnedColumn = columns.some(
        (column) =>
          column.pinned === 'left' &&
          column.visible !== false &&
          !(rowGroupingActive && column.rowGroup === true),
      );
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
      // 変更(段階 2 DU-22): 左固定列があるときは自動グループ列も左ペインへ入れます(展開トグル列と同じ。横にスクロールしても
      //   どのグループの行かが見える。これまでは左固定列の裏へ流れていた)。
      const autoGroupColumn: GridColumn<T> = {
        key: GROUP_AUTO_COLUMN_KEY,
        title: groupColumns.map((column) => column.title || column.key).join(' › '),
        width: 240,
        minWidth: 120,
        readOnly: true,
        suppressAutoSize: true,
        pinned: hasLeftPinnedColumn ? 'left' : undefined,
      };
      const grouped = [autoGroupColumn, ...columns.filter((column) => column.rowGroup !== true)];
      return leadingColumns.length > 0 ? [...leadingColumns, ...grouped] : grouped;
    },
  );
  const memoFilterSort = createMemo(
    (rowGroupingActive: boolean, effectiveColumns: GridColumn<T>[], groupColumns: GridColumn<T>[]): GridColumn<T>[] =>
      rowGroupingActive ? [...effectiveColumns, ...groupColumns] : effectiveColumns,
  );
  const memoVisible = createMemo((effectiveColumns: GridColumn<T>[]) =>
    effectiveColumns.filter((column) => column.visible !== false),
  );
  const memoOrdered = createMemo((visibleColumns: GridColumn<T>[]) => reorderColumnsByPane(visibleColumns));

  return (inputs: ColumnResolutionInputs<T>): ColumnResolution<T> => {
    const { columns, isServerSide, enableRowDrag, hasRowsChange, detailToggleColumnActive, renderDetailToggleCell } =
      inputs;
    const { groupColumns, aggColumns } = memoGrouping(columns);
    const rowGroupingActive = groupingAvailable && !isServerSide && groupColumns.length > 0;
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
    const filterSortColumns = memoFilterSort(rowGroupingActive, effectiveColumns, groupColumns);
    const visibleColumns = memoVisible(effectiveColumns);
    const orderedColumns = memoOrdered(visibleColumns);
    return {
      groupColumns,
      aggColumns,
      rowGroupingActive,
      rowDragAvailable,
      effectiveColumns,
      filterSortColumns,
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
  // 行ヘッダー(#・行番号)を中央ペインが持つか(段階 2 DU-22 から、行ヘッダーの幅が 0 のときだけ中央。それ以外は左ペイン)。
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

// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-23): 固定列が入りきらないときに、表示の上だけ固定を外します。
//   固定列(行番号の列を含む)の合計がグリッドより広いと、右の固定列が左の固定列に重なり、中央の列は横にスクロールしても
//   見えなかった(スマホの幅など)。中央に min(幅, max(120px, 幅の 1/4)) を残せるまで、右の固定列の内側(左端)から、次に
//   左の固定列の内側(右端)から順に中央へ回します。列の並び(orderedColumns の index)は変わりません(内側から外すので、
//   左の末尾が中央の先頭へ、右の先頭が中央の末尾へ移るだけ)。columns の pinned は変えず、幅が戻れば固定に戻ります。
//   行ドラッグの掴み手と展開行のトグルの列(幅の小さな合成列)は外しません。
export const MIN_CENTER_PANE_WIDTH = 120;
const MIN_CENTER_PANE_RATIO = 0.25;
const PIN_OVERFLOW_KEY_SEPARATOR = '\u0000';

export const resolvePinnedOverflowKey = <T,>(
  source: PaneSourceColumns<T>,
  columnWidths: Record<string, number>,
  viewportWidth: number,
  rowHeaderWidth: number,
): string => {
  if (viewportWidth <= 0 || (source.left.length === 0 && source.right.length === 0)) {
    return '';
  }
  const widthOf = ({ column }: PaneSourceColumn<T>) => columnWidths[column.key] ?? column.width;
  const budget = viewportWidth - Math.min(viewportWidth, Math.max(MIN_CENTER_PANE_WIDTH, viewportWidth * MIN_CENTER_PANE_RATIO));
  let total = rowHeaderWidth + sumResolvedWidths(source.left, columnWidths) + sumResolvedWidths(source.right, columnWidths);
  if (total <= budget) {
    return '';
  }
  const demoted: string[] = [];
  for (const item of source.right) {
    if (total <= budget) {
      break;
    }
    demoted.push(item.column.key);
    total -= widthOf(item);
  }
  for (let index = source.left.length - 1; index >= 0 && total > budget; index -= 1) {
    const item = source.left[index];
    if (item.column.key === ROW_DRAG_HANDLE_COLUMN_KEY || item.column.key === DETAIL_TOGGLE_COLUMN_KEY) {
      break;
    }
    demoted.push(item.column.key);
    total -= widthOf(item);
  }
  return demoted.join(PIN_OVERFLOW_KEY_SEPARATOR);
};

const applyPinnedOverflow = <T,>(source: PaneSourceColumns<T>, overflowKey: string): PaneSourceColumns<T> => {
  if (overflowKey === '') {
    return source;
  }
  const demoted = new Set(overflowKey.split(PIN_OVERFLOW_KEY_SEPARATOR));
  const unpin = ({ column, logicalIndex }: PaneSourceColumn<T>): PaneSourceColumn<T> => ({
    column: { ...column, pinned: undefined },
    logicalIndex,
  });
  return {
    left: source.left.filter(({ column }) => !demoted.has(column.key)),
    center: [
      ...source.left.filter(({ column }) => demoted.has(column.key)).map(unpin),
      ...source.center,
      ...source.right.filter(({ column }) => demoted.has(column.key)).map(unpin),
    ],
    right: source.right.filter(({ column }) => !demoted.has(column.key)),
  };
};

export const createPaneLayoutResolver = <T,>() => {
  const memoSplit = createMemo((orderedColumns: GridColumn<T>[]) => splitOrderedColumnsByPane(orderedColumns));
  // 追加(1.0.1 / AP-23): 入りきらない固定列を中央へ回した列ソース(外す列が変わらない限り同じ参照)。
  const memoSource = createMemo(applyPinnedOverflow<T>);
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
    const splitColumns = memoSplit(orderedColumns);
    const paneSourceColumns = memoSource(
      splitColumns,
      resolvePinnedOverflowKey(splitColumns, columnWidths, viewportWidth, rowHeaderWidth),
    );

    // center 列の flex: 「利用可能幅 − 固定列合計」を比率配分します。左右ペインは pinned(= flex 非対象)なので
    //   center 列幅に依存せず先に確定でき、循環しません。
    const leftPaneFixedWidth = sumResolvedWidths(paneSourceColumns.left, columnWidths);
    const rightPaneFixedWidth = sumResolvedWidths(paneSourceColumns.right, columnWidths);
    // 変更(段階 2 DU-22): 行番号の列(行ヘッダー)は左固定列が無くても左ペインに置きます(横にスクロールしても流れない。
    //   Excel の行見出しと同じ)。幅 0 の行ヘッダー(rowHeaderWidth: 0)のときは従来どおり左ペインを作りません。
    const rowHeaderPinned = rowHeaderWidth > 0;
    const hasLeftPinned = paneSourceColumns.left.length > 0 || rowHeaderPinned;
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

    const hasLeftPane = paneLayout.left.entries.length > 0 || rowHeaderPinned;
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