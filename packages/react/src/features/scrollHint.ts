// 追加(差し込み式 段階 2): スクロール位置インジケーター(scrollHint prop。行番号バブル / カスタムスクロールバー /
//   ルーラー)の機能です。シェルはオプションの解決と描画部品をここから受け取ります。機能セットに無い構成では
//   scrollHint を渡しても無効(null)のまま = ネイティブのスクロールバーです。
import { resolveScrollHintOptions } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollHint';
import { DEFAULT_SCROLL_HINT_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridScrollHint } from '../view/GridScrollHint';
import type { ReactGridFeatures } from './types';

export const scrollHintFeature: NonNullable<ReactGridFeatures['scrollHint']> = {
  resolveScrollHintOptions,
  ScrollHint: GridScrollHint,
  // 追加(英語対応): この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_SCROLL_HINT_LOCALE_TEXT,
};