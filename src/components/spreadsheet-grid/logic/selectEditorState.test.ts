// logic/selectEditorState(select エディタ純ロジック)の単体テストです。
import { describe, expect, it } from 'vitest';
import type { GridSelectEditorOption } from '../model/gridTypes';
import {
  SELECT_TYPEAHEAD_RESET_MS,
  computeSelectPopoverPlacement,
  createTypeaheadState,
  moveHighlight,
  resolveInitialHighlight,
  typeaheadJump,
} from './selectEditorState';

const options: GridSelectEditorOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'berry', label: 'Berry' },
];

describe('resolveInitialHighlight', () => {
  it('現在値に一致する候補を初期ハイライトにする(String 化比較)', () => {
    expect(resolveInitialHighlight(options, 'banana')).toBe(1);
  });

  it('一致なし / null は先頭 0', () => {
    expect(resolveInitialHighlight(options, 'grape')).toBe(0);
    expect(resolveInitialHighlight(options, null)).toBe(0);
    expect(resolveInitialHighlight([], 'x')).toBe(0);
  });
});

describe('moveHighlight', () => {
  it('上下に移動し、端で停止する(ループなし)', () => {
    expect(moveHighlight(0, 1, 3)).toBe(1);
    expect(moveHighlight(2, 1, 3)).toBe(2);
    expect(moveHighlight(0, -1, 3)).toBe(0);
    expect(moveHighlight(2, -1, 3)).toBe(1);
  });

  it('候補 0 件は常に 0', () => {
    expect(moveHighlight(5, 1, 0)).toBe(0);
  });
});

describe('typeaheadJump', () => {
  it('label 前方一致(大文字小文字無視)の最初の候補へジャンプする', () => {
    const result = typeaheadJump(createTypeaheadState(), 'b', 1000, options);
    expect(result.index).toBe(1);
    expect(result.state.buffer).toBe('b');
  });

  it('連続打鍵でバッファが蓄積し、絞り込まれる', () => {
    const first = typeaheadJump(createTypeaheadState(), 'b', 1000, options);
    const second = typeaheadJump(first.state, 'e', 1200, options);
    expect(second.index).toBe(2);
    expect(second.state.buffer).toBe('be');
  });

  it('リセット時間超過でバッファが打鍵 1 文字から再開する', () => {
    const first = typeaheadJump(createTypeaheadState(), 'b', 1000, options);
    const second = typeaheadJump(
      first.state,
      'a',
      1000 + SELECT_TYPEAHEAD_RESET_MS + 1,
      options,
    );
    expect(second.state.buffer).toBe('a');
    expect(second.index).toBe(0);
  });

  it('一致なしは index null(バッファは維持)', () => {
    const result = typeaheadJump(createTypeaheadState(), 'z', 1000, options);
    expect(result.index).toBeNull();
    expect(result.state.buffer).toBe('z');
  });
});

describe('computeSelectPopoverPlacement', () => {
  const anchor = { left: 100, top: 200, bottom: 232, width: 120 };

  it('下に収まる場合はアンカー直下・幅は最小幅まで拡大', () => {
    const placement = computeSelectPopoverPlacement(anchor, 3, 1024, 768);
    expect(placement.top).toBe(234);
    expect(placement.left).toBe(100);
    expect(placement.width).toBe(180);
    // 3 候補 × 28px + 上下 padding 4px×2
    expect(placement.maxHeight).toBe(3 * 28 + 8);
  });

  it('下に収まらない場合は上へフリップする', () => {
    const placement = computeSelectPopoverPlacement(
      { left: 100, top: 700, bottom: 732, width: 120 },
      3,
      1024,
      768,
    );
    expect(placement.top).toBe(700 - 2 - (3 * 28 + 8));
  });

  it('左右はビューポートマージンでクランプされる', () => {
    const nearRight = computeSelectPopoverPlacement(
      { left: 1000, top: 200, bottom: 232, width: 120 },
      3,
      1024,
      768,
    );
    expect(nearRight.left).toBe(1024 - 180 - 8);

    const nearLeft = computeSelectPopoverPlacement(
      { left: 2, top: 200, bottom: 232, width: 120 },
      3,
      1024,
      768,
    );
    expect(nearLeft.left).toBe(8);
  });

  it('候補が多い場合は最大表示件数(8)で高さを打ち切る', () => {
    const placement = computeSelectPopoverPlacement(anchor, 50, 1024, 768);
    expect(placement.maxHeight).toBe(8 * 28 + 8);
  });
});