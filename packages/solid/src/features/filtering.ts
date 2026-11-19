// フィルター(グローバルフィルター = 上部バーの検索欄 / 列フィルター / enableGlobalFilter / enableColumnFilter / manualFiltering
//   など)の機能です。行パイプラインの列フィルターの段と、相対日付プリセットの日付の変わり目の見張り(どちらも core。エンジンが
//   作る)に、グローバルフィルターの適用(primitives/filterOrder)を足してシェルへ渡します(React 版の features/filtering.tsx と同じ)。
//   機能セットに無い構成では行を絞り込まず(恒等の並びのまま)、createSpreadsheetGrid が enableColumnFilter / enableGlobalFilter を
//   false にします(上部バーの検索欄を出さない。React 版と同じ)。
import { createColumnFilterStage } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/columnFilterStage';
import { createDateRolloverStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/dateRolloverStore';
import { resolveRelativeDateFilterKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import { DEFAULT_FILTERING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createFilterOrder } from '../primitives/filterOrder';
import type { GridFeature, GridFeatureParts } from './types';

export const filteringFeature = {
  createColumnFilterStage,
  createDateRolloverStore,
  resolveRelativeDateFilterKey,
  createFilterOrder,
  localeText: DEFAULT_FILTERING_LOCALE_TEXT,
} satisfies GridFeatureParts<'filtering'> as unknown as GridFeature<'filtering'>;