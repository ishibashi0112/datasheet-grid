// 変更(非依存化 ③-9): 本体は controllers/columnAutosizeRunner.ts(React 非依存)へ移設し、本 hook は
//   useController で最新 args を渡し、isAutosizing(overlay 表示)を useSyncExternalStore で購読する
//   薄いアダプタです。runAutosize の参照は安定します。
import { useSyncExternalStore } from 'react';
import {
  createColumnAutosizeRunner,
  type ColumnAutosizeRunnerArgs,
} from '../controllers/columnAutosizeRunner';
import { useController } from './useController';

export const useColumnAutosizeRunner = <T,>(args: ColumnAutosizeRunnerArgs<T>) => {
  const runner = useController(() => createColumnAutosizeRunner<T>(), args);
  const isAutosizing = useSyncExternalStore(
    runner.subscribe,
    runner.getSnapshot,
    runner.getSnapshot,
  );
  return { isAutosizing, runAutosize: runner.runAutosize };
};

export default useColumnAutosizeRunner;