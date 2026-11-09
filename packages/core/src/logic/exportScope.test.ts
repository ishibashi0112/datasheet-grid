import { afterEach, describe, it, expect, vi } from 'vitest';

import { normalizeExportScope } from './exportScope';
import { resetDeprecationWarningsForTest } from '../utils/deprecation';
import type { NormalizedCsvExportScope } from './exportScope';
import type { CsvExportScope } from '../model/gridTypes.unbound';

describe('normalizeExportScope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDeprecationWarningsForTest();
  });

  it('新 4 値はそのまま返す', () => {
    const passthrough: NormalizedCsvExportScope[] = [
      'view',
      'raw',
      'rendered',
      'selection',
    ];
    for (const scope of passthrough) {
      expect(normalizeExportScope(scope)).toBe(scope);
    }
  });

  it("後方互換: 'all' は 'view' へ写す(挙動は従来の 'all' = ビュー行全体と同一)", () => {
    expect(normalizeExportScope('all')).toBe('view');
  });

  it("後方互換: 'visible' は 'rendered' へ写す(挙動は従来の 'visible' = 描画ウィンドウと同一)", () => {
    expect(normalizeExportScope('visible')).toBe('rendered');
  });

  it('全入力が正規化後 4 値のいずれかに落ちる(エイリアスが漏れない)', () => {
    const all: CsvExportScope[] = [
      'view',
      'raw',
      'rendered',
      'selection',
      'all',
      'visible',
    ];
    const normalized = new Set(all.map(normalizeExportScope));
    expect(normalized).toEqual(new Set(['view', 'raw', 'rendered', 'selection']));
  });

  // 追加(1.0 の準備): 旧エイリアスは 1.0.0 で消すので、開発時に 1 回だけ警告する(新 4 値は警告しない)。
  it("'all' / 'visible' は開発時にそれぞれ 1 回だけ非推奨の警告を出す", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeExportScope('view');
    normalizeExportScope('rendered');
    expect(warn).not.toHaveBeenCalled();
    normalizeExportScope('all');
    normalizeExportScope('all');
    normalizeExportScope('visible');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("scope `'all'` は 1.0.0 で消します。`'view'` を使ってください");
    expect(warn.mock.calls[1]?.[0]).toContain("Use `'rendered'` instead");
  });
});