import { describe, expect, it } from 'vitest';
import stylesCss from '../styles.css?raw';

// 追加(デザインシステムのテーマ): themes/*.css が style.css のトークン定義とずれていないか、テーマ同士で配分が
// 揃っているかを見張ります。
//   - セレクタの対象(ルート + ポータル)が style.css のトークン定義と同じであること(ポータルを足したときに
//     テーマが届かない要素を作らない)。目印の属性で絞るテーマは、その絞り方も固定する
//   - 入力(--ssg-ds-*)の名前がどのテーマでも同じで、入力はグリッドのトークンを参照しないこと
//   - 配分(--ssg-ds-* 以外の宣言)がどのテーマでも同じ内容で、style.css に定義のあるトークンだけを、入力だけから
//     決めていること(トークン名の打ち間違いや、style.css 側で名前を変えたときの取り残しを検出する)
const themeFiles = import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true });

// 目印の属性で絞るテーマ(その属性の内側のグリッドだけに効く)。'' は絞らない(読み込んだページのすべてのグリッド)。
const EXPECTED_SCOPE: Record<string, string> = {
  astryx: ':where([data-astryx-theme])',
  mantine: ':where([data-mantine-color-scheme])',
  heroui: '',
  shadcn: '',
};
const INPUTS = [
  '--ssg-ds-surface',
  '--ssg-ds-surface-muted',
  '--ssg-ds-popover',
  '--ssg-ds-text',
  '--ssg-ds-text-muted',
  '--ssg-ds-text-faint',
  '--ssg-ds-border',
  '--ssg-ds-border-strong',
  '--ssg-ds-accent',
  '--ssg-ds-accent-contrast',
  '--ssg-ds-danger',
  '--ssg-ds-success',
  '--ssg-ds-warning',
  '--ssg-ds-radius',
];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// 最初のトークン定義ブロック(「[前置き ]:where(.ssg-root, ...) {」)の前置き・セレクタ・宣言を取り出します。
const tokenBlock = (css: string) => {
  const match = /(?:^|\})\s*((?:[^{}]*\s)?)(:where\(\.ssg-root,[^)]*\))\s*\{([^}]*)\}/.exec(stripComments(css));
  if (!match) throw new Error('トークン定義ブロックが見つかりません');
  const declarations = match[3]
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      return { name: part.slice(0, colon).trim(), value: part.slice(colon + 1).replace(/\s+/g, ' ').trim() };
    });
  return { scope: match[1].trim(), selector: match[2].replace(/\s+/g, ' '), declarations };
};
const referencedVars = (value: string) => [...value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);

const base = tokenBlock(stylesCss);
const baseTokens = new Set(base.declarations.map((d) => d.name));
const themes = Object.entries(themeFiles).map(([path, css]) => {
  const name = path.replace(/^\.\//, '').replace(/\.css$/, '');
  const block = tokenBlock(css);
  return {
    name,
    ...block,
    inputs: block.declarations.filter((d) => d.name.startsWith('--ssg-ds-')),
    derived: block.declarations.filter((d) => !d.name.startsWith('--ssg-ds-')),
  };
});

describe('themes/*.css', () => {
  it('テーマの一覧が揃っている(足したテーマは EXPECTED_SCOPE に絞り方を書く)', () => {
    expect(themes.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED_SCOPE).sort());
  });

  describe.each(themes)('$name', (theme) => {
    it('style.css のトークン定義と同じ要素を対象にし、決めた絞り方をしている', () => {
      expect(base.scope).toBe('');
      expect(theme.selector).toBe(base.selector);
      expect(theme.scope).toBe(EXPECTED_SCOPE[theme.name]);
    });

    it('入力の名前が揃っていて、入力はグリッドのトークンを参照しない', () => {
      expect(theme.inputs.map((d) => d.name)).toEqual(INPUTS);
      expect(theme.inputs.flatMap((d) => referencedVars(d.value)).filter((v) => v.startsWith('--ssg-'))).toEqual([]);
    });

    it('配分は style.css に定義のあるトークンだけを、入力だけから決める', () => {
      expect(theme.derived.length).toBeGreaterThan(0);
      expect(theme.derived.filter((d) => !baseTokens.has(d.name)).map((d) => d.name)).toEqual([]);
      const used = theme.derived.flatMap((d) => referencedVars(d.value));
      expect(used.filter((v) => !INPUTS.includes(v))).toEqual([]);
    });

    it('同じ名前を二度書かない', () => {
      const names = theme.declarations.map((d) => d.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('配分はどのテーマでも同じ内容', () => {
    const [first, ...rest] = themes;
    for (const theme of rest) {
      expect({ name: theme.name, derived: theme.derived }).toEqual({ name: theme.name, derived: first.derived });
    }
  });
});