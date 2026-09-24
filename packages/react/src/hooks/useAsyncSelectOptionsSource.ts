// 追加(async-options): getFilterOptions 経由の候補取得(controllers/asyncSelectOptionsSource)を React に接続する
//   薄いアダプタです。useController で毎レンダー最新の引数を渡し(開始 / 中断の判定はコントローラ側)、
//   useSyncExternalStore で結果を購読します。列不一致のスナップショットは表面化しません(stale 排除)。
import { useSyncExternalStore } from 'react';
import {
  createAsyncSelectOptionsSource,
  selectAsyncOptionsResult,
  type AsyncSelectOptionsSourceArgs,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/asyncSelectOptionsSource';
import type { ColumnSelectOptionsResult } from '@ishibashi0112/spreadsheet-grid-core/controllers/selectOptionsCollector';
import { useController } from './useController';

export type UseAsyncSelectOptionsSourceResult = {
  result: ColumnSelectOptionsResult;
  retry: () => void;
};

export const useAsyncSelectOptionsSource = <T,>(
  args: AsyncSelectOptionsSourceArgs<T>,
): UseAsyncSelectOptionsSourceResult => {
  const source = useController(createAsyncSelectOptionsSource<T>, args);
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return { result: selectAsyncOptionsResult(snapshot, args.columnKey), retry: source.retry };
};

export default useAsyncSelectOptionsSource;