// 条件付き書式(GridColumn.conditionalFormat = データバー / カラースケール / 状態チップ)の機能です。React 版と同じく、列ごとの
//   min / max の集計はエンジン(createGridEngine)、データバー / カラースケールは本体の行(GridBodyLayer)、チップはシェルの
//   セルの中身の描画が、この表から取り出して使います。機能セットに無い構成では conditionalFormat を指定した列も素の表示
//   (集計もしない)。
import {
  createConditionalFormatStatsResolver,
  resolveChipSpec,
  resolveColorScaleBackground,
  resolveDataBar,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';
import { GridChip } from '../view/GridChip';
import type { GridFeature, GridFeatureParts } from './types';

export const conditionalFormatFeature = {
  createConditionalFormatStatsResolver,
  resolveDataBar,
  resolveColorScaleBackground,
  resolveChipSpec,
  GridChip,
} satisfies GridFeatureParts<'conditionalFormat'> as unknown as GridFeature<'conditionalFormat'>;