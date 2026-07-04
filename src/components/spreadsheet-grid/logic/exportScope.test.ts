import { describe, it, expect } from 'vitest';

import { normalizeExportScope } from './exportScope';
import type { NormalizedCsvExportScope } from './exportScope';
import type { CsvExportScope } from '../model/gridTypes';

describe('normalizeExportScope', () => {
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
});