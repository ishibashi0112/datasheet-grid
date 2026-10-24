// 追加(差し込み式 段階 2): React 版の機能セットの型です。エンジン(core)の機能セット(GridCoreFeatures)を広げ、
//   シェルが描画に使う部品(コンポーネント / 純関数 / hook)を足します。各機能の値は features/<機能名>.ts にあり、
//   全部入りの表は features/full.ts です。
//   - ReactGridFeatures は利用側が渡す形(どの機能も省略できる)、GridShellFeatures はシェルが受け取る形です。
//     hook の部品はシェルが機能を移す前と同じ位置で必ず呼ぶため、無い機能には代役を入れて渡します(features/resolve.ts)。
//     機能セットはモジュールの読み込み時に決まって描画中は変わらないため、本物と代役が入れ替わることはありません。
import type { CSSProperties, ReactNode } from 'react';
import type { GridCoreFeatures } from '@ishibashi0112/spreadsheet-grid-core/engine/features';
import type { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/logic/find';
import type { resolveScrollHintOptions } from '@ishibashi0112/spreadsheet-grid-core/logic/scrollHint';
import type { FillHandleControllerArgs } from '@ishibashi0112/spreadsheet-grid-core/controllers/fillHandleController';
import type { ColumnHeaderDragController } from '@ishibashi0112/spreadsheet-grid-core/controllers/columnHeaderDragController';
import type { ColumnAutosizeRunnerArgs } from '@ishibashi0112/spreadsheet-grid-core/controllers/columnAutosizeRunner';
import type { ColumnPane, GridPaneLayout } from '@ishibashi0112/spreadsheet-grid-core/logic/geometry';
import type { DetailRowExtra, RowMetrics } from '@ishibashi0112/spreadsheet-grid-core/logic/verticalGeometry';
import type { GridColumn, GridUiState, RowModel, SpreadsheetGridProps } from '../model/gridTypes';
import type { GridFindBar } from '../view/GridFindBar';
import type { GridScrollHint } from '../view/GridScrollHint';
import type { UseColumnHeaderDragControllerArgs } from '../hooks/useColumnHeaderDragController';
import type { UseRowDragControllerArgs } from '../hooks/useRowDragController';

// フィルハンドル(fillHandle)の hook が受け取るシェルの値です(シェルにあったときの自由変数そのまま)。
export type FillHandleFeatureArgs<T> = {
  fillHandle: SpreadsheetGridProps<T>['fillHandle'];
  readOnly: boolean;
  isServerSide: boolean;
  rows: FillHandleControllerArgs<T>['rows'];
  rowModel: RowModel<T>;
  orderedColumns: GridColumn<T>[];
  uiState: GridUiState;
  serverSideQueryKey: string;
  serverSideRefreshToken: number | undefined;
  canEditCell: FillHandleControllerArgs<T>['canEditCell'];
  dispatch: FillHandleControllerArgs<T>['dispatch'];
  getCellCoordFromClientPoint: FillHandleControllerArgs<T>['hitTest'];
  scrollContainerRef: FillHandleControllerArgs<T>['scrollContainerRef'];
  gridRootRef: FillHandleControllerArgs<T>['gridRootRef'];
  footerHeight: number;
  handleRowsChange: FillHandleControllerArgs<T>['applyRowsChange'];
  amendRowsChange: FillHandleControllerArgs<T>['amendRowsChange'];
  applyServerSideCellEdits: FillHandleControllerArgs<T>['applyServerSideCellEdits'];
  viewRowCount: number;
  paneLayout: GridPaneLayout<T>;
  rowMetrics: RowMetrics;
  windowFirstRow: number;
  windowLastRow: number;
  detailActive: boolean;
  detailExtras: readonly DetailRowExtra[];
  viewportHeight: number;
  scrollTop: number;
  headerHeight: number;
  overlayBaseOffset: number;
  // ポータル(メニュー / ツールチップ)へ渡すテーマ / モーションのクラス。
  portalClassName: string | undefined;
};

export type FillHandleFeatureResult = {
  // ドラッグ中か(ルートの .ssg-root--filling)。
  filling: boolean;
  // 各ペインの overlay 層に置く、ハンドル / 点線 / 埋めたあとのボタン。
  renderLayer: (pane: ColumnPane, leadingWidth: number) => ReactNode;
  // ルートの末尾に置く、埋めたあとのメニュー / ドラッグ中の値のツールチップ(ポータル)。
  renderPortals: () => ReactNode;
};

// 列ヘッダーのドラッグによる並べ替え(columnReorder)の hook が受け取る値(コントローラの引数そのまま)と返す値です。
export type ColumnReorderFeatureArgs<T> = UseColumnHeaderDragControllerArgs<T>;
export type ColumnReorderFeatureResult<T> = {
  // 見出しの grip の pointerdown(無い構成では undefined = grip を出さない)。
  onColumnDragHandlePointerDown: ColumnHeaderDragController<T>['onColumnDragHandlePointerDown'] | undefined;
  // 各ペインのドロップの縦線(無い構成では描かない)。
  renderDropIndicator: (pane: ColumnPane, style: CSSProperties) => ReactNode;
};

// 行ドラッグによる並べ替え(rowDrag)の hook が受け取る値(コントローラの引数 + ラベル / ハンドルの描画に使う値)と
//   返す値です。
export type RowDragFeatureArgs<T> = Omit<UseRowDragControllerArgs, 'getRowDragLabel'> & {
  rowModel: RowModel<T>;
  visibleColumns: GridColumn<T>[];
  isRowDraggable: SpreadsheetGridProps<T>['isRowDraggable'];
};
export type RowDragFeatureResult<T> = {
  // 行ドラッグハンドル列(合成列)のセルの中身。
  renderHandleCell: (row: T, rowIndex: number) => ReactNode;
  // 各ペインの行ドロップ位置のガイド線。
  renderDropIndicator: (pane: ColumnPane, className: string) => ReactNode;
};

// 列幅の自動調整(columnAutosize)の hook が受け取る値(ランナーの引数そのまま)と返す値です。
export type ColumnAutosizeFeatureArgs<T> = ColumnAutosizeRunnerArgs<T>;
export type ColumnAutosizeFeatureResult<T> = {
  // 機能があるか(無い構成では列メニューの項目を出さない / 境界のダブルクリックは通常のリサイズ)。
  available: boolean;
  // 計測中か(Pending の overlay とカーソル)。
  isAutosizing: boolean;
  runAutosize: (columns: GridColumn<T>[]) => Promise<void>;
};

export type ReactGridFeatures = {
  // セル内検索(F-2): 走査のコントローラ(core)+ 検索バー + セル文字列のヒット分割。
  find?: NonNullable<GridCoreFeatures['find']> & {
    FindBar: typeof GridFindBar;
    splitTextByFindRanges: typeof splitTextByFindRanges;
  };
  // フィルハンドル(フィルハンドル 1A): コントローラの接続から描画までを 1 つの hook で。
  fillHandle?: {
    useFillHandle: <T>(args: FillHandleFeatureArgs<T>) => FillHandleFeatureResult;
  };
  // 列ヘッダーのドラッグによる列の並べ替え(13-B3 / M-12): grip / ドロップの縦線 / live 方式。
  columnReorder?: {
    useColumnReorder: <T>(args: ColumnReorderFeatureArgs<T>) => ColumnReorderFeatureResult<T>;
  };
  // 列幅の自動調整(DS-4 / 13-B1): 計測の時間分割ランナー。
  columnAutosize?: {
    useColumnAutosize: <T>(args: ColumnAutosizeFeatureArgs<T>) => ColumnAutosizeFeatureResult<T>;
  };
  // スクロール位置インジケーター(scrollHint): オプションの解決 + 描画部品。
  scrollHint?: {
    resolveScrollHintOptions: typeof resolveScrollHintOptions;
    ScrollHint: typeof GridScrollHint;
  };
  // 行ドラッグによる行の並べ替え(row-drag / M-11): ハンドル列のセル / ガイド線 / live 方式。
  rowDrag?: {
    useRowDrag: <T>(args: RowDragFeatureArgs<T>) => RowDragFeatureResult<T>;
  };
};

// シェルが受け取る機能セット: hook の部品を持つ機能は必ずある(無い機能は代役)。それ以外の機能は省略のまま
//   (シェルが ?. で見て、無ければ何もしない)。
type HookFeatureName = 'fillHandle' | 'columnReorder' | 'rowDrag' | 'columnAutosize';
export type GridShellFeatures = Omit<ReactGridFeatures, HookFeatureName> &
  Required<Pick<ReactGridFeatures, HookFeatureName>>;