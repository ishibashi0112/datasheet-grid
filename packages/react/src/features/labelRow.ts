// 追加(差し込み式 段階 5): ラベル行(labelRow prop)の機能です。行パイプラインの配置 / 表示順 / 行モデル(core)と、
//   serverSide の行モデルのラッパ・縦スクロール固定の解決(core の純関数)、描画の部品(帯の行 / 縦スクロール固定の層)を
//   シェルへ渡します。機能セットに無い構成では labelRow を外し(createSpreadsheetGrid)、ラベル行の述語に当たる行も
//   データ行として並びます(開発時に警告)。
import {
  buildLabelDisplay,
  createLabelFreeOrder,
  createLabelRowModel,
  resolveLabelRowLayout,
  resolveStickyLabel,
  wrapRowModelWithLabelRows,
} from '@ishibashi0112/spreadsheet-grid-core/logic/labelRows';
import { GridBodyLabelRow } from '../view/GridBodyLabelRow';
import { GridStickyLabelLayer } from '../view/GridStickyLabelLayer';
import type { ReactGridFeatures } from './types';

export const labelRowFeature: NonNullable<ReactGridFeatures['labelRow']> = {
  resolveLabelRowLayout,
  createLabelFreeOrder,
  buildLabelDisplay,
  createLabelRowModel,
  wrapRowModelWithLabelRows,
  resolveStickyLabel,
  BodyLabelRow: GridBodyLabelRow,
  StickyLabelLayer: GridStickyLabelLayer,
};