// 追加(差し込み式 段階 5): フィルター(グローバルフィルター / 列フィルター)の機能です。
//   - エンジン側: 行パイプラインの列フィルターの段(core engine/columnFilterStage)と、相対日付プリセットの日付の
//     変わり目の見張り(core controllers/dateRolloverStore)。
//   - シェル側: useFilterOrder = グローバルフィルターの適用(大きなデータは時間分割。hooks/useGlobalFilteredOrder)と、
//     相対日付プリセットの基準日の購読 + 範囲のキー(監査 L-15)。シェルにあったときと同じ位置・同じ順番で hook を呼びます。
//   機能セットに無い構成では enableColumnFilter / enableGlobalFilter を false として扱い(createSpreadsheetGrid)、
//   行は絞り込みません(代役の useFilterOrder は baseOrder をそのまま返す)。
import { useMemo, useSyncExternalStore } from 'react';
import { createColumnFilterStage } from '@ishibashi0112/spreadsheet-grid-core/engine/columnFilterStage';
import { createDateRolloverStore } from '@ishibashi0112/spreadsheet-grid-core/controllers/dateRolloverStore';
import {
  columnFiltersUseRelativeDate,
  resolveRelativeDateFilterKey,
} from '@ishibashi0112/spreadsheet-grid-core/logic/filtering';
import { useControllerLifecycle } from '../hooks/useController';
import { useGlobalFilteredOrder } from '../hooks/useGlobalFilteredOrder';
import type { FilterOrderFeatureArgs, FilterOrderFeatureResult, ReactGridFeatures } from './types';

const useFilterOrder = <T,>({
  rows,
  baseOrder,
  visibleColumns,
  effectiveColumns,
  globalFilterText,
  globalFilterEnabled,
  columnFilterEnabled,
  columnFilters,
  deferredColumnFilters,
  manualFiltering,
  isServerSide,
  dateRollover,
}: FilterOrderFeatureArgs<T>): FilterOrderFeatureResult => {
  // 変更(F-async): globalFilteredOrder の同期 useMemo を時間分割フックへ差し替えます。
  //   返り値の order は「現在表示すべきビュー順」で、計算中は前回確定 order を維持します
  //   (= 下流 columnFiltered / sorted / rowModel は order 参照が安定する限りスキップ＝
  //   進捗 tick では本体行は再描画されず、トップバーの進捗表示だけが更新されます)。
  //   status / progress は下のバーコンテキストへ渡してローディング表示に使います。
  const {
    order: globalFilteredOrder,
    status: globalFilterStatus,
    progress: globalFilterProgress,
  } = useGlobalFilteredOrder({
    rows,
    baseOrder,
    columns: visibleColumns,
    globalText: globalFilterText,
    // 変更(manual-mode): 手動フィルターでは走らせない(order は baseOrder のまま)。
    enabled: globalFilterEnabled && !manualFiltering,
  });

  // 追加(監査 L-15): 相対日付プリセット(今日 / 今月 / 過去 30 日 / カスタム)の基準日。プリセットを含む列フィルターが
  //   掛かっている間だけ日付の変わり目を見張り(controllers/dateRolloverStore)、基準日で解決した範囲のキー
  //   (resolveRelativeDateFilterKey)を行パイプラインの入力に足します。日付が変わって範囲も変わると、clientSide は
  //   列フィルターを評価し直し、serverSide は queryKey が変わって取り直します(「今月」の月内など範囲が同じなら何もしない)。
  //   手動フィルター(manualFiltering)では行を絞り込まないため見張りません。
  const relativeDateFilterActive = useMemo(
    () =>
      isServerSide
        ? columnFilterEnabled && columnFiltersUseRelativeDate(columnFilters)
        : !manualFiltering && columnFiltersUseRelativeDate(deferredColumnFilters),
    [isServerSide, columnFilterEnabled, columnFilters, manualFiltering, deferredColumnFilters],
  );
  useControllerLifecycle(dateRollover, { active: relativeDateFilterActive });
  const relativeDateSnapshot = useSyncExternalStore(
    dateRollover.subscribe,
    dateRollover.getSnapshot,
    dateRollover.getSnapshot,
  );
  const relativeDateKey = useMemo(
    () =>
      relativeDateFilterActive
        ? resolveRelativeDateFilterKey(
            effectiveColumns,
            isServerSide ? columnFilters : deferredColumnFilters,
            relativeDateSnapshot,
          )
        : '',
    [relativeDateFilterActive, effectiveColumns, isServerSide, columnFilters, deferredColumnFilters, relativeDateSnapshot],
  );

  return { globalFilteredOrder, globalFilterStatus, globalFilterProgress, relativeDateKey };
};

export const filteringFeature: NonNullable<ReactGridFeatures['filtering']> = {
  createColumnFilterStage,
  createDateRolloverStore,
  useFilterOrder,
};