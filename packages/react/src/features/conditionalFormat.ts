// 追加(差し込み式 段階 2): 条件付き書式(GridColumn.conditionalFormat = データバー / カラースケール / 状態チップ)の機能です。
//   中身は今までどおりの部品で、列ごとの min / max の集計はエンジン(createGridEngine)、データバー / カラースケールは
//   本体の行(GridBodyLayer)、チップはシェルのセル内容の描画が、この表から取り出して元の位置で呼びます。機能セットに
//   無い構成では conditionalFormat を指定した列も素の表示になります(集計もしない)。
import {
  createConditionalFormatStatsResolver,
  resolveChipSpec,
  resolveColorScaleBackground,
  resolveDataBar,
} from '@ishibashi0112/spreadsheet-grid-core/logic/conditionalFormat';
import { GridChip } from '../view/GridChip';
import type { ReactGridFeatures } from './types';

export const conditionalFormatFeature: NonNullable<ReactGridFeatures['conditionalFormat']> = {
  createConditionalFormatStatsResolver,
  resolveDataBar,
  resolveColorScaleBackground,
  resolveChipSpec,
  GridChip,
};