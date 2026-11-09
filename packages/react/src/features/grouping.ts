// 追加(差し込み式 段階 5): 行グルーピング(列の rowGroup / aggFunc)の機能です。グループツリーの構築(集計込み)と開閉の
//   適用(core)と、グループ行の部品をシェルへ渡します。機能セットに無い構成では行グルーピングは常に無効で(列の解決が
//   自動グループ列を作らない)、rowGroup 列もそのまま表示します(開発時に警告)。aggFunc は合計行でも使うので残ります。
import { buildGroupTree, flattenGroupTree } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import { DEFAULT_GROUPING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridBodyGroupRow } from '../view/GridBodyGroupRow';
import type { GridFeature, GridFeatureParts } from './types';

export const groupingFeature = {
  buildGroupTree,
  flattenGroupTree,
  BodyGroupRow: GridBodyGroupRow,
  // 追加(英語対応): この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_GROUPING_LOCALE_TEXT,
} satisfies GridFeatureParts<'grouping'> as unknown as GridFeature<'grouping'>;