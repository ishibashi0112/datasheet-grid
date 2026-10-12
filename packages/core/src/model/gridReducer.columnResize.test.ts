// 追加(監査 B-12): 手動リサイズの下限の契約テスト。`minWidth: 0` を明示した列は 0 まで縮められ、未指定は既定 60。
import { describe, it, expect } from 'vitest';
import { gridActions } from './gridActions';
import { createInitialGridUiState, gridUiReducer } from './gridReducer';

const resizeTo = (minWidth: number | undefined, clientX: number) => {
  let s = createInitialGridUiState();
  // 列 a(幅 100)を x=500 から掴んで clientX まで動かします。
  s = gridUiReducer(s, gridActions.startColumnResize('a', 500, 100, minWidth as number));
  s = gridUiReducer(s, gridActions.updateColumnResize(clientX));
  return s.columnWidths.a;
};

describe('gridUiReducer (column/resize の下限)', () => {
  it('minWidth: 0 を明示した列は 0 まで縮められる', () => {
    expect(resizeTo(0, 300)).toBe(0);
  });

  it('minWidth を渡さなければ既定の 60 が下限、明示値はその値が下限', () => {
    expect(resizeTo(undefined, 300)).toBe(60);
    expect(resizeTo(30, 300)).toBe(30);
  });
});