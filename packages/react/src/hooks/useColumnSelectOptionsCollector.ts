// 変更(非依存化 ③-10): 本体は controllers/selectOptionsCollector.ts(React 非依存)へ移設しました。
//   同期経路(閾値以下 / filterOptions 明示)は純関数を useMemo し、非同期経路(閾値超)は
//   useController でキーを渡して収集を進め、useSyncExternalStore で進捗 / 完了を購読します。
//   返り値の形(status / options / allValues / progress)と stale 排除の契約は従来どおりです。
import { useMemo, useSyncExternalStore } from 'react';
import type { GridColumn } from '../model/gridTypes';
import {
  createSelectOptionsCollector,
  resolveSyncSelectOptions,
  selectCollectorResult,
  type ColumnSelectOptionsResult,
  type RawValueAccessor,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectOptionsCollector';
import { useController } from './useController';

export {
  ASYNC_SELECT_COLLECT_ROW_THRESHOLD,
  type ColumnSelectOptionsResult,
  type ColumnSelectOptionsStatus,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectOptionsCollector';

type UseColumnSelectOptionsCollectorArgs<T> = {
  column: GridColumn<T> | null;
  rowCount: number;
  getRawValueAt: RawValueAccessor;
  // 追加(1.0.1 / AP-18): 数の列(解決済みの種別が numberSet)の候補を数の順に並べる。
  numeric?: boolean;
};

export const useColumnSelectOptionsCollector = <T,>({
  column,
  rowCount,
  getRawValueAt,
  numeric = false,
}: UseColumnSelectOptionsCollectorArgs<T>): ColumnSelectOptionsResult => {
  const syncResult = useMemo(
    () => resolveSyncSelectOptions(column, rowCount, getRawValueAt, numeric),
    [column, rowCount, getRawValueAt, numeric],
  );
  // 追加(1.0.1 / AP-19): どの列の候補か(同じ列のまま行だけが変わったら、前の候補を出したまま集め直す)。
  const sourceKey = column === null ? undefined : String(column.key);
  const collector = useController(createSelectOptionsCollector, {
    needsAsync: syncResult === null,
    rowCount,
    getRawValueAt,
    numeric,
    sourceKey,
  });
  const snapshot = useSyncExternalStore(
    collector.subscribe,
    collector.getSnapshot,
    collector.getSnapshot,
  );
  return syncResult ?? selectCollectorResult(snapshot, rowCount, getRawValueAt, sourceKey);
};

export default useColumnSelectOptionsCollector;