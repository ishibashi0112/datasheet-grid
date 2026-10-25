import { describe, expect, it } from 'vitest';
import stylesCss from '../styles.css?raw';
// デザインシステム側の CSS(website の依存。ルートの pnpm install で入る)。テーマが参照する変数が実在するかを見る。
import astryxCoreCss from '../../../../website/node_modules/@astryxdesign/core/dist/astryx.css?raw';
import astryxNeutralCss from '../../../../website/node_modules/@astryxdesign/theme-neutral/dist/theme.css?raw';
import herouiCss from '../../../../website/node_modules/@heroui/styles/dist/themes/default/variables.css?raw';
import mantineCss from '../../../../website/node_modules/@mantine/core/styles.css?raw';
// shadcn/ui はパッケージではなく init が globals.css に書く変数なので、website のデモに置いた写しで見る。
import shadcnCss from '../../../../website/components/demo/design-systems/shadcn-frame.css?raw';

// 追加(デザインシステムのテーマ): themes/*.css が style.css のトークン定義とずれていないか、テーマ同士で配分が
// 揃っているかを見張ります。
//   - セレクタの対象(ルート + ポータル)が style.css のトークン定義と同じであること(ポータルを足したときに
//     テーマが届かない要素を作らない)。目印の属性で絞るテーマは、その絞り方も固定する
//   - 入力(--ssg-ds-*)の名前がどのテーマでも同じで、入力はグリッドのトークンを参照しないこと
//   - 配分(--ssg-ds-* 以外の宣言)がどのテーマでも同じ内容で、style.css に定義のあるトークンだけを、入力だけから
//     決めていること(トークン名の打ち間違いや、style.css 側で名前を変えたときの取り残しを検出する)
//   - style.css のトークンのうちテーマが決めないものは PRESET_KEPT の一覧どおりであること(style.css にトークンを
//     足したら、テーマで決めるか一覧に足すかを選ぶ)
//   - 入力が参照するデザインシステムの変数が、そのデザインシステムの CSS に実在すること(打ち間違いや、デザイン
//     システム側の改名を website の依存を上げたときに検出する)
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
  '--ssg-ds-danger-contrast',
  '--ssg-ds-success',
  '--ssg-ds-success-contrast',
  '--ssg-ds-warning',
  '--ssg-ds-radius',
];

// style.css のトークンのうち、テーマが決めずに theme のプリセット(ライト / ダーク)のままにするもの。
const PRESET_KEPT = [
  // 既定が var() でほかのトークンを参照していて、テーマで決めた色に付いてくるもの
  '--ssg-label-row-accent',
  '--ssg-total-row-text',
  '--ssg-total-row-border',
  '--ssg-checkbox-checked-bg',
  '--ssg-checkbox-hover-border',
  '--ssg-save-pending',
  '--ssg-save-failed',
  '--ssg-fill-line',
  '--ssg-fill-handle-ring',
  // 寸法 / 影 / 動き
  '--ssg-icon-btn-size',
  '--ssg-cell-pad-x',
  '--ssg-bar-pad-x',
  '--ssg-bar-pad-y',
  '--ssg-seg-indicator-shadow',
  '--ssg-root-shadow',
  '--ssg-panel-shadow',
  '--ssg-popover-shadow',
  '--ssg-overlay-chip-shadow',
  '--ssg-pane-shadow-left',
  '--ssg-pane-shadow-right',
  '--ssg-pill-shadow',
  '--ssg-ghost-shadow',
  '--ssg-tooltip-shadow',
  '--ssg-motion-fast',
  '--ssg-motion-base',
  '--ssg-motion-slow',
  '--ssg-motion-ease',
  // デザインシステムに対応する変数が無いもの(パネルの切り替え / 浮かぶ表示 / ドラッグ中のゴースト / ツールチップ /
  // 検索の印 / 条件付き書式 / 読み込み中の光 / スクロールの案内)
  '--ssg-seg-track-bg',
  '--ssg-seg-indicator-bg',
  '--ssg-pill-bg',
  '--ssg-pill-text',
  '--ssg-ghost-bg',
  '--ssg-ghost-text',
  '--ssg-ghost-border',
  '--ssg-tooltip-bg',
  '--ssg-tooltip-text',
  '--ssg-find-mark-bg',
  '--ssg-find-mark-current-bg',
  '--ssg-cf-bar',
  '--ssg-cf-bar-negative',
  '--ssg-cf-seq-min',
  '--ssg-cf-seq-max',
  '--ssg-cf-div-negative',
  '--ssg-cf-div-mid',
  '--ssg-cf-div-positive',
  '--ssg-cf-neutral',
  '--ssg-cf-neutral-bg',
  '--ssg-cf-info',
  '--ssg-cf-info-bg',
  '--ssg-cf-good',
  '--ssg-cf-good-bg',
  '--ssg-cf-warning',
  '--ssg-cf-warning-bg',
  '--ssg-cf-critical',
  '--ssg-cf-critical-bg',
  '--ssg-skeleton-bar-hi',
  '--ssg-scrollhint-track-bg',
  '--ssg-scrollhint-thumb',
  '--ssg-scrollhint-thumb-active',
];

// テーマごとの、参照するデザインシステムの変数が宣言されている CSS。
const DS_CSS: Record<string, string> = {
  astryx: astryxCoreCss + astryxNeutralCss,
  mantine: mantineCss,
  heroui: herouiCss,
  shadcn: shadcnCss,
};

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
const baseTokens = new Set(base.declarations.map((d) => d.name).filter((name) => name.startsWith('--ssg-')));
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

    it('入力が参照するデザインシステムの変数は、そのデザインシステムの CSS に宣言がある', () => {
      const declared = new Set([...stripComments(DS_CSS[theme.name] ?? '').matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
      const referenced = theme.inputs.flatMap((d) => referencedVars(d.value));
      expect(referenced.length).toBeGreaterThan(0);
      expect(referenced.filter((v) => !declared.has(v))).toEqual([]);
    });

    it('同じ名前を二度書かない', () => {
      const names = theme.declarations.map((d) => d.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('style.css のトークンのうちテーマが決めないものは PRESET_KEPT の一覧どおり', () => {
    const decided = new Set(themes[0]?.derived.map((d) => d.name));
    expect([...baseTokens].filter((name) => !decided.has(name)).sort()).toEqual([...PRESET_KEPT].sort());
  });

  it('配分はどのテーマでも同じ内容', () => {
    const [first, ...rest] = themes;
    for (const theme of rest) {
      expect({ name: theme.name, derived: theme.derived }).toEqual({ name: theme.name, derived: first.derived });
    }
  });
});