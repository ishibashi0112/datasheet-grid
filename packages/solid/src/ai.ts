// 追加(段 3-1): 入口 `@ishibashi0112/spreadsheet-grid-solid/ai` です(React 版の `/ai` と同じ)。利用者の文(「東京の在庫が
//   10 個以下を高い順に」)を AI に頼んで、グリッドのフィルター / 並び / 検索 / 列の表示へ反映します。グリッドは AI を呼ばず、
//   利用側の ask(自分のサーバー → 好きな AI。API キーはサーバーだけ)で聞きます。行のデータは送りません。
//   全部入りの入口とは別の入口で、使うときだけ読み込まれます(入口の大きさは変わらない)。
//   React 版の useGridAsk は Solid の慣例の名前で createGridAsk です。
export { GridAskBar } from './ai/GridAskBar';
export type { GridAskBarProps } from './ai/GridAskBar';
export { createGridAsk } from './ai/createGridAsk';
export type {
  CreateGridAskOptions,
  CreateGridAskResult,
  GridAsk,
  GridAskApplyEvent,
  GridAskSession,
  GridAskTarget,
} from './ai/createGridAsk';
// 頼みの組み立てと答えの検査(core)。サーバー側で頼みを確かめたり、自前の UI を作るときに使います(React 版と同じ)。
export {
  createGridAskRequest,
  describeGridAskView,
  gridAskSystemPrompt,
  isGridAskColumnsChanged,
  isSameGridAskView,
  readGridAskAnswer,
  removeGridAskItem,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAsk';
export type {
  GridAskAnswer,
  GridAskFilter,
  GridAskItem,
  GridAskOp,
  GridAskOptions,
  GridAskRequest,
  GridAskResult,
  GridAskSort,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAsk';
// バーの文言(GridAskBar / createGridAsk の localeText)の型。英語は入口 /locales/en の gridAskLocaleTextEn。
export type { GridAskLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAskLocaleText';