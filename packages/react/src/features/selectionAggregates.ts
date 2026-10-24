// 追加(差し込み式 段階 2): 選択範囲の集計(showSelectionAggregates。下部バーの平均 / データの個数 / 合計)の機能です。
//   中身は今までどおりの部品で、シェルは集計の hook を元の位置で呼び、既定の下部バーは表示部品をこの表から受け取ります。
//   機能セットに無い構成では集計しません(slot context の selectionAggregates は null、既定の下部バーにも出ない)。
import { useSelectionAggregates } from '../hooks/useSelectionAggregates';
import { GridSelectionAggregates } from '../view/GridSelectionAggregates';
import type { ReactGridFeatures } from './types';

export const selectionAggregatesFeature: NonNullable<ReactGridFeatures['selectionAggregates']> = {
  useSelectionAggregates,
  SelectionAggregates: GridSelectionAggregates,
};