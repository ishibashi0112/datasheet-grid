// 追加(差し込み式 段階 2): 合計行(totalRow prop)の機能です。集計のリゾルバ(core)と、表示に使う純関数・描画部品を
//   シェルへ渡します。機能セットに無い構成では totalRow を渡しても合計行は出ません(開発時に警告)。
import {
  createTotalRowCellsResolver,
  formatTotalRowCellText,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
} from '@ishibashi0112/spreadsheet-grid-core/logic/totalRow';
import { GridTotalRow } from '../view/GridTotalRow';
import type { ReactGridFeatures } from './types';

export const totalRowFeature: NonNullable<ReactGridFeatures['totalRow']> = {
  createTotalRowCellsResolver,
  TotalRow: GridTotalRow,
  formatTotalRowCellText,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
};