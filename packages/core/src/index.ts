// @ishibashi0112/spreadsheet-grid-core の公開エントリです。
//   - 型: フレームワーク束ね型 F(GridFrameworkTypes)でパラメータ化した公開型の本体(gridTypes.core)。
//     React 版 / Solid 版はそれぞれの束縛(node / style)を与えたエイリアスを公開します。
//   - エンジン: createGridEngine(派生値リゾルバ / コマンド / 通知 / DOM コントローラ / 外部 store の束ね)。
//   - 各モジュールは `@ishibashi0112/spreadsheet-grid-core/<dir>/<module>` のサブパスで個別に import できます
//     (フレームワーク版のアダプタが使う内部 API。安定性は保証しません)。
export type * from './model/gridTypes.core';
export { createGridEngine } from './engine/createGridEngine';
export type { GridEngine, GridEngineInit } from './engine/createGridEngine';
// 追加(差し込み式 段階 2): createGridEngine に渡す機能セットの型(無い機能は何もしない代役が受ける)と、全機能の表。
//   createGridEngine は渡した機能だけを動かすので、従来どおり全機能を動かすには fullCoreFeatures を渡します。
export type { GridCoreFeatures } from './engine/features';
export { fullCoreFeatures } from './engine/fullFeatures';
export { createGridStore } from './model/gridStore';
export type { GridStore, GridViewState, GridViewStatePatch } from './model/gridStore';
export { gridActions } from './model/gridActions';
export type { GridUiAction } from './model/gridActions';
export { numberFormatter } from './logic/valueFormatters';