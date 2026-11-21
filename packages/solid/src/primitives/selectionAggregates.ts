// 選択範囲の集計を求める薄いアダプタです(本体は core の controllers/selectionAggregatesRunner)。React 版の
//   hooks/useSelectionAggregates.ts にあたるもの。同期で済む大きさは memo、大きな選択はコントローラにキーを渡して時間分割し、
//   進み具合 / 結果を外部 store として購読します。enabled が false(showSelectionAggregates={false} / 出す先が無い)なら計算しません。
import { createMemo } from 'solid-js';
import type { GridSelection, GridSelectionAggregates } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridColumn, RowModel } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import {
  createSelectionAggregatesRunner,
  resolveSyncSelectionAggregates,
  selectSelectionAggregatesResult,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectionAggregatesRunner';
import {
  createSelectionAggregateTargetStabilizer,
  resolveSelectionAggregateTarget,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export type SelectionAggregatesArgs<T> = {
  enabled: boolean;
  selection: GridSelection;
  viewRowCount: number;
  orderedColumns: readonly GridColumn<T>[];
  rowModel: RowModel<T>;
};

export function createSelectionAggregates<T>(args: () => SelectionAggregatesArgs<T>): () => GridSelectionAggregates | null {
  // 列が毎回新しい配列で渡されても(同じ範囲・同じ列なら)対象の参照を保つ(対象が変わると時間分割の計算が最初からやり直しになる)。
  //   args は読むたびに新しいオブジェクトなので、対象と行のモデルはそれぞれ memo で受け、値が同じなら先へ伝えない。
  const stabilizeTarget = createSelectionAggregateTargetStabilizer<T>();
  const target = createMemo(() => {
    const current = args();
    return stabilizeTarget(
      current.enabled
        ? resolveSelectionAggregateTarget(current.selection, current.viewRowCount, current.orderedColumns as GridColumn<T>[])
        : null,
    );
  });
  const rowModel = createMemo(() => args().rowModel);
  const key = createMemo(() => ({ rowModel: rowModel(), target: target() }));
  const syncResult = createMemo(() => resolveSyncSelectionAggregates(key()));
  const runner = createSelectionAggregatesRunner<T>();
  connectController(
    runner,
    () => ({ ...key(), needsAsync: syncResult() === undefined }),
    'render',
    'selectionAggregates',
  );
  const snapshot = createExternalStoreSignal(runner, 'selectionAggregatesStore');
  return createMemo(() => selectSelectionAggregatesResult(syncResult(), snapshot(), key()));
}