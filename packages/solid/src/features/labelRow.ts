// ラベル行(labelRow prop)の機能です。行のパイプラインの配置 / 表示順 / 行のモデル(core)と、serverSide の行のモデルの
//   ラッパ・縦スクロールの固定の解決(core の純関数)、描く部品(帯の行 / 縦スクロールの固定の層)をシェルへ渡します(React 版と
//   同じ)。機能セットに無い構成では labelRow を外し(createSpreadsheetGrid)、ラベル行の述語に当たる行もデータ行として並びます。
import {
  buildLabelDisplay,
  createLabelFreeOrder,
  createLabelRowModel,
  resolveLabelRowLayout,
  resolveStickyLabel,
  wrapRowModelWithLabelRows,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
import { GridBodyLabelRow } from '../view/GridBodyLabelRow';
import { GridStickyLabelLayer } from '../view/GridStickyLabelLayer';
import type { GridFeature, GridFeatureParts } from './types';

export const labelRowFeature = {
  resolveLabelRowLayout,
  createLabelFreeOrder,
  buildLabelDisplay,
  createLabelRowModel,
  wrapRowModelWithLabelRows,
  resolveStickyLabel,
  BodyLabelRow: GridBodyLabelRow,
  StickyLabelLayer: GridStickyLabelLayer,
} satisfies GridFeatureParts<'labelRow'> as unknown as GridFeature<'labelRow'>;