// 追加(差し込み式 段階 2): セル内検索(find / onFindChange / ハンドルの openFind 等)の機能です。
import { createFindController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/findController';
import { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/find';
import { DEFAULT_FIND_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridFindBar } from '../view/GridFindBar';
import type { ReactGridFeatures } from './types';

export const findFeature: NonNullable<ReactGridFeatures['find']> = {
  createFindController,
  FindBar: GridFindBar,
  splitTextByFindRanges,
  // 追加(英語対応): この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_FIND_LOCALE_TEXT,
};