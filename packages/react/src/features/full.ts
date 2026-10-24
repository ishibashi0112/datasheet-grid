// 追加(差し込み式 段階 2): 全部入りの機能セットです(公開コンポーネント SpreadsheetGrid が使う)。
//   Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
import { columnAutosizeFeature } from './columnAutosize';
import { columnReorderFeature } from './columnReorder';
import { conditionalFormatFeature } from './conditionalFormat';
import { contextMenuFeature } from './contextMenu';
import { exportFeature } from './export';
import { fillHandleFeature } from './fillHandle';
import { findFeature } from './find';
import { imeDirectInputFeature } from './imeDirectInput';
import { motionExtrasFeature } from './motionExtras';
import { rowDragFeature } from './rowDrag';
import { scrollHintFeature } from './scrollHint';
import { selectionAggregatesFeature } from './selectionAggregates';
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
};