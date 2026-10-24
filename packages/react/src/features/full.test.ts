// 追加(差し込み式 段階 2): 全部入りの機能セット(React 版 features/full.ts)のエンジン側の部品が、core の全機能の表
//   (fullCoreFeatures)と同じ関数であることを確かめます(片方だけ差し替わって全部入りの挙動がずれるのを防ぐ)。
import { describe, it, expect } from 'vitest';
import { fullCoreFeatures } from '@ishibashi0112/spreadsheet-grid-core/engine/fullFeatures';
import { fullGridFeatures } from './full';

describe('fullGridFeatures', () => {
  it('core の部品は fullCoreFeatures と同じ関数を使う', () => {
    for (const [name, coreParts] of Object.entries(fullCoreFeatures)) {
      const reactParts = fullGridFeatures[name as keyof typeof fullCoreFeatures] as Record<string, unknown>;
      for (const [key, value] of Object.entries(coreParts)) {
        expect(reactParts[key], `${name}.${key}`).toBe(value);
      }
    }
  });
});