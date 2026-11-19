// 全部入りのグリッド(すべての機能を差し込んだ SpreadsheetGrid)。
import { createSpreadsheetGrid } from './createSpreadsheetGrid';
import { fullGridFeatures } from './features/full';

// モジュール直下の呼び出しは /* @__PURE__ */(使わなければ束ねたときに消える。React 版の規約と同じ)。
export const SpreadsheetGrid = /* @__PURE__ */ createSpreadsheetGrid({
  features: fullGridFeatures as unknown as Parameters<typeof createSpreadsheetGrid>[0]['features'],
});