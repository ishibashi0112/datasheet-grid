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
} from '../controllers/selectOptionsCollector';
import { useController } from './useController';

export {
  ASYNC_SELECT_COLLECT_ROW_THRESHOLD,
  type ColumnSelectOptionsResult,
  type ColumnSelectOptionsStatus,
} from '../controllers/selectOptionsCollector';

type UseColumnSelectOptionsCollectorArgs<T> = {
  column: GridColumn<T> | null;
  rowCount: number;
  getRawValueAt: RawValueAccessor;
};

export const useColumnSelectOptionsCollector = <T,>({
  column,
  rowCount,
  getRawValueAt,
}: UseColumnSelectOptionsCollectorArgs<T>): ColumnSelectOptionsResult => {
  const syncResult = useMemo(
    () => resolveSyncSelectOptions(column, rowCount, getRawValueAt),
    [column, rowCount, getRawValueAt],
  );
  const collector = useController(createSelectOptionsCollector, {
    needsAsync: syncResult === null,
    rowCount,
    getRawValueAt,
  });
  const snapshot = useSyncExternalStore(
    collector.subscribe,
    collector.getSnapshot,
    collector.getSnapshot,
  );
  return syncResult ?? selectCollectorResult(snapshot, rowCount, getRawValueAt);
};

export default useColumnSelectOptionsCollector;