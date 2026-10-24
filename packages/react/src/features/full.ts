// 追加(差し込み式 段階 2): 全部入りの機能セットです(公開コンポーネント SpreadsheetGrid が使う)。
//   Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
import { columnAutosizeFeature } from './columnAutosize';
import { columnReorderFeature } from './columnReorder';
import { fillHandleFeature } from './fillHandle';
import { findFeature } from './find';
import { rowDragFeature } from './rowDrag';
import { scrollHintFeature } from './scrollHint';
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
};