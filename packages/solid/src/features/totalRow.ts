// 合計行(totalRow prop)の機能です。集計のリゾルバ(core)と、表示に使う純関数・描画の部品をシェルへ渡します(React 版と同じ)。
//   機能セットに無い構成では totalRow を渡しても合計行は出ません。
import {
  createTotalRowCellsResolver,
  formatTotalRowCellText,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/totalRow';
import { GridTotalRow } from '../view/GridTotalRow';
import type { GridFeature, GridFeatureParts } from './types';

export const totalRowFeature = {
  createTotalRowCellsResolver,
  TotalRow: GridTotalRow,
  formatTotalRowCellText,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
} satisfies GridFeatureParts<'totalRow'> as unknown as GridFeature<'totalRow'>;