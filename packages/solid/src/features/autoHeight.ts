// 行の高さの実測(autoHeight)の機能です。中身は core の部品だけ(React 版と同じ): 描画済みセルを実測するコントローラと、
//   実測の高さの行高ストア(縦のレイアウトが prefix-sum の行メトリクスを作る)。
import { createAutoHeightMeasurer } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/autoHeightMeasurer';
import { buildRowHeightStore, createAutoHeightRowMetrics } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowHeightStore';
import type { GridFeature, GridFeatureParts } from './types';

export const autoHeightFeature = {
  createAutoHeightMeasurer,
  buildRowHeightStore,
  createAutoHeightRowMetrics,
} satisfies GridFeatureParts<'autoHeight'> as unknown as GridFeature<'autoHeight'>;