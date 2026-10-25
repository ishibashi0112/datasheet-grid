// 追加(差し込み式 段階 2): 全部入りの機能セットです(公開コンポーネント SpreadsheetGrid が使う)。
//   Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
import { autoHeightFeature } from './autoHeight';
import { columnAutosizeFeature } from './columnAutosize';
import { columnMenuFeature } from './columnMenu';
import { columnReorderFeature } from './columnReorder';
import { conditionalFormatFeature } from './conditionalFormat';
import { contextMenuFeature } from './contextMenu';
import { exportFeature } from './export';
import { fillHandleFeature } from './fillHandle';
import { filteringFeature } from './filtering';
import { findFeature } from './find';
import { groupingFeature } from './grouping';
import { imeDirectInputFeature } from './imeDirectInput';
import { labelRowFeature } from './labelRow';
import { motionExtrasFeature } from './motionExtras';
import { rowDragFeature } from './rowDrag';
import { scrollHintFeature } from './scrollHint';
import { selectionAggregatesFeature } from './selectionAggregates';
import { serverSideFeature } from './serverSide';
import { toolPanelFeature } from './toolPanel';
import { totalRowFeature } from './totalRow';
import type { ReactGridFeatures } from './types';

export const fullGridFeatures: Required<ReactGridFeatures> = {
  find: findFeature,
  fillHandle: fillHandleFeature,
  columnReorder: columnReorderFeature,
  rowDrag: rowDragFeature,
  scrollHint: scrollHintFeature,
  columnAutosize: columnAutosizeFeature,
  totalRow: totalRowFeature,
  imeDirectInput: imeDirectInputFeature,
  contextMenu: contextMenuFeature,
  conditionalFormat: conditionalFormatFeature,
  selectionAggregates: selectionAggregatesFeature,
  motionExtras: motionExtrasFeature,
  export: exportFeature,
  columnMenu: columnMenuFeature,
  toolPanel: toolPanelFeature,
  autoHeight: autoHeightFeature,
  filtering: filteringFeature,
  serverSide: serverSideFeature,
  labelRow: labelRowFeature,
  grouping: groupingFeature,
};