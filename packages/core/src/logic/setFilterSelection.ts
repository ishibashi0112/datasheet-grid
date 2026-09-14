// 追加(LINT-1): set フィルターの選択状態の型と mode 判定ヘルパです(純関数)。
//   view ファイルからの非コンポーネント export は react-refresh 制約に触れるため、
//   logic/setFilterSearch.ts と同様に view/ColumnFilterPopover.tsx から移設しています。

// 追加(反転set): set フィルターの選択状態です。null = 全選択(フィルターなし)。
//   巨大側を作らないため「選択集合」ではなく { mode, values } で持ち、values は常に
//   小さい側のみ(include=選択値 / exclude=非選択値)。判定は mode で行います。
export type ColumnFilterSetSelection = {
  mode: 'include' | 'exclude';
  values: ReadonlySet<string>;
};

// 追加(反転set): ある候補値が「選択中」かを mode 適用で判定します(巨大側を materialize しません)。
export const isSetValueSelected = (
  selection: ColumnFilterSetSelection | null,
  value: string,
): boolean =>
  selection === null
    ? true
    : selection.mode === 'include'
      ? selection.values.has(value)
      : !selection.values.has(value);
