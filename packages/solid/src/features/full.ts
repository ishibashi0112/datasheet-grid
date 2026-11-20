// 全部入りの機能セットです(SpreadsheetGrid が使う)。Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
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
import { serverSideFeature } from './serverSide';
import { motionExtrasFeature } from './motionExtras';
import { pinnedRowsFeature } from './pinnedRows';
import { rowDragFeature } from './rowDrag';
import { scrollHintFeature } from './scrollHint';
import { selectionAggregatesFeature } from './selectionAggregates';
import { toolPanelFeature } from './toolPanel';
import { totalRowFeature } from './totalRow';
import type { GridFeatures, SolidGridFeatures } from './types';

export const fullGridFeatures = {
  export: exportFeature,
  autoHeight: autoHeightFeature,
  conditionalFormat: conditionalFormatFeature,
  totalRow: totalRowFeature,
  pinnedRows: pinnedRowsFeature,
  selectionAggregates: selectionAggregatesFeature,
  scrollHint: scrollHintFeature,
  motionExtras: motionExtrasFeature,
  find: findFeature,
  imeDirectInput: imeDirectInputFeature,
  columnAutosize: columnAutosizeFeature,
  columnReorder: columnReorderFeature,
  rowDrag: rowDragFeature,
  fillHandle: fillHandleFeature,
  contextMenu: contextMenuFeature,
  filtering: filteringFeature,
  columnMenu: columnMenuFeature,
  toolPanel: toolPanelFeature,
  grouping: groupingFeature,
  labelRow: labelRowFeature,
  serverSide: serverSideFeature,
} satisfies Required<GridFeatures> as unknown as Required<SolidGridFeatures>;