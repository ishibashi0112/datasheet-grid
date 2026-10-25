// 追加(差し込み式 段階 2): 利用側が渡した機能セット(一部だけでもよい)を、シェルが受け取る形(GridShellFeatures)へ
//   そろえます。hook の部品が無い機能には何もしない / 何も描かない代役を入れます(シェルは hook を同じ位置で必ず呼ぶ)。
//   代役は機能のモジュールを import しない(型だけ)ので、機能を外した構成に機能の本体を持ち込みません。全部入りの入口は
//   全機能がそろった表を直接渡すため、このモジュール(React 側の代役と警告)は全部入りの JS に入りません。
//   ※ エンジン側の代役(core engine/features.ts の createInert*)は createGridEngine / gridApi が直接参照するため
//   全部入りにも入ります(どれも数行)。
import {
  createInertDateRolloverStore,
  createInertExportCommands,
  createInertSaveStatusController,
} from '@ishibashi0112/spreadsheet-grid-core/engine/features';
import { warnUnregisteredFeatureMethod } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import type { FillHandleFeatureResult, GridShellFeatures, ReactGridFeatures, ServerSideFeatureResult } from './types';

const INERT_FILL_HANDLE: FillHandleFeatureResult = {
  filling: false,
  renderLayer: () => null,
  renderPortals: () => null,
};

const inertFillHandleFeature: GridShellFeatures['fillHandle'] = {
  useFillHandle: () => INERT_FILL_HANDLE,
};

const INERT_COLUMN_REORDER = {
  onColumnDragHandlePointerDown: undefined,
  renderDropIndicator: () => null,
};

const inertColumnReorderFeature: GridShellFeatures['columnReorder'] = {
  useColumnReorder: () => INERT_COLUMN_REORDER,
};

// 行ドラッグが無い構成では enableRowDrag を false として扱う(createSpreadsheetGrid)ので、ハンドル列もガイド線も
//   出ません(代役の描画は呼ばれない)。
const INERT_ROW_DRAG = {
  renderHandleCell: () => null,
  renderDropIndicator: () => null,
};

const inertRowDragFeature: GridShellFeatures['rowDrag'] = {
  useRowDrag: () => INERT_ROW_DRAG,
};

// 列幅の自動調整が無い構成では autoSizeColumns を false として扱う(createSpreadsheetGrid)ので、runAutosize は
//   呼ばれません(念のため何もせず解決する Promise を返す)。
const INERT_COLUMN_AUTOSIZE = {
  available: false,
  isAutosizing: false,
  runAutosize: () => Promise.resolve(),
};

const inertColumnAutosizeFeature: GridShellFeatures['columnAutosize'] = {
  useColumnAutosize: () => INERT_COLUMN_AUTOSIZE,
};

// コンテキストメニューが無い構成では enableContextMenu を false として扱う(createSpreadsheetGrid)ので、右クリックは
//   ブラウザ標準のメニューのままです(対象の解決も呼ばれない。念のため null = 開かない)。
const INERT_CONTEXT_MENU = {
  isContextMenuOpen: false,
  openContextMenu: () => {},
  renderContextMenuPopover: () => null,
};

const inertContextMenuFeature: GridShellFeatures['contextMenu'] = {
  useCellContextMenu: () => INERT_CONTEXT_MENU,
  buildBodyContextMenuParams: () => null,
};

// 列メニューが無い構成では閉じたままで(available: false)、シェルは ⋮ ボタンもヘッダーの右クリックも出しません
//   (開く関数は呼ばれない。popover の ref はどこにも付かない)。
const INERT_COLUMN_MENU = {
  available: false,
  columnMenuLayout: null,
  columnMenuRef: { current: null },
  isColumnMenuOpen: false,
  openedMenuColumnKey: null,
  openedMenuColumn: null,
  openColumnMenuFromButton: () => {},
  openColumnMenuFromButtonClick: () => {},
  openColumnMenuFromContextMenu: () => {},
  closeColumnMenu: () => {},
};

const inertColumnMenuFeature: GridShellFeatures['columnMenu'] = {
  useColumnMenu: () => INERT_COLUMN_MENU,
  ColumnMenuPopover: () => null,
};

// ツールパネルが無い構成では閉じたままで(available: false)、部品も読み込みません。シェルはパネルを開く入口を出さない
//   ので、開く関数を呼ぶのはハンドルの openFilterManager だけです(呼ばれたら開発時に 1 回だけ警告する)。
const INERT_TOOL_PANEL = {
  available: false,
  activeToolPanelTab: null,
  availableToolPanelTabs: [],
  toolPanelLayout: null,
  toolPanelFlashTick: 0,
  toolPanelRef: { current: null },
  openToolPanel: () => {
    warnUnregisteredFeatureMethod('openFilterManager');
  },
  closeToolPanel: () => {},
  moveToolPanel: () => {},
};

const inertToolPanelFeature: GridShellFeatures['toolPanel'] = {
  useToolPanel: () => INERT_TOOL_PANEL,
  useToolPanelViews: () => null,
};

// 選択範囲の集計が無い構成では集計せず(null)、既定の下部バーにも何も出しません。
const inertSelectionAggregatesFeature: GridShellFeatures['selectionAggregates'] = {
  useSelectionAggregates: () => null,
  SelectionAggregates: () => null,
};

// 列フィルターのポップオーバーは閉じたまま(シェルは列フィルターを切るので開く入口を出さない。開く関数は何もしない)。
//   ref はツールパネルの「外側クリックで閉じない範囲」に渡るだけで、どこにも付きません。
const noop = () => {};
const INERT_FILTER_POPOVER = {
  filterPopoverState: null,
  filterPopoverLayout: null,
  filterPopoverRef: { current: null },
  filterTextInputRef: { current: null },
  filterSelectRef: { current: null },
  isFilterPopoverOpen: false,
  openedFilterColumn: null,
  openedFilterType: null,
  openColumnFilterPopover: noop,
  closeColumnFilterPopover: noop,
  updateFilterPopoverDraft: noop,
  updateFilterPopoverNumberDraft: noop,
  updateFilterPopoverTextDraft: noop,
  updateFilterPopoverDateDraft: noop,
};

// 適用中フィルターの一覧は空(列フィルターを切るのでツールパネルのフィルタータブもチップバーも出ない)。
const INERT_FILTER_MANAGEMENT = {
  filterManagerEntries: [],
  filterManagerAddableColumns: [],
  jumpToColumnFilter: noop,
};

// フィルターが無い構成では enableColumnFilter / enableGlobalFilter を false として扱う(createSpreadsheetGrid)ので、
//   行は絞り込みません(グローバルフィルターは掛けず恒等 order のまま、列フィルターの段は行パイプラインが通さない)。
const inertFilteringFeature: GridShellFeatures['filtering'] = {
  createColumnFilterStage: () => (_rows, globalFilteredOrder) => globalFilteredOrder,
  createDateRolloverStore: createInertDateRolloverStore,
  useFilterOrder: (args) => ({
    globalFilteredOrder: args.baseOrder,
    globalFilterStatus: 'idle',
    globalFilterProgress: 1,
    relativeDateKey: '',
  }),
  useFilterPopover: () => INERT_FILTER_POPOVER,
  useFilterPopoverViews: () => null,
  useFilterPopoverContent: () => null,
  useFilterManagement: () => INERT_FILTER_MANAGEMENT,
  FilterChipBar: () => null,
};

// サーバーサイド行モデルが無い構成では dataSource を外す(createSpreadsheetGrid)ので clientSide のままです。代役は件数 0 の
//   行モデル(シェルは clientSide の行モデルを使うので参照されない)と、何もしない操作 / 何も描かないエラーバー。
const INERT_SERVER_SIDE: ServerSideFeatureResult<unknown> = {
  rowModel: {
    getRowCount: () => 0,
    getRow: () => undefined,
    getSourceIndex: () => -1,
    getRowKey: () => -1,
  },
  rowCount: 0,
  isRowLoaded: () => false,
  requestRange: noop,
  refresh: noop,
  loadError: null,
  retryFailedBlocks: noop,
  canUpdateRows: false,
  applyCellEdits: () => 0,
  writeError: null,
  renderErrorBars: () => null,
};

const inertServerSideFeature: GridShellFeatures['serverSide'] = {
  createSaveStatusController: createInertSaveStatusController,
  useServerSide: <T,>() => INERT_SERVER_SIDE as ServerSideFeatureResult<T>,
};

// エクスポートが無い構成: 何も出力しない代役(エンジンの代役と同じ)に、呼ばれたら開発時に 1 回だけ警告するのを足します
//   (prop ではなくメソッドなので、呼ばれた時点で知らせる)。
const inertExportFeature: NonNullable<ReactGridFeatures['export']> = {
  createExportCommands: <T,>() => {
    const inert = createInertExportCommands<T>();
    return {
      exportCsv: (options) => {
        warnUnregisteredFeatureMethod('exportCsv');
        return inert.exportCsv(options);
      },
      downloadCsv: (filename, options) => {
        warnUnregisteredFeatureMethod('downloadCsv');
        inert.downloadCsv(filename, options);
      },
      getExportData: (options) => {
        warnUnregisteredFeatureMethod('getExportData');
        return inert.getExportData(options);
      },
    };
  },
};

export const resolveGridShellFeatures = (features: ReactGridFeatures): GridShellFeatures => ({
  ...features,
  fillHandle: features.fillHandle ?? inertFillHandleFeature,
  columnReorder: features.columnReorder ?? inertColumnReorderFeature,
  rowDrag: features.rowDrag ?? inertRowDragFeature,
  columnAutosize: features.columnAutosize ?? inertColumnAutosizeFeature,
  contextMenu: features.contextMenu ?? inertContextMenuFeature,
  selectionAggregates: features.selectionAggregates ?? inertSelectionAggregatesFeature,
  columnMenu: features.columnMenu ?? inertColumnMenuFeature,
  toolPanel: features.toolPanel ?? inertToolPanelFeature,
  filtering: features.filtering ?? inertFilteringFeature,
  serverSide: features.serverSide ?? inertServerSideFeature,
  export: features.export ?? inertExportFeature,
});