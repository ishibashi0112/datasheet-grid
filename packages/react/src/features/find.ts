// 追加(差し込み式 段階 2): セル内検索(find / onFindChange / ハンドルの openFind 等)の機能です。
import { createFindController } from '@ishibashi0112/spreadsheet-grid-core/controllers/findController';
import { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/logic/find';
import { GridFindBar } from '../view/GridFindBar';
import type { ReactGridFeatures } from './types';

export const findFeature: NonNullable<ReactGridFeatures['find']> = {
  createFindController,
  FindBar: GridFindBar,
  splitTextByFindRanges,
};