// 追加(差し込み式 段階 2): React 版の機能セットの型です。エンジン(core)の機能セット(GridCoreFeatures)を広げ、
//   シェルが描画に使う部品(コンポーネント / 純関数 / hook)を足します。各機能の値は features/<機能名>.ts にあり、
//   全部入りの表は features/full.ts です。
//   - ReactGridFeatures は利用側が渡す形(どの機能も省略できる)、GridShellFeatures はシェルが受け取る形です。
//     hook の部品はシェルが機能を移す前と同じ位置で必ず呼ぶため、無い機能には代役を入れて渡します(features/resolve.ts)。
//     機能セットはモジュールの読み込み時に決まって描画中は変わらないため、本物と代役が入れ替わることはありません。
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import type { GridCoreFeatures } from '@ishibashi0112/spreadsheet-grid-core/engine/features';
import type { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/logic/find';
import type { resolveScrollHintOptions } from '@ishibashi0112/spreadsheet-grid-core/logic/scrollHint';
import type {
  resolveChipSpec,
  resolveColorScaleBackground,
  resolveDataBar,
} from '@ishibashi0112/spreadsheet-grid-core/logic/conditionalFormat';
import type {
  formatTotalRowCellText,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
} from '@ishibashi0112/spreadsheet-grid-core/logic/totalRow';
import type { FillHandleControllerArgs } from '@ishibashi0112/spreadsheet-grid-core/controllers/fillHandleController';
import type { ColumnHeaderDragController } from '@ishibashi0112/spreadsheet-grid-core/controllers/columnHeaderDragController';
import type { ColumnAutosizeRunnerArgs } from '@ishibashi0112/spreadsheet-grid-core/controllers/columnAutosizeRunner';
import type { DateRolloverStore } from '@ishibashi0112/spreadsheet-grid-core/controllers/dateRolloverStore';
import type { RowOrder } from '@ishibashi0112/spreadsheet-grid-core/logic/filtering';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/model/gridActions';
import type { ColumnPane, GridPaneLayout } from '@ishibashi0112/spreadsheet-grid-core/logic/geometry';
import type { DetailRowExtra, RowMetrics } from '@ishibashi0112/spreadsheet-grid-core/logic/verticalGeometry';
import type {
  CellCoord,
  ColumnFilterValue,
  GridColumn,
  GridContextMenuItem,
  GridContextMenuParams,
  GridResolvedSlots,
  GridSelection,
  GridSelectionAggregates,
  GridUiState,
  GlobalFilterStatus,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import type { GridFindBar } from '../view/GridFindBar';
import type { GridScrollHint } from '../view/GridScrollHint';
import type { GridTotalRow } from '../view/GridTotalRow';
import type { GridChip } from '../view/GridChip';
import type { CopyRangeOverlay } from '../CopyRangeOverlay';
import type { ColumnHoverOverlay } from '../ColumnHoverOverlay';
import type { GridSelectionAggregates as GridSelectionAggregatesView } from '../view/GridSelectionAggregates';
import type { UseSelectionAggregatesArgs } from '../hooks/useSelectionAggregates';
import type { UseColumnHeaderDragControllerArgs } from '../hooks/useColumnHeaderDragController';
import type { UseRowDragControllerArgs } from '../hooks/useRowDragController';
import type { UseColumnMenuControllerArgs, UseColumnMenuControllerResult } from '../hooks/useColumnMenuController';
import type { ColumnMenuPopover } from '../view/ColumnMenuPopover';
import type { GridFilterChipBar } from '../view/GridFilterChipBar';
import type { FilterManagementAddableColumn, FilterManagementEntry } from '../view/FilterManagementPanel';
import type { UseToolPanelControllerArgs, UseToolPanelControllerResult } from '../hooks/useToolPanelController';
import type { FilterPopoverViews, ToolPanelViews, UseLazyModuleOptions } from '../view/lazyPopups';
import type { useFilterPopoverController } from '../hooks/useFilterPopoverController';
import type { UseServerSideRowModelParams, UseServerSideRowModelResult } from '../hooks/useServerSideRowModel';

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

// フィルター(filtering)の行の絞り込みの hook が受け取るシェルの値と返す値です。
export type FilterOrderFeatureArgs<T> = {
  rows: T[];
  // 恒等 order(ラベル行があればラベル行を除いたもの)。
  baseOrder: RowOrder;
  // グローバルフィルターの対象列(表示列)/ 相対日付プリセットの範囲の解決に使う列(非表示列を含む)。
  visibleColumns: GridColumn<T>[];
  effectiveColumns: GridColumn<T>[];
  globalFilterText: string;
  globalFilterEnabled: boolean;
  columnFilterEnabled: boolean;
  columnFilters: Record<string, ColumnFilterValue>;
  deferredColumnFilters: Record<string, ColumnFilterValue>;
  manualFiltering: boolean;
  isServerSide: boolean;
  // エンジンの日付の変わり目の見張り(engine.dateRollover)。
  dateRollover: DateRolloverStore;
};
export type FilterOrderFeatureResult = {
  // グローバルフィルター済み order(列フィルターとソートは行パイプラインが掛ける)。
  globalFilteredOrder: RowOrder;
  globalFilterStatus: GlobalFilterStatus;
  globalFilterProgress: number;
  // 相対日付プリセットの範囲のキー(行パイプライン / serverSide の queryKey の入力。無ければ '')。
  relativeDateKey: string;
};

// 列フィルターのポップオーバー(filtering)の controller の接続が受け取るシェルの値と返す値です(返す値は controller の
//   hook の戻り値そのまま)。
export type FilterPopoverFeatureArgs<T> = {
  visibleColumns: GridColumn<T>[];
  columnFilters: Record<string, ColumnFilterValue>;
  columnFilterEnabled: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
  isServerSide: boolean;
  rows: T[];
};
export type FilterPopoverFeatureResult<T> = ReturnType<typeof useFilterPopoverController<T>>;
// ポップオーバーの中身(候補の収集・派生値・コマンド群・描画)の hook が受け取るシェルの値です。
export type FilterPopoverContentFeatureArgs<T> = {
  filterPopover: FilterPopoverFeatureResult<T>;
  // ポップオーバーの部品(読み込み前は null = 描画しない)。
  views: FilterPopoverViews | null;
  rows: T[];
  columnFilters: Record<string, ColumnFilterValue>;
  globalFilterText: string;
  getFilterOptions: SpreadsheetGridProps<T>['getFilterOptions'];
  isServerSide: boolean;
  dispatch: (action: GridUiAction) => void;
  renderFilterDateInput: SpreadsheetGridProps<T>['renderFilterDateInput'];
  popoverSlot: GridResolvedSlots['popover'];
  portalClassName: string | undefined;
};

// 適用中フィルターの一覧 / 候補列 / ジャンプ(filtering)の hook が受け取るシェルの値と返す値です。
export type FilterManagementFeatureArgs<T> = {
  columns: GridColumn<T>[];
  orderedColumns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  columnFilters: Record<string, ColumnFilterValue>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  gridRootRef: RefObject<HTMLDivElement | null>;
  paneLayout: GridPaneLayout<T>;
  leftPaneTotalWidth: number;
  centerLeadingWidth: number;
  rightPaneTotalWidth: number;
  openColumnFilterPopover: (column: GridColumn<T>) => void;
};
export type FilterManagementFeatureResult = {
  filterManagerEntries: FilterManagementEntry[];
  filterManagerAddableColumns: FilterManagementAddableColumn[];
  // 対象列まで横スクロールしてからフィルターのポップオーバーを開く(パネルの ✎ / フィルターを追加 / チップ)。
  jumpToColumnFilter: (columnKey: string) => void;
};

// サーバーサイド行モデル(serverSide)の hook が受け取る値(行モデルの controller の引数そのまま)と返す値です。
export type ServerSideFeatureArgs<T> = UseServerSideRowModelParams<T>;
export type ServerSideFeatureResult<T> = UseServerSideRowModelResult<T> & {
  // 内蔵エラーバー(取得失敗の再試行 / 保存失敗)。出すものが無ければ何も描かない。
  renderErrorBars: (errorBarSlot: GridResolvedSlots['errorBar']) => ReactNode;
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

// 列メニュー(columnMenu)の hook が受け取る値(controller の引数そのまま)と返す値です。available は機能セットに
//   あるかどうか(代役は false。シェルは enableColumnMenu && available で ⋮ ボタンとヘッダーの右クリックを出す)。
export type ColumnMenuFeatureArgs<T> = UseColumnMenuControllerArgs<T>;
export type ColumnMenuFeatureResult<T> = UseColumnMenuControllerResult<T> & { available: boolean };
// ツールパネル(toolPanel)の hook が受け取る値と返す値です。available は機能セットにあるかどうか(代役は false。
//   シェルはツールパネルを開く入口 = 列メニューの 3 項目 / 既定の上部バーの Filters チップを出さない)。
export type ToolPanelFeatureArgs = UseToolPanelControllerArgs;
export type ToolPanelFeatureResult = UseToolPanelControllerResult & { available: boolean };
// セル / 行のコンテキストメニュー(contextMenu)の hook が受け取る値と返す値、右クリックの対象の解決に渡す値です。
export type CellContextMenuFeatureArgs = {
  gridRootRef: RefObject<HTMLDivElement | null>;
};
export type CellContextMenuFeatureResult<T> = {
  isContextMenuOpen: boolean;
  openContextMenu: (params: GridContextMenuParams<T>, items: GridContextMenuItem[]) => void;
  // ルートの末尾に置く popover(閉じているときは何も描かない)。
  renderContextMenuPopover: (slots: GridResolvedSlots, themeClassName: string | undefined) => ReactNode;
};
export type BodyContextMenuInput<T> = {
  event: ReactMouseEvent<HTMLDivElement>;
  rowModel: RowModel<T>;
  orderedColumns: GridColumn<T>[];
  selection: GridSelection;
  activeCell: CellCoord | null;
};

// 条件付き書式のうち本体の行(GridBodyLayer)が使う部品(データバーの幾何 / カラースケールの背景色)。
export type ConditionalFormatCellResolvers = {
  resolveDataBar: typeof resolveDataBar;
  resolveColorScaleBackground: typeof resolveColorScaleBackground;
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
  // IME オンのままの直接入力(G-2): core の部品そのまま(入力受けのコントローラ + 判定 / 初期値の関数)。
  imeDirectInput?: NonNullable<GridCoreFeatures['imeDirectInput']>;
  // エクスポート(命令的 API の exportCsv / downloadCsv / getExportData)。描画の部品は無い。
  export?: NonNullable<GridCoreFeatures['export']>;
  // フィルター(グローバル / 列): 列フィルターの段と日付の変わり目の見張り(core)+ グローバルフィルターの適用と
  //   相対日付プリセットの基準日の hook / 列フィルターのポップオーバー(controller の接続・部品の遅延読み込み・中身)/
  //   適用中フィルターの一覧とジャンプ / チップバーの部品。
  filtering?: NonNullable<GridCoreFeatures['filtering']> & {
    useFilterOrder: <T>(args: FilterOrderFeatureArgs<T>) => FilterOrderFeatureResult;
    useFilterPopover: <T>(args: FilterPopoverFeatureArgs<T>) => FilterPopoverFeatureResult<T>;
    useFilterPopoverViews: (options: UseLazyModuleOptions) => FilterPopoverViews | null;
    useFilterPopoverContent: <T>(args: FilterPopoverContentFeatureArgs<T>) => ReactNode;
    useFilterManagement: <T>(args: FilterManagementFeatureArgs<T>) => FilterManagementFeatureResult;
    FilterChipBar: typeof GridFilterChipBar;
  };
  // サーバーサイド行モデル(SSRM): 保存状態の表示(core)+ 行モデルの接続と内蔵エラーバーの hook。
  serverSide?: NonNullable<GridCoreFeatures['serverSide']> & {
    useServerSide: <T>(args: ServerSideFeatureArgs<T>) => ServerSideFeatureResult<T>;
  };
  // 行の高さの実測(autoHeight): 実測のコントローラ + 行高ストア(core)。描画の部品は無い。
  autoHeight?: NonNullable<GridCoreFeatures['autoHeight']>;
  // 列幅の自動調整(DS-4 / 13-B1): 計測の時間分割ランナー。
  columnAutosize?: {
    useColumnAutosize: <T>(args: ColumnAutosizeFeatureArgs<T>) => ColumnAutosizeFeatureResult<T>;
  };
  // 合計行(合計行 3A): 集計のリゾルバ(core)+ 描画部品 + 表示の純関数。
  totalRow?: NonNullable<GridCoreFeatures['totalRow']> & {
    TotalRow: typeof GridTotalRow;
    formatTotalRowCellText: typeof formatTotalRowCellText;
    resolveTotalRowCaption: typeof resolveTotalRowCaption;
    resolveTotalRowLabelColumnKey: typeof resolveTotalRowLabelColumnKey;
  };
  // 条件付き書式(F-3): min / max の集計(core)+ データバー / カラースケール(本体の行)+ 状態チップ(セル内容)。
  conditionalFormat?: NonNullable<GridCoreFeatures['conditionalFormat']> & ConditionalFormatCellResolvers & {
    resolveChipSpec: typeof resolveChipSpec;
    GridChip: typeof GridChip;
  };
  // 選択範囲の集計(showSelectionAggregates): 集計の hook(大きな選択は時間分割)+ 既定の下部バーの表示部品。
  selectionAggregates?: {
    useSelectionAggregates: <T>(args: UseSelectionAggregatesArgs<T>) => GridSelectionAggregates | null;
    SelectionAggregates: typeof GridSelectionAggregatesView;
  };
  // 動きの追加分(M-2 / M-3 / M-6): 変更セルの強調(core)+ コピー範囲の点線 + クロスヘアの列の帯。
  motionExtras?: NonNullable<GridCoreFeatures['motionExtras']> & {
    CopyRangeOverlay: typeof CopyRangeOverlay;
    ColumnHoverOverlay: typeof ColumnHoverOverlay;
  };
  // 列メニュー(13-A): ⋮ ボタン / ヘッダーの右クリックで開く popover の controller の接続 + popover。
  columnMenu?: {
    useColumnMenu: <T>(args: ColumnMenuFeatureArgs<T>) => ColumnMenuFeatureResult<T>;
    ColumnMenuPopover: typeof ColumnMenuPopover;
  };
  // ツールパネル(UP-1): controller の接続 + 部品(別チャンク)の遅延読み込み。シェルはそれぞれ元の位置で呼ぶ
  //   (useToolPanelViews は列フィルターの部品の読み込みの直後)。
  toolPanel?: {
    useToolPanel: (args: ToolPanelFeatureArgs) => ToolPanelFeatureResult;
    useToolPanelViews: (options: UseLazyModuleOptions) => ToolPanelViews | null;
  };
  // セル / 行のコンテキストメニュー(バッチ②): controller の接続 + popover、右クリックの対象の解決。
  contextMenu?: {
    useCellContextMenu: <T>(args: CellContextMenuFeatureArgs) => CellContextMenuFeatureResult<T>;
    buildBodyContextMenuParams: <T>(input: BodyContextMenuInput<T>) => GridContextMenuParams<T> | null;
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
type HookFeatureName =
  | 'fillHandle'
  | 'columnReorder'
  | 'rowDrag'
  | 'columnAutosize'
  | 'contextMenu'
  | 'selectionAggregates'
  | 'columnMenu'
  | 'toolPanel'
  | 'filtering'
  | 'serverSide';
export type GridShellFeatures = Omit<ReactGridFeatures, HookFeatureName> &
  Required<Pick<ReactGridFeatures, HookFeatureName>>;