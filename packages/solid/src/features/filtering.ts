// フィルター(グローバルフィルター = 上部バーの検索欄 / 列フィルター / enableGlobalFilter / enableColumnFilter / manualFiltering
//   など)の機能です。行パイプラインの列フィルターの段と、相対日付プリセットの日付の変わり目の見張り(どちらも core。エンジンが
//   作る)に、グローバルフィルターの適用(primitives/filterOrder)と、列フィルターのポップオーバー(コントローラの接続
//   primitives/filterPopover + 候補の収集とコマンドと描画 view/ColumnFilterPopoverHost)を足してシェルへ渡します(React 版の
//   features/filtering.tsx と同じ。React 版はポップオーバーの部品を別のチャンクで遅れて読み込むが、Solid 版は今はそのまま入れる)。
//   機能セットに無い構成では行を絞り込まず(恒等の並びのまま)、createSpreadsheetGrid が enableColumnFilter / enableGlobalFilter を
//   false にします(上部バーの検索欄を出さない。React 版と同じ)。
import { createColumnFilterStage } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/columnFilterStage';
import { createDateRolloverStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/dateRolloverStore';
import { resolveRelativeDateFilterKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import { DEFAULT_FILTERING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createFilterOrder } from '../primitives/filterOrder';
import { createFilterPopover } from '../primitives/filterPopover';
import { ColumnFilterPopoverHost } from '../view/ColumnFilterPopoverHost';
import type { GridFeature, GridFeatureParts } from './types';

export const filteringFeature = {
  createColumnFilterStage,
  createDateRolloverStore,
  resolveRelativeDateFilterKey,
  createFilterOrder,
  createFilterPopover,
  FilterPopoverHost: ColumnFilterPopoverHost,
  localeText: DEFAULT_FILTERING_LOCALE_TEXT,
} satisfies GridFeatureParts<'filtering'> as unknown as GridFeature<'filtering'>;