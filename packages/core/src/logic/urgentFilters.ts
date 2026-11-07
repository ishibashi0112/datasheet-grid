import type { GridFilterState } from '../model/gridTypes.unbound';

// 追加(dogfood DF-18): applyState で入れたフィルターの目印です。
//   シェルは列フィルターとグローバルフィルターの評価を useDeferredValue で遅らせています(set フィルターのチェックを続けて
//   押したときに、行の絞り込みでチェックの反応が詰まらないように)。ところが applyState でフィルターと並べ替えを一度に
//   渡すと、並べ替えだけが先に描かれ、絞り込みは 1〜2 フレーム遅れて出ていました(説明は「1 回の再描画」)。
//   applyState が store へ入れたフィルターの状態(GridFilterState のオブジェクト。reducer はそのまま持つ)をここで覚え、
//   シェルはそれが今のフィルターである間は遅らせずに評価します。画面からフィルターを変えると別のオブジェクトになるので、
//   目印は外れます(従来どおり遅らせる)。WeakSet なので、使い終わった状態は覚えたまま残りません。
const urgentFilterStates = /* @__PURE__ */ new WeakSet<GridFilterState>();

export const markUrgentFilters = (filters: GridFilterState): void => {
  urgentFilterStates.add(filters);
};

export const isUrgentFilters = (filters: GridFilterState): boolean => urgentFilterStates.has(filters);
