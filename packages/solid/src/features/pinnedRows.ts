// 表の上下に固定する行(pinnedTopRows / pinnedBottomRows)の機能です。表示だけの行を各ペインに描く部品と、行見出しの読み上げの
//   文言の既定を渡します(React 版と同じ)。機能セットに無い構成では固定行は出ません。
import { DEFAULT_PINNED_ROWS_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { GridPinnedRows } from '../view/GridPinnedRows';
import type { GridFeature, GridFeatureParts } from './types';

export const pinnedRowsFeature = {
  PinnedRows: GridPinnedRows,
  localeText: DEFAULT_PINNED_ROWS_LOCALE_TEXT,
} satisfies GridFeatureParts<'pinnedRows'> as unknown as GridFeature<'pinnedRows'>;