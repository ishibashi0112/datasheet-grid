// 追加(差し込み式 段階 2): 使う機能だけを差し込んだグリッドのコンポーネントを作ります(/lite の入口で公開する予定。
//   今は内部用 = 機能を外した構成のテストとサイズ計測で使う)。
//   - features に無い機能のモジュールは import されないので、束ねた JS から消えます。
//   - 無い機能の prop は何もしません(開発時に 1 回だけ警告)。
//   - モジュールの読み込み時(コンポーネントの外)で 1 回だけ呼んでください。作ったコンポーネントの機能セットは固定です。
import { useGridShell } from './GridShell';
import { resolveGridShellFeatures } from './features/resolve';
import type { ReactGridFeatures } from './features/types';
import { useUnregisteredFeatureWarnings } from './hooks/useUnregisteredFeatureWarnings';
import type { SpreadsheetGridProps } from './model/gridTypes';

export type CreateSpreadsheetGridOptions = {
  features: ReactGridFeatures;
};

export function createSpreadsheetGrid({ features }: CreateSpreadsheetGridOptions) {
  const shellFeatures = resolveGridShellFeatures(features);
  return function SpreadsheetGrid<T extends object>(props: SpreadsheetGridProps<T>) {
    useUnregisteredFeatureWarnings(props, features);
    return useGridShell(props, shellFeatures);
  };
}