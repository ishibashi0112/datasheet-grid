// 追加(preset-opt): dateSet プリセット構成(GridColumn.dateFilterPresets)の正規化と
//   ラベル逆引きの単体テストです(評価側の解決は filtering.test.ts でカバー)。
import { describe, it, expect } from 'vitest';

import {
  BUILTIN_DATE_FILTER_PRESET_OPTIONS,
  dateFilterPresetLabel,
  isBuiltinDateFilterPreset,
  normalizeDateFilterPresets,
} from './dateFilterPresets';

describe('normalizeDateFilterPresets', () => {
  it('未指定はビルトイン 3 種(従来挙動)', () => {
    expect(normalizeDateFilterPresets(undefined)).toEqual([
      { id: 'today', label: '今日' },
      { id: 'thisMonth', label: '今月' },
      { id: 'last30days', label: '過去 30 日' },
    ]);
  });

  it('false / 空配列は空(チップ行非表示のオプトアウト)', () => {
    expect(normalizeDateFilterPresets(false)).toEqual([]);
    expect(normalizeDateFilterPresets([])).toEqual([]);
  });

  it('ビルトイン ID の再利用とカスタム定義を表示順のまま混在できる', () => {
    const resolve = () => ({ from: '2026-01-01' });
    expect(
      normalizeDateFilterPresets([
        { id: 'thisWeek', label: '今週', resolve },
        'today',
      ]),
    ).toEqual([
      { id: 'thisWeek', label: '今週', resolve },
      { id: 'today', label: '今日' },
    ]);
  });
});

describe('dateFilterPresetLabel / isBuiltinDateFilterPreset', () => {
  it('カスタム構成 → ビルトイン既定 → 生 ID の順でフォールバックする', () => {
    const presets = normalizeDateFilterPresets([
      { id: 'thisWeek', label: '今週', resolve: () => ({}) },
    ]);
    expect(dateFilterPresetLabel('thisWeek', presets)).toBe('今週');
    // 構成に無いビルトイン ID(保存済みフィルターの後方互換)。
    expect(dateFilterPresetLabel('last30days', presets)).toBe('過去 30 日');
    // どこにも無い ID は生 ID のまま(表示が壊れないためのフォールバック)。
    expect(dateFilterPresetLabel('ghost', presets)).toBe('ghost');
    expect(dateFilterPresetLabel('today')).toBe('今日');
  });

  it('ビルトイン ID 判定は 3 種のみ真', () => {
    for (const option of BUILTIN_DATE_FILTER_PRESET_OPTIONS) {
      expect(isBuiltinDateFilterPreset(option.value)).toBe(true);
    }
    expect(isBuiltinDateFilterPreset('thisWeek')).toBe(false);
  });
});
