// logic/selectEditorState(select エディタ純ロジック)の単体テストです。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridSelectEditorOption } from '../model/gridTypes.unbound';
import {
  findOptionByComposedText,
  SELECT_TYPEAHEAD_RESET_MS,
  computeSelectPopoverPlacement,
  createTypeaheadState,
  moveHighlight,
  moveSelectHighlight,
  resolveInitialHighlight,
  handleSelectEditorKeyDown,
  resolveSelectOptionRowHeight,
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
    // 3 候補 × 28px + 上下 padding 4px×2 + 枠線 1px×2
    expect(placement.maxHeight).toBe(3 * 28 + 8 + 2);
  });

  it('下に収まらない場合は上へフリップする', () => {
    const placement = computeSelectPopoverPlacement(
      { left: 100, top: 700, bottom: 732, width: 120 },
      3,
      1024,
      768,
    );
    expect(placement.top).toBe(700 - 2 - (3 * 28 + 8 + 2));
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
    expect(placement.maxHeight).toBe(8 * 28 + 8 + 2);
  });

  // 追加(1.2.0 の見直し QH-1): タッチが主の端末は候補の行が 44px。渡した行の高さで一覧の高さと上下の反転を決める。
  it('行の高さを渡すとその高さで見積もる(タッチの 44px)', () => {
    const placement = computeSelectPopoverPlacement(anchor, 4, 1024, 768, 44);
    expect(placement.maxHeight).toBe(4 * 44 + 8 + 2);
    const flipped = computeSelectPopoverPlacement({ left: 100, top: 560, bottom: 592, width: 120 }, 4, 1024, 768, 44);
    // 下は 594 + 186 = 780 > 760 なので上へ(28px の見積もりなら 594 + 122 = 716 で下に収まると判断していた)。
    expect(flipped.top).toBe(560 - 2 - (4 * 44 + 8 + 2));
  });
});

describe('resolveSelectOptionRowHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pointer: coarse なら 44、それ以外は 28', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', media: query }));
    expect(resolveSelectOptionRowHeight()).toBe(44);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    expect(resolveSelectOptionRowHeight()).toBe(28);
  });
});

// 追加(1.0.2 / 2026-11-09 実アプリの総点検 E-08): IME で確定した文字で候補を探す。
describe('findOptionByComposedText', () => {
  const makers = [
    { value: 'a', label: '東京電機' },
    { value: 'b', label: '大阪製作所' },
    { value: 'c', label: '名古屋工業' },
  ];
  it('label がその文字で始まる最初の候補、無ければ含む最初の候補', () => {
    expect(findOptionByComposedText(makers, '名古')).toBe(2);
    expect(findOptionByComposedText(makers, '製作')).toBe(1);
    expect(findOptionByComposedText(makers, '電機')).toBe(0);
  });
  it('一致しない / 空白だけは null', () => {
    expect(findOptionByComposedText(makers, '福岡')).toBeNull();
    expect(findOptionByComposedText(makers, '  ')).toBeNull();
    expect(findOptionByComposedText(makers, '\u3000')).toBeNull();
  });
  it('全角の英数字は半角に寄せて比べる(IME がオンのまま英字を打った確定)', () => {
    const owners = [
      { value: 'm', label: 'Mika' },
      { value: 's', label: 'Sato' },
      { value: 'f', label: 'ＦＵＪＩ' },
    ];
    expect(findOptionByComposedText(owners, 'ｓ')).toBe(1);
    expect(findOptionByComposedText(owners, 'ＳＡ')).toBe(1);
    expect(findOptionByComposedText(owners, 'fu')).toBe(2);
  });
});

describe('handleSelectEditorKeyDown / moveSelectHighlight(Solid 版 段階 1-2 で React 版から移した割り当て)', () => {
  const run = (
    key: string,
    optionCount = 3,
    enterMove: 'none' | undefined = undefined,
    mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {},
  ) => {
    const calls: unknown[] = [];
    let prevented = false;
    handleSelectEditorKeyDown(
      {
        key,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...mods,
        preventDefault: () => {
          prevented = true;
        },
      },
      {
        optionCount,
        enterMove,
        onMove: (next) => calls.push(['move', next(1)]),
        onCommit: (direction) => calls.push(['commit', direction]),
        onCancel: () => calls.push(['cancel']),
        onTypeahead: (typed) => calls.push(['typeahead', typed]),
      },
    );
    return { calls, prevented };
  };

  it('矢印は候補が無くても動かし、Home / End / PageUp / PageDown は候補が無ければ止めるだけ', () => {
    expect(run('ArrowDown', 0)).toEqual({ calls: [['move', 0]], prevented: true });
    expect(run('Home', 0)).toEqual({ calls: [], prevented: true });
    expect(run('End', 3)).toEqual({ calls: [['move', 2]], prevented: true });
  });

  it('Enter は enterMove の向き、Tab は左右、Escape は取り消し', () => {
    expect(run('Enter').calls).toEqual([['commit', 'down']]);
    expect(run('Enter', 3, 'none').calls).toEqual([['commit', undefined]]);
    expect(run('Tab', 3, undefined, { shiftKey: true }).calls).toEqual([['commit', 'left']]);
    expect(run('Escape').calls).toEqual([['cancel']]);
  });

  it('修飾キーの無い印字キーだけタイプアヘッド(ほかは既定の動作のまま)', () => {
    expect(run('a')).toEqual({ calls: [['typeahead', 'a']], prevented: true });
    expect(run('a', 3, undefined, { ctrlKey: true })).toEqual({ calls: [], prevented: false });
    expect(run('F5')).toEqual({ calls: [], prevented: false });
  });

  it('行き先は端で止まる(PageUp / PageDown は 8 件ずつ)', () => {
    expect(moveSelectHighlight('ArrowDown', 2, 3)).toBe(2);
    expect(moveSelectHighlight('ArrowUp', 0, 3)).toBe(0);
    expect(moveSelectHighlight('End', 0, 20)).toBe(19);
    expect(moveSelectHighlight('PageDown', -1, 20)).toBe(8);
    expect(moveSelectHighlight('PageUp', 5, 20)).toBe(0);
  });
});