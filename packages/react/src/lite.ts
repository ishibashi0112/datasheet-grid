// 追加(差し込み式 段階 6): `/lite` の入口です。使う機能だけを差し込んだグリッドを createSpreadsheetGrid で作ります。
//   差し込まなかった機能のモジュールは利用側のバンドルから消えます(全部入りの SpreadsheetGrid は import しない)。
//   機能の部品は機能セットのキー + Feature の名前で公開します(開発時の警告もこの名前で案内する)。
//   props・ハンドル・型は全部入りと共通です(common)。dist では全部入りとは別のビルド(vite.lite.config.ts)なので、
//   preloadGridPopups は /lite のグリッドの部品だけを読み込みます(同じ名前の別の関数)。
export { createSpreadsheetGrid } from './createSpreadsheetGrid';
export type { CreateSpreadsheetGridOptions } from './createSpreadsheetGrid';
export type { ReactGridFeatures as GridFeatures } from './features/types';
// よく使う機能の組み合わせ(プリセット)。
export { standardFeatures } from './features/standard';
// 機能の部品(機能セットのキーの順は features/full.ts と同じ)。
export { findFeature } from './features/find';
export { fillHandleFeature } from './features/fillHandle';
export { columnReorderFeature } from './features/columnReorder';
export { rowDragFeature } from './features/rowDrag';
export { scrollHintFeature } from './features/scrollHint';
export { columnAutosizeFeature } from './features/columnAutosize';
export { totalRowFeature } from './features/totalRow';
export { imeDirectInputFeature } from './features/imeDirectInput';
export { contextMenuFeature } from './features/contextMenu';
export { conditionalFormatFeature } from './features/conditionalFormat';
export { selectionAggregatesFeature } from './features/selectionAggregates';
export { motionExtrasFeature } from './features/motionExtras';
export { exportFeature } from './features/export';
export { columnMenuFeature } from './features/columnMenu';
export { toolPanelFeature } from './features/toolPanel';
export { autoHeightFeature } from './features/autoHeight';
export { filteringFeature } from './features/filtering';
export { serverSideFeature } from './features/serverSide';
export { labelRowFeature } from './features/labelRow';
export { groupingFeature } from './features/grouping';
// コンポーネント以外の公開物(関数と型)は全部入りの入口と共通です。
export * from './common';