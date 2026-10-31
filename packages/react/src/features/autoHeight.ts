// 追加(差し込み式 段階 4): 行の高さの実測(autoHeight)の機能です。中身は core の部品(描画済みセルを実測する
//   controllers/autoHeightMeasurer と、実測高さの行高ストア logic/rowHeightStore)で、描画の部品はありません。
//   機能セットに無い構成では autoHeight を false として扱い(createSpreadsheetGrid)、行の高さは固定のままです。
import { createAutoHeightMeasurer } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/autoHeightMeasurer';
import { buildRowHeightStore, createAutoHeightRowMetrics } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowHeightStore';
import type { ReactGridFeatures } from './types';

export const autoHeightFeature: NonNullable<ReactGridFeatures['autoHeight']> = {
  createAutoHeightMeasurer,
  buildRowHeightStore,
  createAutoHeightRowMetrics,
};