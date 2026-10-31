// 追加(差し込み式 段階 2): 動きの追加分の機能です。変更セルのフラッシュ + 数値トゥイーン(highlightChanges。
//   エンジンのコントローラ)、コピー範囲の動く点線(showCopyRange)、クロスヘアの列の帯(hoverHighlight='cross')。
//   中身は今までどおりの部品で、エンジン / シェルがこの表から取り出して元の位置で使います。機能セットに無い構成では
//   highlightChanges=false / showCopyRange=false / hoverHighlight='row' として扱います(createSpreadsheetGrid)。
//   基本のモーション(motion トークン / 滑るアクティブセル / animateRows / 行のフェードイン等)はシェル側に残ります。
import { createChangeHighlightController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/changeHighlightController';
import { CopyRangeOverlay } from '../CopyRangeOverlay';
import { ColumnHoverOverlay } from '../ColumnHoverOverlay';
import type { ReactGridFeatures } from './types';

export const motionExtrasFeature: NonNullable<ReactGridFeatures['motionExtras']> = {
  createChangeHighlightController,
  CopyRangeOverlay,
  ColumnHoverOverlay,
};