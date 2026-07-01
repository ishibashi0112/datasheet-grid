import type {
  GridRowKey,
  RowSelectionModel,
  RowSelectionState,
  SelectAllState,
} from '../model/gridTypes';

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
): SelectAllState => {
  const count = countSelectedRows(state, totalRowCount);
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