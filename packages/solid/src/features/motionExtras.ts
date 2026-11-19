// 動きの追加分の機能です: 変わったセルのフラッシュ + 数値のトゥイーン(highlightChanges。エンジンのコントローラ)、
//   コピー範囲の動く点線(showCopyRange)、クロスヘアの列の帯(hoverHighlight: 'cross')。React 版と同じく、機能セットに
//   無い構成では highlightChanges=false / showCopyRange=false / hoverHighlight='row' として扱います(createSpreadsheetGrid)。
//   基本の動き(motion のトークン / 滑るアクティブセル / animateRows / 行のフェードイン)はシェルに残ります。
import { createChangeHighlightController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/changeHighlightController';
import { ColumnHoverOverlay, CopyRangeOverlay } from '../view/CopyRangeOverlay';
import type { GridFeature, GridFeatureParts } from './types';

export const motionExtrasFeature = {
  createChangeHighlightController,
  CopyRangeOverlay,
  ColumnHoverOverlay,
} satisfies GridFeatureParts<'motionExtras'> as unknown as GridFeature<'motionExtras'>;