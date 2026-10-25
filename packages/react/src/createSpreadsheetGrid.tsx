// 追加(差し込み式 段階 2): 使う機能だけを差し込んだグリッドのコンポーネントを作ります(段階 6 で /lite の入口から公開)。
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
  /** 差し込む機能(`{ filtering: filteringFeature, ... }`)。キーは機能の名前、値は `/lite` が公開する機能の部品です。 */
  features: ReactGridFeatures;
};

// 機能が無いときに置き換える prop(シェルが機能の部品を呼ぶ前に、その prop で列や行の形を決めるもの)。
const DISABLED_FEATURE_PROPS: { [K in keyof ReactGridFeatures]?: Partial<SpreadsheetGridProps<object>> } = {
  rowDrag: { enableRowDrag: false },
  // 行の高さの実測が無ければ autoHeight を切る(行数の上限超えなどの開発時の注意も出さない)。
  autoHeight: { autoHeight: false },
  // フィルターが無ければグローバル / 列フィルターを切る(上部バーの入力欄・見出しのフィルターボタン・ツールパネルの
  //   フィルタータブを出さない。serverSide の query にも載せない)。上部バーの要約チップ(Filter: なし)は両方を
  //   false にした全部入りと同じく残る。
  filtering: { enableColumnFilter: false, enableGlobalFilter: false },
  // サーバーサイド行モデルが無ければ dataSource を外す(clientSide。rows を渡していなければ空の表)。
  serverSide: { dataSource: undefined },
  // ラベル行が無ければ labelRow を外す(述語に当たる行もデータ行として並ぶ。エクスポートの対象からも外さない)。
  labelRow: { labelRow: undefined },
  columnAutosize: { autoSizeColumns: false },
  contextMenu: { enableContextMenu: false },
  motionExtras: { highlightChanges: false, showCopyRange: false, hoverHighlight: 'row' },
};

/**
 * 使う機能だけを差し込んだグリッドのコンポーネントを作ります(`@ishibashi0112/spreadsheet-grid/lite`)。
 * 差し込まなかった機能のコードはバンドルに入りません。props・ref ハンドル・型は `SpreadsheetGrid` と共通で、
 * 差し込んでいない機能の prop やメソッドは何もしません(開発時だけ、prop と、prop を持たない機能のメソッド
 * (`exportCsv` / `openFilterManager` など)を console.warn で知らせます)。
 * モジュールの先頭で 1 回だけ呼んでください(コンポーネントの中で呼ばない)。機能の組み合わせは作ったときに固定されます。
 *
 * @example
 * import { createSpreadsheetGrid, standardFeatures, serverSideFeature } from '@ishibashi0112/spreadsheet-grid/lite';
 * import '@ishibashi0112/spreadsheet-grid/style.css';
 *
 * const Grid = createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } });
 */
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