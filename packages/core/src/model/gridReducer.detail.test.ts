// detail batch 2: 展開行(detail)の開閉 action / reducer の契約テスト。
import { describe, it, expect } from 'vitest';
import { gridActions } from './gridActions';
import { createInitialGridUiState, gridUiReducer } from './gridReducer';

describe('gridUiReducer (detail row expand / collapse)', () => {
  const initial = createInitialGridUiState([]);

  it('starts with an empty expanded set', () => {
    expect(initial.expandedDetailRowKeys.size).toBe(0);
  });

  it('toggles a single key (string and number keys are distinct)', () => {
    const s1 = gridUiReducer(initial, gridActions.toggleDetailRow('a'));
    expect(Array.from(s1.expandedDetailRowKeys)).toEqual(['a']);
    const s2 = gridUiReducer(s1, gridActions.toggleDetailRow(7));
    expect(Array.from(s2.expandedDetailRowKeys)).toEqual(['a', 7]);
    const s3 = gridUiReducer(s2, gridActions.toggleDetailRow('a'));
    expect(Array.from(s3.expandedDetailRowKeys)).toEqual([7]);
    // 他の state は参照維持。
    expect(s3.collapsedGroupKeys).toBe(initial.collapsedGroupKeys);
  });

  it('setExpanded composes onto the current set and is a no-op for same value', () => {
    const s1 = gridUiReducer(initial, gridActions.setDetailRowExpanded('x', true));
    expect(s1.expandedDetailRowKeys.has('x')).toBe(true);
    expect(gridUiReducer(s1, gridActions.setDetailRowExpanded('x', true))).toBe(s1);
    const s2 = gridUiReducer(s1, gridActions.setDetailRowExpanded('y', true));
    expect(Array.from(s2.expandedDetailRowKeys)).toEqual(['x', 'y']);
    const s3 = gridUiReducer(s2, gridActions.setDetailRowExpanded('x', false));
    expect(Array.from(s3.expandedDetailRowKeys)).toEqual(['y']);
    expect(gridUiReducer(s3, gridActions.setDetailRowExpanded('x', false))).toBe(s3);
  });

  it('setKeys replaces the set and keeps the reference for empty → empty', () => {
    expect(gridUiReducer(initial, gridActions.setExpandedDetailRowKeys(new Set()))).toBe(
      initial,
    );
    const keys = new Set<string | number>(['a', 1]);
    const s1 = gridUiReducer(initial, gridActions.setExpandedDetailRowKeys(keys));
    expect(s1.expandedDetailRowKeys).toBe(keys);
    const s2 = gridUiReducer(s1, gridActions.setExpandedDetailRowKeys(new Set()));
    expect(s2.expandedDetailRowKeys.size).toBe(0);
  });
});