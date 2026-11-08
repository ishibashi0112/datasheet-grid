// @ishibashi0112/spreadsheet-grid-core の公開エントリです。
//   - 型: フレームワーク束ね型 F(GridFrameworkTypes)でパラメータ化した公開型の本体(gridTypes.core)。
//     React 版 / Solid 版はそれぞれの束縛(node / style)を与えたエイリアスを公開します。
//   - エンジン: createGridEngine(派生値リゾルバ / コマンド / 通知 / DOM コントローラ / 外部 store の束ね)。
//   - 各モジュールは `@ishibashi0112/spreadsheet-grid-core/internal/<dir>/<module>` のサブパスで個別に import できます
//     (フレームワーク版のアダプタが使う内部 API。semver の対象外で、どの版でも変わります)。
//     変更(semver / 1.0 の準備): 旧サブパス `@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`(exports の `./*`)は 0.60.0 で非推奨にし、
//     0.61.0 で消しました。React 版は同じ版の core に固定で依存します。
export type * from './model/gridTypes.core';
export { createGridEngine } from './engine/createGridEngine';
export type { GridEngine, GridEngineInit } from './engine/createGridEngine';
// 追加(差し込み式 段階 2): createGridEngine に渡す機能セットの型(無い機能は何もしない代役が受ける)と、全機能の表。
//   createGridEngine は渡した機能だけを動かすので、従来どおり全機能を動かすには fullCoreFeatures を渡します。
export type { AutoHeightFeature, ColumnFilteringFeature, GridCoreFeatures, GroupingFeature, LabelRowFeature } from './engine/features';
export { fullCoreFeatures } from './engine/fullFeatures';
export { createGridStore } from './model/gridStore';
export type { GridStore, GridViewState, GridViewStatePatch } from './model/gridStore';
export { gridActions } from './model/gridActions';
export type { GridUiAction } from './model/gridActions';
export { numberFormatter } from './logic/valueFormatters';
// 追加(段階 2 の確かめ直し): 保存した状態の列メタ(並び / 表示 / 固定)を列定義へ当てる(initialState と一緒に使う)。
export { restoreColumnsFromState } from './logic/gridState';
// 追加(ことばで絞り込み): AI に渡す頼みの組み立てと、AI の答えの検査(→ GridState)。グリッドは AI を呼ばず、利用側の
//   ask(自分のサーバー → 好きな AI)が頼みを受けて答えを返します。React 版は入口 /ai(GridAskBar / useGridAsk)が使います。
export {
  createGridAskRequest,
  describeGridAskView,
  gridAskSystemPrompt,
  isGridAskColumnsChanged,
  isSameGridAskView,
  readGridAskAnswer,
  removeGridAskItem,
} from './logic/gridAsk';
export type {
  GridAskAnswer,
  GridAskFilter,
  GridAskItem,
  GridAskOp,
  GridAskOptions,
  GridAskRequest,
  GridAskResult,
  GridAskSort,
} from './logic/gridAsk';