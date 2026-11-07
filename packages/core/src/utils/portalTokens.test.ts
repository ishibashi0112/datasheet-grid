// 追加(DevBI の報告 2026-11-07): ポップアップへ表のトークンを写す syncPortalTokens の決まりを固定します。
//   jsdom はカスケードとカスタムプロパティの一覧を持たないので、getComputedStyle を小さな模型に差し替えます
//   (既定値 = トークンの元のクラス / 内部の .ssg-token-probe、修飾子 = ダーク / 密度、利用側の指定 = 下の rules、
//   最後にインライン)。実ブラウザでの確認は audit/harness/t-devbi.mjs。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncPortalTokens, TOKEN_PROBE_CLASS } from './portalTokens';

type Rule = { matches: (el: Element) => boolean; vars: Record<string, string> };

const DEFAULTS: Record<string, string> = {
  '--ssg-accent': '#3461c9',
  '--ssg-panel-bg': '#ffffff',
  '--ssg-icon-btn-size': '20px',
};
const DARK: Record<string, string> = { '--ssg-accent': '#4dabf7', '--ssg-panel-bg': '#25262b' };
const COMPACT: Record<string, string> = { '--ssg-icon-btn-size': '18px' };
const TOKEN_BASES = ['ssg-root', 'ssg-menu-panel', 'ssg-tooltip', TOKEN_PROBE_CLASS];

let rules: Rule[] = [];

const computeVars = (el: Element): Record<string, string> => {
  const vars: Record<string, string> = {};
  if (TOKEN_BASES.some((name) => el.classList.contains(name))) {
    Object.assign(vars, DEFAULTS);
  }
  if (el.classList.contains('ssg-root--density-compact')) {
    Object.assign(vars, COMPACT);
  }
  if (el.classList.contains('ssg-theme-dark')) {
    Object.assign(vars, DARK);
  }
  for (const rule of rules) {
    if (rule.matches(el)) {
      Object.assign(vars, rule.vars);
    }
  }
  const inline = (el as HTMLElement).style;
  for (let index = 0; index < inline.length; index += 1) {
    const name = inline[index];
    if (name.startsWith('--')) {
      vars[name] = inline.getPropertyValue(name);
    }
  }
  return vars;
};

beforeEach(() => {
  rules = [];
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    // 一覧は呼んだ時点の値、getPropertyValue は読むたびに今の値(本物の computed style と同じく生きている)。
    const names = Object.keys(computeVars(el));
    const style = { length: names.length, getPropertyValue: (name: string) => computeVars(el)[name] ?? '' } as Record<
      number | string,
      unknown
    >;
    names.forEach((name, index) => {
      style[index] = name;
    });
    return style as unknown as CSSStyleDeclaration;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const setup = ({ rootClass = '', portalClass = '' } = {}) => {
  const card = document.createElement('div');
  card.className = 'card';
  const root = document.createElement('div');
  root.className = `ssg-root ${rootClass}`.trim();
  const shell = document.createElement('div');
  shell.className = 'ssg-shell';
  root.appendChild(shell);
  card.appendChild(root);
  document.body.appendChild(card);
  const portal = document.createElement('div');
  portal.className = `ssg-menu-panel ${portalClass}`.trim();
  document.body.appendChild(portal);
  return { card, root, shell, portal };
};

const inlineTokens = (el: HTMLElement) => {
  const out: Record<string, string> = {};
  for (let index = 0; index < el.style.length; index += 1) {
    const name = el.style[index];
    if (name.startsWith('--ssg-')) {
      out[name] = el.style.getPropertyValue(name);
    }
  }
  return out;
};

describe('syncPortalTokens', () => {
  it('利用側が何も決めていなければ何も写さない(テーマのプリセットも写さない)', () => {
    const { shell, portal } = setup({ rootClass: 'ssg-theme-dark', portalClass: 'ssg-theme-dark' });
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({});
  });

  it('どの表にも当たる .ssg-root { … } の値を写す', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root'), vars: { '--ssg-accent': 'green' } }];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-accent': 'green' });
  });

  it('祖先のセレクタ / className で決めた値を写す', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root') && el.closest('.card') !== null, vars: { '--ssg-panel-bg': 'teal' } }];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-panel-bg': 'teal' });
  });

  it('全部の要素に当たる指定(テーマビルダーの出力)に、表だけの指定を重ねたときも表の値を写す', () => {
    rules = [
      { matches: (el) => el.classList.contains('ssg-root') || el.classList.contains('ssg-menu-panel'), vars: { '--ssg-panel-bg': 'navy' } },
      { matches: (el) => el.classList.contains('ssg-root') && el.closest('.card') !== null, vars: { '--ssg-panel-bg': 'teal' } },
    ];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-panel-bg': 'teal' });
  });

  it('ポップアップの側だけで変えている値は残す(ほかの値は写す)', () => {
    rules = [
      { matches: (el) => el.classList.contains('ssg-root'), vars: { '--ssg-panel-bg': 'teal', '--ssg-accent': 'green' } },
      { matches: (el) => el.classList.contains('ssg-menu-panel'), vars: { '--ssg-panel-bg': 'plum' } },
    ];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-accent': 'green' });
  });

  it('ポップアップのインライン(classNames.popover の style)は残す', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root'), vars: { '--ssg-accent': 'green' } }];
    const { shell, portal } = setup();
    portal.style.setProperty('--ssg-accent', 'purple');
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-accent': 'purple' });
  });

  it('密度の寸法(表の root だけに付く修飾子)は写さない', () => {
    const { shell, portal } = setup({ rootClass: 'ssg-root--density-compact' });
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({});
  });

  it('写し直すときは前に写した値を外してから決め直す(利用側が後から書いた値は残す)', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root'), vars: { '--ssg-accent': 'green', '--ssg-panel-bg': 'teal' } }];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-accent': 'green', '--ssg-panel-bg': 'teal' });
    // 利用側がインラインで書き換えた値は残し、表の指定が無くなった値は外す。
    portal.style.setProperty('--ssg-accent', 'purple');
    rules = [];
    syncPortalTokens(shell, portal);
    expect(inlineTokens(portal)).toEqual({ '--ssg-accent': 'purple' });
  });

  it('表の外の要素から呼ばれたら、前に写した値を外すだけ', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root'), vars: { '--ssg-accent': 'green' } }];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    syncPortalTokens(outside, portal);
    expect(inlineTokens(portal)).toEqual({});
  });

  it('ポップアップの中の要素(ツールチップの元)からは、そのポップアップの値をたどる', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root') && el.closest('.card') !== null, vars: { '--ssg-panel-bg': 'teal' } }];
    const { shell, portal } = setup();
    syncPortalTokens(shell, portal);
    const item = document.createElement('button');
    portal.appendChild(item);
    const tooltip = document.createElement('div');
    tooltip.className = 'ssg-tooltip';
    document.body.appendChild(tooltip);
    syncPortalTokens(item, tooltip);
    expect(inlineTokens(tooltip)).toEqual({ '--ssg-panel-bg': 'teal' });
  });

  it('読むための見えない要素は後片付けする', () => {
    rules = [{ matches: (el) => el.classList.contains('ssg-root'), vars: { '--ssg-accent': 'green' } }];
    const { shell, portal } = setup();
    const before = document.body.childElementCount;
    syncPortalTokens(shell, portal);
    expect(document.body.childElementCount).toBe(before);
    expect(document.querySelector(`.${TOKEN_PROBE_CLASS}`)).toBeNull();
  });
});