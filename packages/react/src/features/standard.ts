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

// 副作用なしの印を付けた関数呼び出しで作ります。オブジェクトリテラルのまま置くと、使わない構成(standardFeatures を
//   import しない)でも webpack が中の 5 機能を「使用中」と見なしてバンドルに残すためです(webpack はオブジェクト
//   リテラルを副作用なしと判定しない。esbuild / Rollup は取り除く)。引数は識別子だけにします(引数にオブジェクト
//   リテラルがあると webpack は印を無視する)。
const createStandardFeatures = (
  filtering: typeof filteringFeature,
  columnMenu: typeof columnMenuFeature,
  toolPanel: typeof toolPanelFeature,
  columnAutosize: typeof columnAutosizeFeature,
  exportParts: typeof exportFeature,
) => ({ filtering, columnMenu, toolPanel, columnAutosize, export: exportParts }) satisfies ReactGridFeatures;

export const standardFeatures = /* @__PURE__ */ createStandardFeatures(
  filteringFeature,
  columnMenuFeature,
  toolPanelFeature,
  columnAutosizeFeature,
  exportFeature,
);