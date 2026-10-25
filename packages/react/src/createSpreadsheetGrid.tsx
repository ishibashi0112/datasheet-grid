// 追加(差し込み式 段階 2): 使う機能だけを差し込んだグリッドのコンポーネントを作ります(/lite の入口で公開する予定。
//   今は内部用 = 機能を外した構成のテストとサイズ計測で使う)。
//   - features に無い機能のモジュールは import されないので、束ねた JS から消えます。
//   - 無い機能の prop は何もしません(開発時に 1 回だけ警告)。シェルが機能の有無より前に分岐に使う prop は、
//     無い機能なら「使わない」値に置き換えて渡します(例: 行ドラッグが無ければ enableRowDrag を false = ハンドル列を作らない)。
//   - モジュールの読み込み時(コンポーネントの外)で 1 回だけ呼んでください。作ったコンポーネントの機能セットは固定です。
import { useGridShell } from './GridShell';
import { resolveGridShellFeatures } from './features/resolve';
import type { ReactGridFeatures } from './features/types';
import { useUnregisteredFeatureWarnings } from './hooks/useUnregisteredFeatureWarnings';
import type { SpreadsheetGridProps } from './model/gridTypes';

export type CreateSpreadsheetGridOptions = {
  features: ReactGridFeatures;
};

// 機能が無いときに置き換える prop(シェルが機能の部品を呼ぶ前に、その prop で列や行の形を決めるもの)。
const DISABLED_FEATURE_PROPS: { [K in keyof ReactGridFeatures]?: Partial<SpreadsheetGridProps<object>> } = {
  rowDrag: { enableRowDrag: false },
  // 行の高さの実測が無ければ autoHeight を切る(行数の上限超えなどの開発時の注意も出さない)。
  autoHeight: { autoHeight: false },
  // フィルターが無ければグローバル / 列フィルターを切る(上部バーの入力欄・見出しのフィルターボタン・ツールパネルの
  //   フィルタータブを出さない。serverSide の query にも載せない)。
  filtering: { enableColumnFilter: false, enableGlobalFilter: false },
  columnAutosize: { autoSizeColumns: false },
  contextMenu: { enableContextMenu: false },
  motionExtras: { highlightChanges: false, showCopyRange: false, hoverHighlight: 'row' },
};

export function createSpreadsheetGrid({ features }: CreateSpreadsheetGridOptions) {
  const shellFeatures = resolveGridShellFeatures(features);
  const overrides: Partial<SpreadsheetGridProps<object>> = {};
  for (const name of Object.keys(DISABLED_FEATURE_PROPS) as (keyof ReactGridFeatures)[]) {
    if (features[name] === undefined) {
      Object.assign(overrides, DISABLED_FEATURE_PROPS[name]);
    }
  }
  const hasOverrides = Object.keys(overrides).length > 0;
  return function SpreadsheetGrid<T extends object>(props: SpreadsheetGridProps<T>) {
    useUnregisteredFeatureWarnings(props, features);
    return useGridShell(hasOverrides ? { ...props, ...(overrides as Partial<SpreadsheetGridProps<T>>) } : props, shellFeatures);
  };
}