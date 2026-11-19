// 全部入りの機能セットです(SpreadsheetGrid が使う)。Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
import { autoHeightFeature } from './autoHeight';
import { exportFeature } from './export';
import type { GridFeatures, SolidGridFeatures } from './types';

export const fullGridFeatures = {
  export: exportFeature,
  autoHeight: autoHeightFeature,
} satisfies Required<GridFeatures> as unknown as Required<SolidGridFeatures>;
