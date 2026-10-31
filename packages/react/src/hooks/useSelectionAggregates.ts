// 追加(選択範囲の集計): 選択範囲の集計を求める薄いアダプタです(本体は core の controllers/selectionAggregatesRunner)。
//   同期経路は純関数を useMemo、大きな選択は useController でキーを渡して時間分割し、useSyncExternalStore で
//   進捗 / 完了を購読します。enabled=false(showSelectionAggregates=false / 下部バー非表示)では計算しません。
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { GridColumn, GridSelection, GridSelectionAggregates, RowModel } from '../model/gridTypes';
import {
  createSelectionAggregatesRunner,
  resolveSyncSelectionAggregates,
  selectSelectionAggregatesResult,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectionAggregatesRunner';
import {
  createSelectionAggregateTargetStabilizer,
  resolveSelectionAggregateTarget,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates';
import { useController } from './useController';

export type UseSelectionAggregatesArgs<T> = {
  enabled: boolean;
  selection: GridSelection;
  viewRowCount: number;
  orderedColumns: GridColumn<T>[];
  rowModel: RowModel<T>;
};

export const useSelectionAggregates = <T,>({
  enabled,
  selection,
  viewRowCount,
  orderedColumns,
  rowModel,
}: UseSelectionAggregatesArgs<T>): GridSelectionAggregates | null => {
  // columns をインラインで渡されても(毎レンダー新しい参照)、同じ範囲・同じ列なら対象の参照を保ちます
  //   (対象が変わると大きな選択の時間分割の計算が最初からやり直しになるため)。
  const [stabilizeTarget] = useState(() => createSelectionAggregateTargetStabilizer<T>());
  const target = useMemo(
    () =>
      stabilizeTarget(enabled ? resolveSelectionAggregateTarget(selection, viewRowCount, orderedColumns) : null),
    [stabilizeTarget, enabled, selection, viewRowCount, orderedColumns],
  );
  const key = useMemo(() => ({ rowModel, target }), [rowModel, target]);
  const syncResult = useMemo(() => resolveSyncSelectionAggregates(key), [key]);
  const runner = useController(() => createSelectionAggregatesRunner<T>(), {
    ...key,
    needsAsync: syncResult === undefined,
  });
  const snapshot = useSyncExternalStore(runner.subscribe, runner.getSnapshot, runner.getSnapshot);
  // 計算中の値は呼ぶたびに新しいオブジェクトになるため memo して、slotContext の参照を無駄に変えないようにします。
  return useMemo(() => selectSelectionAggregatesResult(syncResult, snapshot, key), [syncResult, snapshot, key]);
};

export default useSelectionAggregates;