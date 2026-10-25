// 追加(差し込み式 段階 6): よく使う機能の組み合わせ(/lite のプリセット)です。全部入りで既定オンの UI のうち、
//   表を「見る・探す・整える・持ち出す」ための機能をまとめます(列フィルター / グローバルフィルター、列メニュー、
//   ツールパネル、列幅の自動調整、エクスポート)。ほかの機能は広げて足します:
//   `createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } })`。
import { columnAutosizeFeature } from './columnAutosize';
import { columnMenuFeature } from './columnMenu';
import { exportFeature } from './export';
import { filteringFeature } from './filtering';
import { toolPanelFeature } from './toolPanel';
import type { ReactGridFeatures } from './types';

export const standardFeatures = {
  filtering: filteringFeature,
  columnMenu: columnMenuFeature,
  toolPanel: toolPanelFeature,
  columnAutosize: columnAutosizeFeature,
  export: exportFeature,
} satisfies ReactGridFeatures;