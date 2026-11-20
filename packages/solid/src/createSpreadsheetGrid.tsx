// 使う機能だけを差し込んだグリッドの部品を作ります(React 版の createSpreadsheetGrid と同じ形)。
//   - features に無い機能のモジュールは import されないので、束ねた JS から消えます。
//   - 無い機能の prop は何もしません。シェルが機能の有無より前に分岐に使う prop は、無い機能なら「使わない」値に置き換えて
//     渡します(DISABLED_FEATURE_PROPS。React 版と同じ表を、Solid 版に入った機能の分だけ)。
//   - 開発時だけ、無い機能の prop とメソッド(exportCsv / openFilterManager など)を console.warn で知らせます(devWarnings.ts。
//     React 版と同じ文言と回数)。
import { merge } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { GridShell } from './SpreadsheetGrid';
import { createUnregisteredFeatureWarnings, withMethodWarningFeatures } from './devWarnings';
import type { GridFeatureName, GridFeatures, SolidGridFeatures } from './features/types';
import type { SpreadsheetGridProps } from './model/gridTypes';

export type CreateSpreadsheetGridOptions = {
  /** 差し込む機能(`{ export: exportFeature, ... }`)。キーは機能の名前、値は機能の部品です。 */
  features: GridFeatures;
};

// 機能が無いときに置き換える prop(シェルが機能の部品を呼ぶ前に、その prop で列や行の形を決めるもの)。
const DISABLED_FEATURE_PROPS: { [K in GridFeatureName]?: Partial<SpreadsheetGridProps<object>> } = {
  // 行ドラッグが無ければ enableRowDrag を切る(ハンドル列もガイド線も出ない。React 版と同じ)。
  rowDrag: { enableRowDrag: false },
  // 行の高さの実測が無ければ autoHeight を切る。
  autoHeight: { autoHeight: false },
  // 動きの追加分が無ければ、変わったセルのフラッシュ / コピー範囲の点線 / クロスヘアを止める(React 版と同じ)。
  motionExtras: { highlightChanges: false, showCopyRange: false, hoverHighlight: 'row' },
  // 列幅の自動調整が無ければ autoSizeColumns を切る(React 版と同じ)。
  columnAutosize: { autoSizeColumns: false },
  // 右クリックメニューが無ければ enableContextMenu を切る(ブラウザの標準のメニューのまま。React 版と同じ)。
  contextMenu: { enableContextMenu: false },
  // フィルターが無ければグローバル / 列フィルターを切る(上部バーの検索欄を出さない。上部バーの要約チップは残る。React 版と同じ)。
  filtering: { enableColumnFilter: false, enableGlobalFilter: false },
  // ラベル行が無ければ labelRow を外す(述語に当たる行もデータ行として並ぶ。エクスポートの対象からも外さない。React 版と同じ。
  //   Solid の merge は undefined でも上書きする)。
  labelRow: { labelRow: undefined },
  // サーバーサイドの行モデルが無ければ dataSource を外す(clientSide として rows を描く。React 版と同じ)。
  serverSide: { dataSource: undefined },
};

export function createSpreadsheetGrid(options: CreateSpreadsheetGridOptions) {
  const features = options.features as unknown as SolidGridFeatures;
  const overrides: Partial<SpreadsheetGridProps<object>> = {};
  for (const name of Object.keys(DISABLED_FEATURE_PROPS) as GridFeatureName[]) {
    if (features[name] === undefined) {
      Object.assign(overrides, DISABLED_FEATURE_PROPS[name]);
    }
  }
  const hasOverrides = Object.keys(overrides).length > 0;
  const shellFeatures = withMethodWarningFeatures(features);
  return function SpreadsheetGrid<T extends object>(props: SpreadsheetGridProps<T>): JSX.Element {
    // 機能が無いときの置き換えの前の props で見る(使われたのに効かない prop を知らせる)。
    createUnregisteredFeatureWarnings(props, features);
    // merge は props の getter を保ったまま上書きします(スプレッドで写すと props の追従が切れる)。
    return GridShell<T>(hasOverrides ? merge(props, overrides as Partial<SpreadsheetGridProps<T>>) : props, shellFeatures);
  };
}