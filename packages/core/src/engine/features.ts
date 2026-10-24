// 追加(差し込み式 段階 2): 機能を後から差し込むための「機能セット」の型と、機能が無いときの代役です(React 非依存)。
//   - 機能セットは「機能名 → その機能の部品(コントローラの生成関数 / 純関数 / 描画部品)」の表です。エンジンと
//     シェルは、今まで静的 import していた機能の部品をこの表から取り出して、今までと同じ位置で呼びます(呼ぶ順番は
//     シェルの呼び出し位置のまま = 差し込み式にしても処理の順番は変わらない)。
//   - 全部入りの入口は全機能を入れた表を渡すので、挙動は従来と同じです。機能を外した構成では、その機能のモジュールを
//     import しないので束ねた JS から消えます。
//   - 表に無い機能は「何もしない代役」が受けます。代役はその機能のモジュールを import しない(型だけ)ので、外した
//     構成に機能の本体を持ち込みません。
//   - 描画側(React / 将来の Solid)の機能セットは、この型を広げて描画の部品(検索バー等)を足します。
import type { FindController, FindSnapshot } from '../controllers/findController';
import type { FindIndex } from '../logic/find';
import type { TotalRowCells, TotalRowCellsResolver } from '../logic/totalRow';
import type { ImeInputController } from '../controllers/imeInputController';
import type { canStartImeEdit, resolveImeEditText } from '../logic/imeInput';
import type { ConditionalFormatStatsMap, ConditionalFormatStatsResolver } from '../logic/conditionalFormat';
import type { ChangeHighlightController } from '../controllers/changeHighlightController';

export type GridCoreFeatures = {
  // セル内検索(F-2)。
  find?: {
    createFindController: <T>() => FindController<T>;
  };
  // 合計行(合計行 3A): 列の aggFunc でフィルター後のデータ行を集計するリゾルバ。
  totalRow?: {
    createTotalRowCellsResolver: <T>() => TotalRowCellsResolver<T>;
  };
  // IME オンのままの直接入力(G-2): 透明な入力受けのコントローラ + 入力してよいセルの判定 + 編集の初期値の決定。
  imeDirectInput?: {
    createImeInputController: () => ImeInputController;
    canStartImeEdit: typeof canStartImeEdit;
    resolveImeEditText: typeof resolveImeEditText;
  };
  // 条件付き書式(F-3): データバー / カラースケールの列ごとの min / max をビュー行から集計するリゾルバ。
  conditionalFormat?: {
    createConditionalFormatStatsResolver: <T>() => ConditionalFormatStatsResolver<T>;
  };
  // 動きの追加分(M-2 / M-3 / M-6)のうちエンジン側: 変更セルのフラッシュ + 数値トゥイーン(highlightChanges)。
  motionExtras?: {
    createChangeHighlightController: <T>() => ChangeHighlightController<T>;
  };
};

const EMPTY_FIND_INDEX: FindIndex = new Map();
const CLOSED_FIND_SNAPSHOT: FindSnapshot = {
  open: false,
  query: '',
  matches: [],
  index: EMPTY_FIND_INDEX,
  currentIndex: null,
  scanning: false,
  truncated: false,
};
const noop = () => {};
const unsubscribeNoop = () => noop;

// find が無いときの代役: 常に閉じたまま(開く操作は何もしない)。
export const createInertFindController = <T,>(): FindController<T> => ({
  update: noop,
  open: noop,
  close: noop,
  setQuery: noop,
  next: noop,
  prev: noop,
  subscribe: unsubscribeNoop,
  getSnapshot: () => CLOSED_FIND_SNAPSHOT,
  dispose: noop,
});

// totalRow が無いときの代役: 常に空(シェルは合計行が無効なら呼ばない)。
const EMPTY_TOTAL_ROW_CELLS: TotalRowCells = new Map();
export const createInertTotalRowCellsResolver =
  <T,>(): TotalRowCellsResolver<T> =>
  () =>
    EMPTY_TOTAL_ROW_CELLS;

// imeDirectInput が無いときの代役: 何もしない(入力受けも描画されない)。
export const createInertImeInputController = (): ImeInputController => ({
  update: noop,
  attach: noop,
  dispose: noop,
});

// conditionalFormat が無いときの代役: 常に空(条件付き書式は描かれないので集計しない)。
const EMPTY_CONDITIONAL_FORMAT_STATS: ConditionalFormatStatsMap = new Map();
export const createInertConditionalFormatStatsResolver =
  <T,>(): ConditionalFormatStatsResolver<T> =>
  () =>
    EMPTY_CONDITIONAL_FORMAT_STATS;

// motionExtras が無いときの代役: 変更セルを強調しない。
export const createInertChangeHighlightController = <T,>(): ChangeHighlightController<T> => ({
  update: noop,
  dispose: noop,
});