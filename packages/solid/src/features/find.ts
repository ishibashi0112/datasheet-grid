// セル内検索(find / onFindChange / ハンドルの openFind など)の機能です。検索のコントローラ(core。走査は時間分割)と、
//   ヒットを分ける純関数、右上の検索バーの部品をシェルへ渡します(React 版と同じ)。機能セットに無い構成では find を
//   渡しても無効(Ctrl / ⌘ + F も横取りしない = ブラウザの検索のまま)で、命令的 API の openFind なども何もしません。
import { createFindController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/findController';
import { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/find';
import { DEFAULT_FIND_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridFindBar } from '../view/GridFindBar';
import type { GridFeature, GridFeatureParts } from './types';

export const findFeature = {
  createFindController,
  FindBar: GridFindBar,
  splitTextByFindRanges,
  localeText: DEFAULT_FIND_LOCALE_TEXT,
} satisfies GridFeatureParts<'find'> as unknown as GridFeature<'find'>;