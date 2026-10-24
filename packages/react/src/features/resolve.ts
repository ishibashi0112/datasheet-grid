// 追加(差し込み式 段階 2): 利用側が渡した機能セット(一部だけでもよい)を、シェルが受け取る形(GridShellFeatures)へ
//   そろえます。hook の部品が無い機能には何もしない / 何も描かない代役を入れます(シェルは hook を同じ位置で必ず呼ぶ)。
//   代役は機能のモジュールを import しない(型だけ)ので、機能を外した構成に機能の本体を持ち込みません。全部入りの入口は
//   全機能がそろった表を直接渡すため、このモジュール(代役)は全部入りの JS に入りません。
import { createInertExportCommands } from '@ishibashi0112/spreadsheet-grid-core/engine/features';
import { warnUnregisteredFeatureMethod } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import type { FillHandleFeatureResult, GridShellFeatures, ReactGridFeatures } from './types';

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

// 選択範囲の集計が無い構成では集計せず(null)、既定の下部バーにも何も出しません。
const inertSelectionAggregatesFeature: GridShellFeatures['selectionAggregates'] = {
  useSelectionAggregates: () => null,
  SelectionAggregates: () => null,
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
  export: features.export ?? inertExportFeature,
});