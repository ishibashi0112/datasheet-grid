// 全部入りの機能セットです(SpreadsheetGrid が使う)。Required で型付けし、機能を足したときにここへの入れ忘れを型で検出します。
import { autoHeightFeature } from './autoHeight';
import { conditionalFormatFeature } from './conditionalFormat';
import { exportFeature } from './export';
import { pinnedRowsFeature } from './pinnedRows';
import { selectionAggregatesFeature } from './selectionAggregates';
import { totalRowFeature } from './totalRow';
import type { GridFeatures, SolidGridFeatures } from './types';

export const fullGridFeatures = {
  export: exportFeature,
  autoHeight: autoHeightFeature,
  conditionalFormat: conditionalFormatFeature,
  totalRow: totalRowFeature,
  pinnedRows: pinnedRowsFeature,
  selectionAggregates: selectionAggregatesFeature,
} satisfies Required<GridFeatures> as unknown as Required<SolidGridFeatures>;