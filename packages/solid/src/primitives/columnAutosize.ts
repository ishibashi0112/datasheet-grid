// 列幅の自動調整のランナー(core controllers/columnAutosizeRunner。計測は時間分割)を Solid へつなぎます。React 版の
//   hooks/useColumnAutosizeRunner.ts にあたるものです。args を組み立てる関数を受け取り、最新の値を update で渡し、計測中か
//   (Pending の overlay とカーソル)を signal で返します。runAutosize の参照は変わりません。
import {
  createColumnAutosizeRunner,
  type ColumnAutosizeRunnerArgs,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/columnAutosizeRunner';
import type { GridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export type ColumnAutosize<T> = {
  isAutosizing: () => boolean;
  runAutosize: (columns: GridColumn<T>[]) => Promise<void>;
};

export function createColumnAutosize<T>(args: () => ColumnAutosizeRunnerArgs<T>): ColumnAutosize<T> {
  const runner = createColumnAutosizeRunner<T>();
  connectController(runner, args, 'render', 'columnAutosize');
  const isAutosizing = createExternalStoreSignal(runner, 'columnAutosizeStore');
  return { isAutosizing, runAutosize: runner.runAutosize };
}