// 追加(slot-props): className スロット解決の純関数テストです。
import { describe, expect, it } from 'vitest';
import {
  arePropsEqualWithStyleKeys,
  mergeStyles,
  resolveSlotFromSignature,
  resolveSlotMap,
  resolveSlotMapFromSignature,
  resolveSlotProps,
  serializeSlotValue,
  shallowEqualStyle,
  slotClassName,
  slotStyle,
} from './slotProps';

type Style = Record<string, string | number>;

describe('resolveSlotProps', () => {
  it('文字列は className として解決する', () => {
    expect(resolveSlotProps<Style>('a b')).toEqual({ className: 'a b' });
  });

  it('falsy / 空文字 / 空オブジェクトは共有の空スロットになる', () => {
    const empty = resolveSlotProps<Style>(undefined);
    expect(empty).toEqual({});
    expect(resolveSlotProps<Style>(null)).toBe(empty);
    expect(resolveSlotProps<Style>(false)).toBe(empty);
    expect(resolveSlotProps<Style>('')).toBe(empty);
    expect(resolveSlotProps<Style>({})).toBe(empty);
    expect(resolveSlotProps<Style>({ className: '' })).toBe(empty);
  });

  it('オブジェクト形は className / style をそのまま保持する(StyleX の props() 互換)', () => {
    const style = { '--x-width': '120px' };
    const resolved = resolveSlotProps<Style>({ className: 'x1 x2', style });
    expect(resolved.className).toBe('x1 x2');
    expect(resolved.style).toBe(style);
    expect(slotClassName<Style>({ style })).toBeUndefined();
    expect(slotStyle<Style>({ style })).toBe(style);
    expect(slotStyle<Style>('only-class')).toBeUndefined();
  });
});

describe('mergeStyles', () => {
  it('左→右で浅くマージし右が勝つ。全て空なら undefined', () => {
    expect(mergeStyles<Style>(undefined, null, false)).toBeUndefined();
    expect(
      mergeStyles<Style>({ left: 1, color: 'red' }, undefined, { left: 2 }),
    ).toEqual({ left: 2, color: 'red' });
  });

  it('入力オブジェクトを変異しない', () => {
    const a = { left: 1 };
    const merged = mergeStyles<Style>(a, { left: 2 });
    expect(a).toEqual({ left: 1 });
    expect(merged).toEqual({ left: 2 });
  });
});

describe('shallowEqualStyle / arePropsEqualWithStyleKeys', () => {
  it('内容が同じ style は等価、キー数や値が違えば非等価', () => {
    expect(shallowEqualStyle({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqualStyle({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqualStyle({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqualStyle(undefined, undefined)).toBe(true);
    expect(shallowEqualStyle({ a: 1 }, undefined)).toBe(false);
  });

  it('style キーだけ内容比較し、他は Object.is で比較する', () => {
    type Props = { rowStyle?: Style; label: string; onClick: () => void };
    const onClick = () => {};
    const styleKeys = new Set<keyof Props>(['rowStyle']);
    expect(
      arePropsEqualWithStyleKeys<Props>(
        { rowStyle: { a: 1 }, label: 'x', onClick },
        { rowStyle: { a: 1 }, label: 'x', onClick },
        styleKeys,
      ),
    ).toBe(true);
    expect(
      arePropsEqualWithStyleKeys<Props>(
        { rowStyle: { a: 1 }, label: 'x', onClick },
        { rowStyle: { a: 2 }, label: 'x', onClick },
        styleKeys,
      ),
    ).toBe(false);
    expect(
      arePropsEqualWithStyleKeys<Props>(
        { label: 'x', onClick },
        { label: 'x', onClick: () => {} },
        styleKeys,
      ),
    ).toBe(false);
    // キー集合が違う(片方だけ rowStyle を持つ)場合も非等価。
    expect(
      arePropsEqualWithStyleKeys<Props>(
        { rowStyle: { a: 1 }, label: 'x', onClick },
        { label: 'x', onClick },
        styleKeys,
      ),
    ).toBe(false);
  });
});

describe('resolveSlotMap / 署名', () => {
  it('空スロットのキーを落とし、文字列 / オブジェクトの両形を解決する', () => {
    const resolved = resolveSlotMap<'root' | 'bodyCell' | 'popover', Style>({
      root: 'my-root',
      bodyCell: { className: 'x1', style: { color: 'red' } },
      popover: undefined,
    });
    expect(resolved).toEqual({
      root: { className: 'my-root' },
      bodyCell: { className: 'x1', style: { color: 'red' } },
    });
    expect(resolveSlotMap<'root', Style>(undefined)).toEqual({});
  });

  it('署名は内容が同じなら一致し、復元結果も等しい(参照安定化の根拠)', () => {
    const a = { root: { className: 'x', style: { '--v': '1px' } } };
    const b = { root: { className: 'x', style: { '--v': '1px' } } };
    expect(serializeSlotValue(a)).toBe(serializeSlotValue(b));
    expect(serializeSlotValue(undefined)).toBe('null');
    expect(
      resolveSlotMapFromSignature<'root', Style>(serializeSlotValue(a)),
    ).toEqual({ root: { className: 'x', style: { '--v': '1px' } } });
    expect(resolveSlotMapFromSignature<'root', Style>('null')).toEqual({});
    expect(resolveSlotFromSignature<Style>(serializeSlotValue('k'))).toEqual({
      className: 'k',
    });
    expect(resolveSlotFromSignature<Style>('null')).toEqual({});
  });
});