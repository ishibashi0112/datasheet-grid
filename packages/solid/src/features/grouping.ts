// 行のグループ化(列の rowGroup / aggFunc)の機能です。グループのツリーの構築(集計込み)と開閉の適用(core)と、グループ行の
//   部品をシェルへ渡します(React 版と同じ)。機能セットに無い構成では行のグループ化はいつも無効で(列の解決が自動グループ列を
//   作らない)、rowGroup の列もそのまま表示します。aggFunc は合計行でも使うので残ります。
import { buildGroupTree, flattenGroupTree } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import { DEFAULT_GROUPING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridBodyGroupRow } from '../view/GridBodyGroupRow';
import type { GridFeature, GridFeatureParts } from './types';

export const groupingFeature = {
  buildGroupTree,
  flattenGroupTree,
  BodyGroupRow: GridBodyGroupRow,
  // この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_GROUPING_LOCALE_TEXT,
} satisfies GridFeatureParts<'grouping'> as unknown as GridFeature<'grouping'>;