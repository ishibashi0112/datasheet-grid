import type {
  GridRowKey,
  RowSelectionModel,
  RowSelectionState,
  SelectAllState,
} from '../model/gridTypes.unbound';

// 型は gridTypes.ts に集約し(GridUiState から参照するため循環を避ける)、
//   ここでは利便のため再エクスポートします。
export type { RowSelectionModel, RowSelectionState, SelectAllState };

// ────────────────────────────────────────────────
// 追加(行選択): チェックボックス行選択の純ロジックです。
//   参照性能を落とさないため、判定は Set の O(1) メンバーシップに閉じ、
//   「全選択」は除外集合(exclude モード)で表現してキーを materialize しません
//   (1M 行でも件数・判定が一定コスト)。状態は immutable に作り替えます。
//
//   ここは純関数のみ。view index → key の解決や controlled/uncontrolled の
//   取り回しは呼び出し側(コンポーネント/フック)の責務です。
// ────────────────────────────────────────────────

// 空(未選択)状態を生成します。
export const createEmptyRowSelection = (): RowSelectionState => ({
  mode: 'include',
  keys: new Set<GridRowKey>(),
});

// 指定キーが選択されているかを O(1) で判定します。
export const resolveIsRowSelected = (
  state: RowSelectionState,
  rowKey: GridRowKey,
): boolean =>
  state.mode === 'exclude' ? !state.keys.has(rowKey) : state.keys.has(rowKey);

// 1 キーの選択トグルです(mode は保持。include は集合へ加減、exclude は除外集合へ加減)。
export const toggleRowKey = (
  state: RowSelectionState,
  rowKey: GridRowKey,
): RowSelectionState => {
  const keys = new Set<GridRowKey>(state.keys);
  if (keys.has(rowKey)) {
    keys.delete(rowKey);
  } else {
    keys.add(rowKey);
  }
  return { mode: state.mode, keys };
};

// 単一選択(single モード / 修飾なしクリック)。指定行だけを選択します。
export const selectSingleRow = (rowKey: GridRowKey): RowSelectionState => ({
  mode: 'include',
  keys: new Set<GridRowKey>([rowKey]),
});

// 範囲選択(shift+click / ガタードラッグ)。指定範囲キーだけを include で選択します
//   (予測しやすいよう置換。base を温存したい場合は addRowRange を使います)。
export const selectRowRange = (rangeKeys: GridRowKey[]): RowSelectionState => ({
  mode: 'include',
  keys: new Set<GridRowKey>(rangeKeys),
});

// base の選択へ範囲キーを加えます(ドラッグ中に base ∪ range としたい用途)。
//   exclude モードでは「範囲を除外集合から外す」= 選択に含める、として一貫させます。
export const addRowRange = (
  base: RowSelectionState,
  rangeKeys: GridRowKey[],
): RowSelectionState => {
  const keys = new Set<GridRowKey>(base.keys);
  if (base.mode === 'exclude') {
    for (const key of rangeKeys) {
      keys.delete(key);
    }
    return { mode: 'exclude', keys };
  }
  for (const key of rangeKeys) {
    keys.add(key);
  }
  return { mode: 'include', keys };
};

// 全選択です(exclude モード・除外集合は空)。件数・判定を一定コストに保ちます。
export const selectAllRows = (): RowSelectionState => ({
  mode: 'exclude',
  keys: new Set<GridRowKey>(),
});

// 追加(1.0.1 / 実アプリの総点検 AP-03): 指定キーを選択から外します(mode は保持。exclude は除外集合へ加える)。
//   フィルター中の見出しのチェックボックスで「見えている行だけ外す」ときに使います。
export const removeRowKeys = (
  state: RowSelectionState,
  rowKeys: readonly GridRowKey[],
): RowSelectionState => {
  const keys = new Set<GridRowKey>(state.keys);
  for (const key of rowKeys) {
    if (state.mode === 'exclude') {
      keys.add(key);
    } else {
      keys.delete(key);
    }
  }
  return { mode: state.mode, keys };
};

// 追加(1.0.1 / AP-03): order(フィルター後のデータ行の並び)のうち選択されている行の数です。フィルター中の見出しの
//   チェックボックスの 3 状態は、見えている行だけで数えます(見えない行の選択を数えると「すべて」に見えていた)。
export const countSelectedRowsInOrder = <T,>(
  state: RowSelectionState,
  rows: readonly T[],
  order: ArrayLike<number>,
  rowKeyGetter: (row: T, index: number) => GridRowKey,
): number => {
  let count = 0;
  for (let i = 0; i < order.length; i += 1) {
    const sourceIndex = order[i];
    if (resolveIsRowSelected(state, rowKeyGetter(rows[sourceIndex], sourceIndex))) {
      count += 1;
    }
  }
  return count;
};

// 追加(1.0.1 のレビュー RA-7): countSelectedRowsInOrder を、選択・行・並びが同じ間は数え直さずに返す版です。
//   rowKeyGetter をインラインで渡すと参照が描くたびに変わり、フィルター中の見出しの 3 状態を描くたび(スクロールの各フレーム
//   など)に見えている行の数だけ数えていた(90 万行で 1 回約 13ms)。rowKeyGetter の参照だけが変わったときは前の数を使います
//   (同じ行から別のキーを返すように変えるときは、rows も新しい配列にする)。
export const createSelectedRowsInOrderCounter = () => {
  let last: { state: RowSelectionState; rows: readonly unknown[]; order: ArrayLike<number>; count: number } | null = null;
  return <T,>(
    state: RowSelectionState,
    rows: readonly T[],
    order: ArrayLike<number>,
    rowKeyGetter: (row: T, index: number) => GridRowKey,
  ): number => {
    if (last !== null && last.state === state && last.rows === rows && last.order === order) {
      return last.count;
    }
    const count = countSelectedRowsInOrder(state, rows, order, rowKeyGetter);
    last = { state, rows, order, count };
    return count;
  };
};

// 全解除(空の include)です。
export const clearRowSelection = (): RowSelectionState =>
  createEmptyRowSelection();

// 選択件数です。exclude モードは総行数が必要です(total − 除外数)。
export const countSelectedRows = (
  state: RowSelectionState,
  totalRowCount: number,
): number =>
  state.mode === 'exclude'
    ? Math.max(0, totalRowCount - state.keys.size)
    : state.keys.size;

// ヘッダ全選択チェックの 3 状態(none / some / all)を求めます。
export const getSelectAllState = (
  state: RowSelectionState,
  totalRowCount: number,
): SelectAllState => resolveSelectAllState(countSelectedRows(state, totalRowCount), totalRowCount);

// 追加(1.0.1 / AP-03): 選択件数と総数から 3 状態を求めます(フィルター中は見えている行だけで数えた件数を渡す)。
export const resolveSelectAllState = (count: number, totalRowCount: number): SelectAllState => {
  if (count <= 0) {
    return 'none';
  }
  if (totalRowCount > 0 && count >= totalRowCount) {
    return 'all';
  }
  return 'some';
};

// 内部状態 → 公開記述子へ変換します。
export const rowSelectionToModel = (
  state: RowSelectionState,
): RowSelectionModel => ({
  type: state.mode,
  rowKeys: Array.from(state.keys),
});

// 公開記述子 → 内部状態へ変換します。
export const rowSelectionFromModel = (
  model: RowSelectionModel,
): RowSelectionState => ({
  mode: model.type,
  keys: new Set<GridRowKey>(model.rowKeys),
});

// 内部状態の等価判定です(順不同)。controlled 同期や onChange の空振り抑制に使います。
export const rowSelectionStateEquals = (
  a: RowSelectionState,
  b: RowSelectionState,
): boolean => {
  if (a.mode !== b.mode) {
    return false;
  }
  if (a.keys.size !== b.keys.size) {
    return false;
  }
  for (const key of a.keys) {
    if (!b.keys.has(key)) {
      return false;
    }
  }
  return true;
};

// 公開記述子の等価判定です(順不同)。
export const rowSelectionModelEquals = (
  a: RowSelectionModel,
  b: RowSelectionModel,
): boolean =>
  rowSelectionStateEquals(rowSelectionFromModel(a), rowSelectionFromModel(b));