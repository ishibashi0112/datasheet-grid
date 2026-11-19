// グローバルフィルターの適用と、相対日付プリセットの基準日(機能 features/filtering)。React 版の features/filtering.tsx の
//   useFilterOrder にあたるものです。
//   - グローバルフィルター: 小さな表はその場で(core resolveSyncGlobalFilteredOrder)、しきい値を超える表は core の
//     ランナー(controllers/globalFilteredOrder)が時間分割で走らせ、計算中は前の結果の order のまま(進捗だけ変わる)。
//     React 版は入力の文字を useDeferredValue で遅らせますが、Solid には同じものが無いので打った文字をそのまま使います
//     (大きな表は時間分割なので入力は詰まらない)。
//   - 相対日付プリセット(今日 / 今月 / 過去 30 日 / カスタム)を含む列フィルターが掛かっている間だけ、エンジンの
//     dateRollover で日付の変わり目を見張り、基準日で解決した範囲のキーを行パイプラインに渡します(監査 L-15)。
//   列フィルターの段は行パイプライン(エンジンが features.filtering.createColumnFilterStage で作る)が掛けます。
import { createMemo } from 'solid-js';
import {
  createGlobalFilteredOrderRunner,
  resolveSyncGlobalFilteredOrder,
  selectGlobalFilteredOrderResult,
  type GlobalFilterKey,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/globalFilteredOrder';
import type { DateRolloverStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/dateRolloverStore';
import {
  columnFiltersUseRelativeDate,
  resolveRelativeDateFilterKey,
  toGlobalFilterColumns,
  type RowOrder,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import type { GlobalFilterStatus, GridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import type { ColumnFilterValue, GridGlobalFilterMatch } from '@ishibashi0112/spreadsheet-grid-core';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export type FilterOrderInputs<T> = {
  rows: () => T[];
  // 恒等 order(ラベル行があればラベル行を除いたもの)。
  baseOrder: () => RowOrder;
  // グローバルフィルターの対象列(表示列)/ 相対日付プリセットの範囲の解決に使う列(非表示列を含む)。
  visibleColumns: () => GridColumn<T>[];
  effectiveColumns: () => GridColumn<T>[];
  globalFilterText: () => string;
  globalFilterMatch: () => GridGlobalFilterMatch | undefined;
  globalFilterEnabled: () => boolean;
  columnFilterEnabled: () => boolean;
  columnFilters: () => Record<string, ColumnFilterValue>;
  manualFiltering: () => boolean;
  isServerSide: () => boolean;
  dateRollover: DateRolloverStore;
};

export type FilterOrder = {
  // グローバルフィルター済み order(列フィルターとソートは行パイプラインが掛ける)。
  globalFilteredOrder: () => RowOrder;
  globalFilterStatus: () => GlobalFilterStatus;
  globalFilterProgress: () => number;
  // 相対日付プリセットの範囲のキー(行パイプライン / serverSide の queryKey の入力。無ければ '')。
  relativeDateKey: () => string;
};

const sameGlobalFilterKey = <T,>(a: GlobalFilterKey<T>, b: GlobalFilterKey<T>): boolean =>
  a.rows === b.rows && a.baseOrder === b.baseOrder && a.columns === b.columns && a.needle === b.needle;

export function createFilterOrder<T>(inputs: FilterOrderInputs<T>): FilterOrder {
  // 'display' / 'both' では valueFormatter の画面の文字でも照らし合わせます(React 版と同じ。'value' は列の参照のまま)。
  //   列は memo で受けます(列の解決が別の理由で計算し直されても、表示列が同じなら作り直さない)。
  const visibleColumns = createMemo(() => inputs.visibleColumns());
  const globalFilterColumns = createMemo(() => toGlobalFilterColumns(visibleColumns(), inputs.globalFilterMatch()));
  const text = createMemo(() => inputs.globalFilterText());
  const needle = createMemo(() => text().trim().toLowerCase());
  // ランナーの「同じ計算か」の判定は key の各値の参照で見ます(React 版の useMemo と同じく、どれかが変わったら新しい key。
  //   同じ値の組なら前の key のまま = 小さな表のその場の絞り込みもやり直さない)。
  const key = createMemo<GlobalFilterKey<T>>(
    () => ({
      rows: inputs.rows(),
      baseOrder: inputs.baseOrder(),
      columns: globalFilterColumns(),
      needle: needle(),
    }),
    { equals: sameGlobalFilterKey<T> },
  );
  const enabled = () => inputs.globalFilterEnabled() && !inputs.manualFiltering();
  const syncResult = createMemo(() => resolveSyncGlobalFilteredOrder(key(), text(), enabled()));
  const runner = createGlobalFilteredOrderRunner<T>();
  connectController(runner, () => ({ ...key(), needsAsync: syncResult() === null }));
  const snapshot = createExternalStoreSignal(runner);
  const result = createMemo(() => selectGlobalFilteredOrderResult<T>(syncResult(), snapshot(), key()));

  // 相対日付プリセット(監査 L-15)。手動フィルター(manualFiltering)では行を絞り込まないので見張りません。
  const columnFilters = createMemo(() => inputs.columnFilters());
  const relativeDateFilterActive = createMemo(() =>
    inputs.isServerSide()
      ? inputs.columnFilterEnabled() && columnFiltersUseRelativeDate(columnFilters())
      : !inputs.manualFiltering() && columnFiltersUseRelativeDate(columnFilters()),
  );
  connectController(inputs.dateRollover, () => ({ active: relativeDateFilterActive() }));
  const relativeDateSnapshot = createExternalStoreSignal(inputs.dateRollover);
  const relativeDateKey = createMemo(() =>
    relativeDateFilterActive()
      ? resolveRelativeDateFilterKey(inputs.effectiveColumns(), columnFilters(), relativeDateSnapshot())
      : '',
  );

  return {
    globalFilteredOrder: createMemo(() => result().order),
    globalFilterStatus: createMemo(() => result().status),
    globalFilterProgress: createMemo(() => result().progress),
    relativeDateKey,
  };
}