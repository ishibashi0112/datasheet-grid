// 全部入りのグリッド(すべての機能を差し込んだ SpreadsheetGrid)。
import { createSpreadsheetGrid } from './createSpreadsheetGrid';
import { fullGridFeatures } from './features/full';

export const SpreadsheetGrid = createSpreadsheetGrid({
  features: fullGridFeatures as unknown as Parameters<typeof createSpreadsheetGrid>[0]['features'],
});