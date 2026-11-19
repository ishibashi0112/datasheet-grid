// 選択範囲の集計(showSelectionAggregates。既定の下部バーの「平均 / データの個数 / 合計」)の機能です。集計を求めるアダプタ
//   (core のコントローラ)と、下部バーに出す部品をシェルへ渡します(React 版と同じ)。機能セットに無い構成では集計を出さず、
//   利用側のバーへ渡す文脈の selectionAggregates は常に null です。
import { DEFAULT_AGGREGATES_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createSelectionAggregates } from '../primitives/selectionAggregates';
import { GridSelectionAggregates } from '../view/GridSelectionAggregates';
import type { GridFeature, GridFeatureParts } from './types';

export const selectionAggregatesFeature = {
  createSelectionAggregates,
  SelectionAggregates: GridSelectionAggregates,
  localeText: DEFAULT_AGGREGATES_LOCALE_TEXT,
} satisfies GridFeatureParts<'selectionAggregates'> as unknown as GridFeature<'selectionAggregates'>;