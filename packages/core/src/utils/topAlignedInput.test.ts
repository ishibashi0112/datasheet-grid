// 追加(1.2.0): 背の高い行で上にそろえたセルの 1 行の入力欄の余白(utils/topAlignedInput)のテストです。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { alignInputTextToTop } from './topAlignedInput';

// jsdom はレイアウトしないので、1 行ぶんの高さ(height: auto のときの clientHeight)を差し込みます。
const makeInput = (lineBox: number) => {
  const input = document.createElement('input');
  input.style.fontSize = '15px';
  input.style.borderTopWidth = '2px';
  input.style.borderBottomWidth = '2px';
  input.style.borderStyle = 'solid';
  input.style.height = '80px';
  Object.defineProperty(input, 'clientHeight', {
    get: () => (input.style.height === 'auto' ? lineBox : 76),
  });
  document.body.appendChild(input);
  return input;
};

describe('alignInputTextToTop', () => {
  it('上の余白は 0.4em − 枠線、下の余白で中身の箱を 1 行ぶんに。行の間隔は受け継ぎ、高さは元に戻す', () => {
    const input = makeInput(18);
    alignInputTextToTop(input, true, 80);
    // 15 × 0.4 − 2 = 4、80 − 2 − 2 − 4 − 18 = 54
    expect(input.style.paddingTop).toBe('4px');
    expect(input.style.paddingBottom).toBe('54px');
    expect(input.style.lineHeight).toBe('inherit');
    expect(input.style.height).toBe('80px');
    input.remove();
  });

  it('箱が 1 行より低いときは下の余白 0', () => {
    const input = makeInput(18);
    alignInputTextToTop(input, true, 20);
    expect(input.style.paddingBottom).toBe('0px');
    input.remove();
  });

  it('上にそろえないときはインラインの指定を外す', () => {
    const input = makeInput(18);
    alignInputTextToTop(input, true, 80);
    alignInputTextToTop(input, false, 80);
    expect(input.style.paddingTop).toBe('');
    expect(input.style.paddingBottom).toBe('');
    expect(input.style.lineHeight).toBe('');
    input.remove();
  });
});
