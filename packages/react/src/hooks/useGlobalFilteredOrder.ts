// 変更(非依存化 ③-11): 本体は controllers/globalFilteredOrder.ts(React 非依存)へ移設しました。
//   入力テキストの遅延(useDeferredValue)は React 固有なので本 hook に残し、同期経路は純関数を
//   useMemo、非同期経路は useController でキーを渡して進め、useSyncExternalStore で進捗 / 完了を
//   購読します。返り値(order / status / progress)と「計算中は order 参照が安定」の契約は従来どおりです。
import { useDeferredValue, useMemo, useSyncExternalStore } from 'react';
import type { GridColumn } from '../model/gridTypes';
import {
  createGlobalFilteredOrderRunner,
  resolveSyncGlobalFilteredOrder,
  selectGlobalFilteredOrderResult,
  type GlobalFilteredOrderResult,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/globalFilteredOrder';
import type { RowOrder } from '@ishibashi0112/spreadsheet-grid-core/logic/filtering';
import { useController } from './useController';

export {
  ASYNC_GLOBAL_FILTER_ROW_THRESHOLD,
  type GlobalFilteredOrderResult,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/globalFilteredOrder';

type UseGlobalFilteredOrderArgs<T> = {
  rows: T[];
  baseOrder: RowOrder;
  columns: GridColumn<T>[];
  globalText: string;
  enabled: boolean;
};

export const useGlobalFilteredOrder = <T,>({
  rows,
  baseOrder,
  columns,
  globalText,
  enabled,
}: UseGlobalFilteredOrderArgs<T>): GlobalFilteredOrderResult => {
  const deferredText = useDeferredValue(globalText);
  const needle = deferredText.trim().toLowerCase();
  const key = useMemo(
    () => ({ rows, baseOrder, columns, needle }),
    [rows, baseOrder, columns, needle],
  );
  const syncResult = useMemo(
    () => resolveSyncGlobalFilteredOrder(key, deferredText, enabled),
    [key, deferredText, enabled],
  );
  const runner = useController(() => createGlobalFilteredOrderRunner<T>(), {
    ...key,
    needsAsync: syncResult === null,
  });
  const snapshot = useSyncExternalStore(
    runner.subscribe,
    runner.getSnapshot,
    runner.getSnapshot,
  );
  return selectGlobalFilteredOrderResult(syncResult, snapshot, key);
};

export default useGlobalFilteredOrder;