// 追加(差し込み式 段階 2): 利用側が渡した機能セット(一部だけでもよい)を、シェルが受け取る形(GridShellFeatures)へ
//   そろえます。hook の部品が無い機能には何もしない / 何も描かない代役を入れます(シェルは hook を同じ位置で必ず呼ぶ)。
//   代役は機能のモジュールを import しない(型だけ)ので、機能を外した構成に機能の本体を持ち込みません。全部入りの入口は
//   全機能がそろった表を直接渡すため、このモジュール(代役)は全部入りの JS に入りません。
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

export const resolveGridShellFeatures = (features: ReactGridFeatures): GridShellFeatures => ({
  ...features,
  fillHandle: features.fillHandle ?? inertFillHandleFeature,
  columnReorder: features.columnReorder ?? inertColumnReorderFeature,
  rowDrag: features.rowDrag ?? inertRowDragFeature,
  columnAutosize: features.columnAutosize ?? inertColumnAutosizeFeature,
});