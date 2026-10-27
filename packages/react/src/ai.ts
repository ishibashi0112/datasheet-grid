// 追加(ことばで絞り込み): 入口 `@ishibashi0112/spreadsheet-grid/ai` です。利用者の文(「東京の在庫が 10 個以下を高い順に」)を
//   AI に頼んで、グリッドのフィルター / 並び / 検索 / 列の表示へ反映します。グリッドは AI を呼ばず、利用側の ask
//   (自分のサーバー → 好きな AI。API キーはサーバーだけ)で聞きます。行のデータは送りません。
//   全部入り(index)・/lite とは別の入口で、使うときだけ読み込まれます(全部入りの大きさは変わらない)。
export { GridAskBar } from './ai/GridAskBar';
export type { GridAskBarProps } from './ai/GridAskBar';
export { useGridAsk } from './ai/useGridAsk';
export type {
  GridAsk,
  GridAskApplyEvent,
  GridAskSession,
  GridAskTarget,
  UseGridAskOptions,
  UseGridAskResult,
} from './ai/useGridAsk';
// 頼みの組み立てと答えの検査(core)。サーバー側で頼みを確かめたり、自前の UI を作るときに使います。
export {
  createGridAskRequest,
  describeGridAskView,
  gridAskSystemPrompt,
  readGridAskAnswer,
  removeGridAskItem,
} from '@ishibashi0112/spreadsheet-grid-core/logic/gridAsk';
export type {
  GridAskAnswer,
  GridAskFilter,
  GridAskItem,
  GridAskOp,
  GridAskOptions,
  GridAskRequest,
  GridAskResult,
  GridAskSort,
} from '@ishibashi0112/spreadsheet-grid-core/logic/gridAsk';