// serverSide(SSRM)の RowModel を供給するフックです(DS-4 ②)。
// 変更(非依存化 ③-12): 本体は controllers/serverSideRowModel.ts(React 非依存)へ移設し、本 hook は
//   useController で最新 params を渡し、useSyncExternalStore でスナップショット(rowModel / rowCount /
//   loadError / writeError)を購読する薄いアダプタです。返り値の形は従来どおり。
import { useSyncExternalStore } from 'react';
import type { RowModel } from '../model/gridTypes';
import {
  createServerSideRowModel,
  type ServerSideLoadErrorState,
  type ServerSideRowModelArgs,
  type ServerSideWriteErrorState,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/serverSideRowModel';
import type { ServerSideCellEditInput } from '@ishibashi0112/spreadsheet-grid-core/logic/serverSideEdits';
import { useController } from './useController';

export type {
  ServerSideLoadErrorState,
  ServerSideWriteErrorState,
} from '@ishibashi0112/spreadsheet-grid-core/controllers/serverSideRowModel';

export type UseServerSideRowModelParams<T> = ServerSideRowModelArgs<T>;

export type UseServerSideRowModelResult<T> = {
  rowModel: RowModel<T>;
  rowCount: number;
  isRowLoaded: (viewIndex: number) => boolean;
  requestRange: (startIndex: number, endIndex: number) => void;
  refresh: () => void;
  loadError: ServerSideLoadErrorState | null;
  retryFailedBlocks: () => void;
  canUpdateRows: boolean;
  applyCellEdits: (edits: ServerSideCellEditInput<T>[]) => number;
  writeError: ServerSideWriteErrorState | null;
};

export function useServerSideRowModel<T>(
  params: UseServerSideRowModelParams<T>,
): UseServerSideRowModelResult<T> {
  const controller = useController(
    () => createServerSideRowModel<T>(params),
    params,
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    rowModel: snapshot.rowModel,
    rowCount: snapshot.rowCount,
    isRowLoaded: controller.isRowLoaded,
    requestRange: controller.requestRange,
    refresh: controller.refresh,
    loadError: snapshot.loadError,
    retryFailedBlocks: controller.retryFailedBlocks,
    canUpdateRows: params.dataSource?.updateRows !== undefined,
    applyCellEdits: controller.applyCellEdits,
    writeError: snapshot.writeError,
  };
}