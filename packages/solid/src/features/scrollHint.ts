// スクロール位置インジケーター(scrollHint prop。行番号のバブル / カスタムスクロールバー / ルーラー)の機能です。シェルは
//   オプションの解決と描画の部品をここから受け取ります(React 版と同じ)。機能セットに無い構成では scrollHint を渡しても
//   無効(ネイティブのスクロールバーのまま)です。
import { resolveScrollHintOptions } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollHint';
import { DEFAULT_SCROLL_HINT_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridScrollHint } from '../view/GridScrollHint';
import type { GridFeature, GridFeatureParts } from './types';

export const scrollHintFeature = {
  resolveScrollHintOptions,
  ScrollHint: GridScrollHint,
  localeText: DEFAULT_SCROLL_HINT_LOCALE_TEXT,
} satisfies GridFeatureParts<'scrollHint'> as unknown as GridFeature<'scrollHint'>;