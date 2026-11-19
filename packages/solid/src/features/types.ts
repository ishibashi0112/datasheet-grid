// Solid 版の機能セットの型です(React 版の features/types.ts にあたるもの)。エンジン(core)の機能セット(GridCoreFeatures)を
//   広げ、シェルが描画に使う部品(Solid の部品 / 純関数)を足します。各機能の値は features/<機能名>.ts にあり、全部入りの表は
//   features/full.ts です。
//   - React 版と違い、Solid には hook の呼ぶ順番の決まりが無いので、無い機能の代役は要りません(シェルは features.X が
//     あるときだけ部品を作る / 描く)。
//   - 機能の部品は中身の見えない GridFeature<K> で公開します(React 版と同じ。利用側が推論のまま export しても d.ts を書ける)。
//   段階 2 で 21 の機能を順に足します(足した機能だけがこの表にある)。
import type { GridCoreFeatures } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/features';

export type SolidGridFeatures = {
  // エクスポート(命令的 API の exportCsv / downloadCsv / getExportData)。描画の部品は無い。
  export?: NonNullable<GridCoreFeatures['export']> | undefined;
};

declare const gridFeatureBrand: unique symbol;
/** 機能セットのキー(`createSpreadsheetGrid` の `features` のキー)。 */
export type GridFeatureName = keyof SolidGridFeatures;
/** 機能の部品(`exportFeature` など)の型。中身は内部の実装で、型からは見えません。`K` はその部品を入れる機能セットのキーです。 */
export interface GridFeature<K extends GridFeatureName> {
  readonly [gridFeatureBrand]: K;
}
/** `createSpreadsheetGrid` の `features` の型(機能セットのキー → その機能の部品)。どの機能も省略できます。 */
export type GridFeatures = { [K in GridFeatureName]?: GridFeature<K> | undefined };
// 機能の部品の中身の型(内部)。features/<名前> が satisfies で使います。
export type GridFeatureParts<K extends GridFeatureName> = NonNullable<SolidGridFeatures[K]>;
