// 追加(差し込み式 段階 2): 全部入りの機能セットです(公開コンポーネント SpreadsheetGrid が使う)。
//   Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
// 変更(1.0 の準備): 機能の部品は公開型(中身の見えない GridFeature)なので、公開型の表として入れ忘れを検査してから、
//   シェルが使う中身の型として読みます(型の付け替えだけ)。
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
import type { GridFeatures, ReactGridFeatures } from './types';

export const fullGridFeatures = {
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
} satisfies Required<GridFeatures> as unknown as Required<ReactGridFeatures>;