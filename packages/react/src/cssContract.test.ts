import { describe, expect, it } from 'vitest';
import reference from '../API_REFERENCE.md?raw';
import packageReadme from '../README.md?raw';
import skill from '../skills/spreadsheet-grid/SKILL.md?raw';
import rootReadme from '../../../README.md?raw';
import coreReadme from '../../core/README.md?raw';
import websiteProps from '../../../website/content/docs/api/props.mdx?raw';
import stylesCss from './styles.css?raw';

// 追加(semver / 1.0 の準備): CSS の公開範囲(API_REFERENCE.md の「スタイリング用の状態クラス(公開契約)」の
//   クラス / 属性の表と、「CSS トークン(`--ssg-*`)(公開契約)」の表)が、実装とドキュメントからずれていないかを見張ります。
//   - ドキュメント(API_REFERENCE.md / README / Skill / website)で名前を出すクラス / 属性 / トークンは、すべて表に載っている
//     (載っていない名前をドキュメントで案内すると、利用者が内部のクラスに依存してしまう)
//   - 表のクラス / 属性は実装にある(消したり改名したりしたら表も直す = 破壊的変更として CHANGELOG に書く)
//   - 表のトークンは style.css のトークン定義と同じ集合(トークンを足したら表にも足す)
//   - website の API リファレンス(api/props.mdx)の表は API_REFERENCE.md と同じ
//   失敗したら、表を直すか、ドキュメントから内部の名前を消す。

const websiteDocs = import.meta.glob<string>('../../../website/content/docs/**/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const sources = import.meta.glob<string>(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '../../core/src/**/*.ts', '!../../core/src/**/*.test.ts'],
  { query: '?raw', import: 'default', eager: true },
);
const sourceText = Object.values(sources).join('\n');

// ドキュメントの見出し(## …)から次の ## までを切り出します。
const section = (text: string, heading: string): string => {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) {
    return '';
  }
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
};
const subsection = (text: string, heading: string): string => {
  const start = text.indexOf(`\n### ${heading}\n`);
  if (start === -1) {
    return '';
  }
  const end = text.slice(start + 1).search(/\n#{2,3} /);
  return text.slice(start, end === -1 ? undefined : start + 1 + end);
};

const CLASS_HEADING = 'スタイリング用の状態クラス(公開契約)';
const TOKEN_HEADING = 'CSS トークン(`--ssg-*`)(公開契約)';

// `--ssg-accent` の `ssg-accent` はクラスではないので、直前が英数字 / ハイフンの位置は拾いません。
const classNamesIn = (text: string): Set<string> =>
  new Set([...text.matchAll(/(?<![\w-])(ssg-[a-z0-9]+(?:--?[a-z0-9]+)*)/g)].map((m) => m[1] ?? ''));
const attributesIn = (text: string): Set<string> =>
  new Set([...text.matchAll(/(?<![\w-])(data-(?:ssg|grid)-[a-z0-9]+(?:-[a-z0-9]+)*)/g)].map((m) => m[1] ?? ''));
// 末尾が `-` / `*` の名前(`--ssg-cf-*` など)は前方一致の書き方なので、具体的な名前とは分けます。
const tokenMentionsIn = (text: string): { names: Set<string>; prefixes: Set<string> } => {
  const names = new Set<string>();
  const prefixes = new Set<string>();
  for (const m of text.matchAll(/--ssg-[a-z0-9-]*\*?/g)) {
    const raw = m[0];
    if (raw.endsWith('*') || raw.endsWith('-')) {
      prefixes.add(raw.replace(/[-*]+$/, ''));
    } else {
      names.add(raw);
    }
  }
  return { names, prefixes };
};

// ドキュメントの中で、クラスではないのに `ssg-` で始まる名前(style.layer.css のレイヤー名)。
const NOT_CLASS_NAMES = new Set(['ssg-base']);
// 内部のトークンとして名前を出しているもの(公開契約の節で「内部」と書いている、themes/*.css の中継)。
const INTERNAL_TOKEN_PREFIXES = new Set(['--ssg-ds']);

const contractTables = (text: string) => {
  const contract = section(text, CLASS_HEADING);
  return {
    classes: classNamesIn(subsection(contract, 'クラス')),
    attributes: attributesIn(subsection(contract, '属性')),
    tokens: tokenMentionsIn(section(text, TOKEN_HEADING)).names,
  };
};
const tables = contractTables(reference);

// style.css のトークン定義(既定値のブロック)。ダークのプリセットや密度の修飾子は同じ名前を上書きするだけです。
const tokenBlockSelector =
  ':where(.ssg-root, .ssg-popover, .ssg-menu-panel, .ssg-filter-popover, .ssg-select-editor-popover, [data-grid-drag-ghost], .ssg-tooltip, .ssg-ask) {';
const cssWithoutComments = stylesCss.replace(/\/\*[\s\S]*?\*\//g, '');
const tokenBlockStart = cssWithoutComments.indexOf(tokenBlockSelector);
const tokenBlock = cssWithoutComments.slice(tokenBlockStart, cssWithoutComments.indexOf('}', tokenBlockStart));
const definedTokens = new Set([...tokenBlock.matchAll(/(--ssg-[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ''));

const documents: Record<string, string> = {
  'packages/react/API_REFERENCE.md': reference,
  'README.md': rootReadme,
  'packages/react/README.md': packageReadme,
  'packages/core/README.md': coreReadme,
  'packages/react/skills/spreadsheet-grid/SKILL.md': skill,
  ...Object.fromEntries(
    Object.entries(websiteDocs).map(([path, text]) => [path.replace('../../../', ''), text]),
  ),
};

const appearsAsWord = (text: string, name: string): boolean =>
  new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text);

// 色味のクラスは GridChip.tsx が `ssg-chip--${tone}` で組み立てるため、型 GridChipTone の値で確かめます。
const chipTones = new Set(
  [...(/export type GridChipTone = ([^;]+);/.exec(sourceText)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]),
);
const existsInImplementation = (name: string): boolean => {
  const tone = /^ssg-chip--([a-z]+)$/.exec(name)?.[1];
  if (tone !== undefined && tone !== 'custom') {
    return chipTones.has(tone) && sourceText.includes('`ssg-chip--${');
  }
  return appearsAsWord(sourceText, name) || new RegExp(`\\.${name}(?![\\w-])`).test(stylesCss);
};

describe('CSS の公開範囲(API_REFERENCE.md の公開契約の表)', () => {
  it('表を読み取れる', () => {
    expect(tables.classes.size).toBeGreaterThan(40);
    expect(tables.attributes.size).toBeGreaterThan(5);
    expect(tables.tokens.size).toBeGreaterThan(100);
    expect(tokenBlockStart).toBeGreaterThan(-1);
  });

  it('ドキュメントで名前を出すクラスは、すべて表に載っている', () => {
    const missing: string[] = [];
    for (const [path, text] of Object.entries(documents)) {
      for (const name of classNamesIn(text)) {
        if (!tables.classes.has(name) && !NOT_CLASS_NAMES.has(name)) {
          missing.push(`${path}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('ドキュメントで名前を出す属性は、すべて表に載っている', () => {
    const missing: string[] = [];
    for (const [path, text] of Object.entries(documents)) {
      for (const name of attributesIn(text)) {
        if (!tables.attributes.has(name)) {
          missing.push(`${path}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('表のクラスと属性は実装にある', () => {
    const missing = [...tables.classes, ...tables.attributes].filter((name) => !existsInImplementation(name));
    expect(missing).toEqual([]);
  });

  it('表のトークンは style.css のトークン定義と同じ', () => {
    expect([...tables.tokens].filter((name) => !definedTokens.has(name))).toEqual([]);
    expect([...definedTokens].filter((name) => !tables.tokens.has(name))).toEqual([]);
  });

  it('ドキュメントで名前を出すトークンは、すべて表に載っている', () => {
    const missing: string[] = [];
    for (const [path, text] of Object.entries(documents)) {
      const { names, prefixes } = tokenMentionsIn(text);
      for (const name of names) {
        if (!tables.tokens.has(name)) {
          missing.push(`${path}: ${name}`);
        }
      }
      // `--ssg-*` / `--ssg-cf-*` のような前方一致は、表のどれかに当たれば良い。
      for (const prefix of prefixes) {
        if (!INTERNAL_TOKEN_PREFIXES.has(prefix) && ![...tables.tokens].some((name) => name.startsWith(`${prefix}-`))) {
          missing.push(`${path}: ${prefix}-*`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('website の API リファレンスの表は API_REFERENCE.md と同じ', () => {
    const web = contractTables(websiteProps);
    expect([...web.classes].sort()).toEqual([...tables.classes].sort());
    expect([...web.attributes].sort()).toEqual([...tables.attributes].sort());
    expect([...web.tokens].sort()).toEqual([...tables.tokens].sort());
  });
});