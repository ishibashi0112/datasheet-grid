import type {
  DateFilterPreset,
  DateFilterPresetOption,
  DateFilterPresetRange,
} from '../model/gridTypes';

// 追加(preset-opt): dateSet フィルターの相対プリセット構成(GridColumn.dateFilterPresets)を
//   UI / 評価 / 要約が共有できる正規形へ均す純ロジックです。
//   filtering.ts(評価)と dateFilterCondition.ts(UI 純ロジック)の両方から参照されるため、
//   循環 import を避けて独立モジュールに置きます(依存は gridTypes の型のみ)。

// UI(チップ描画)・評価(resolve 逆引き)・要約(ラベル逆引き)が使う正規形です。
//   resolve 未定義 = ビルトイン ID(評価側の既定実装 resolveDateFilterPreset が解決します)。
export type NormalizedDateFilterPreset = {
  id: string;
  label: string;
  resolve?: (now: Date) => DateFilterPresetRange;
};

// ビルトイン 3 種の表示順とラベルです(従来の DATE_FILTER_PRESET_OPTIONS と同値)。
export const BUILTIN_DATE_FILTER_PRESET_OPTIONS: ReadonlyArray<{
  value: DateFilterPreset;
  label: string;
}> = [
  { value: 'today', label: '今日' },
  { value: 'thisMonth', label: '今月' },
  { value: 'last30days', label: '過去 30 日' },
];

// ビルトイン ID の判定です(保存値は string のため、評価側の分岐で使います)。
export const isBuiltinDateFilterPreset = (
  id: string,
): id is DateFilterPreset =>
  BUILTIN_DATE_FILTER_PRESET_OPTIONS.some((option) => option.value === id);

const builtinLabel = (id: DateFilterPreset): string =>
  BUILTIN_DATE_FILTER_PRESET_OPTIONS.find((option) => option.value === id)
    ?.label ?? id;

// GridColumn.dateFilterPresets を正規形の配列へ均します。
//   - undefined: ビルトイン 3 種(従来挙動)。
//   - false / []: 空配列(チップ行非表示)。
//   - 配列: 表示順を保ったままビルトイン ID はラベル補完、カスタムはそのまま。
export const normalizeDateFilterPresets = (
  option: false | readonly DateFilterPresetOption[] | undefined,
): NormalizedDateFilterPreset[] => {
  if (option === false) {
    return [];
  }
  if (option === undefined) {
    return BUILTIN_DATE_FILTER_PRESET_OPTIONS.map(({ value, label }) => ({
      id: value,
      label,
    }));
  }
  return option.map((entry) =>
    typeof entry === 'string'
      ? { id: entry, label: builtinLabel(entry) }
      : { id: entry.id, label: entry.label, resolve: entry.resolve },
  );
};

// 保存済みプリセット ID の表示ラベルです(要約 / チップバー / popover サマリー用)。
//   カスタム構成 → ビルトイン既定 → 生 ID の順でフォールバックします(列定義から
//   消えた ID でも表示が壊れないため)。
export const dateFilterPresetLabel = (
  id: string,
  presets?: readonly NormalizedDateFilterPreset[],
): string => {
  const fromPresets = presets?.find((preset) => preset.id === id)?.label;
  if (fromPresets !== undefined) {
    return fromPresets;
  }
  return isBuiltinDateFilterPreset(id) ? builtinLabel(id) : id;
};
