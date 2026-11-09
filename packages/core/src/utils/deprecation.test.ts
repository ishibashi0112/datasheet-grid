// 追加(1.0 の準備): 非推奨の表(deprecation.ts の DEPRECATIONS)と、利用者に届く 4 か所が食い違わないことを検査します。
//   - API リファレンス(API_REFERENCE.md と website の api/*.mdx): 「**非推奨**」で始まる説明の行が、表の名前と同じ集合で、
//     消す版を書いている。印は「**非推奨**」に統一(「**@deprecated**」は使わない)。
//   - JSDoc: jsdoc に書いた型 / フィールドに @deprecated がある(prop やメソッドならエディタが取り消し線で出す。
//     scope の 'all' のような値には出ないので、値は開発時の警告が頼り)。
//   - CHANGELOG: 「### 非推奨」の節に名前を書いた行がある。
//   - 版: 非推奨にした版 ≦ 今の版 < 消す版(今の版が消す版に届いたら、消し忘れ。bump-version.mjs も止める)。
//   失敗したら、deprecation.ts の冒頭の手順どおりにそろえる。
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import reference from '../../../react/API_REFERENCE.md?raw';
import changelog from '../../../../CHANGELOG.md?raw';
import typesSource from '../model/gridTypes.core.ts?raw';
import corePackage from '../../package.json';
import { DEPRECATED_MARK, parseTables } from '../../../../scripts/sync-api-jsdoc.mjs';
import {
  DEPRECATIONS,
  formatDeprecationWarning,
  resetDeprecationWarningsForTest,
  warnDeprecation,
  type Deprecation,
  type DeprecationId,
} from './deprecation';

const websiteApi = import.meta.glob<string>('../../../../website/content/docs/api/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const entries = Object.entries(DEPRECATIONS) as [DeprecationId, Deprecation][];

const compareVersions = (a: string, b: string): number => {
  const [a0 = 0, a1 = 0, a2 = 0] = a.split('.').map(Number);
  const [b0 = 0, b1 = 0, b2 = 0] = b.split('.').map(Number);
  return a0 - b0 || a1 - b1 || a2 - b2;
};

// 説明のセルが「**非推奨**」で始まる行(名前のセル → 行の全体)。
const deprecatedRows = (markdown: string): Map<string, string> => {
  const rows = new Map<string, string>();
  for (const table of parseTables(markdown)) {
    for (const row of table.rows) {
      if (row.cells.slice(1).some((cell) => cell.startsWith(DEPRECATED_MARK))) {
        rows.set(row.cells[0] ?? '', row.cells.join(' | '));
      }
    }
  }
  return rows;
};

// gridTypes.core.ts の型(`型名`)かフィールド(`型名.フィールド名`)の宣言に @deprecated があるか。
const hasDeprecatedJsdoc = (target: string): boolean => {
  const sourceFile = ts.createSourceFile('gridTypes.core.ts', typesSource, ts.ScriptTarget.Latest, true);
  const [typeName, memberName] = target.split('.');
  for (const statement of sourceFile.statements) {
    if (!(ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))) continue;
    if (statement.name.text !== typeName) continue;
    if (memberName === undefined) {
      return ts.getJSDocTags(statement).some((tag) => tag.tagName.text === 'deprecated');
    }
    const members = ts.isInterfaceDeclaration(statement)
      ? statement.members
      : ts.isTypeLiteralNode(statement.type)
        ? statement.type.members
        : undefined;
    const member = members?.find((m) => m.name !== undefined && m.name.getText(sourceFile) === memberName);
    return member !== undefined && ts.getJSDocTags(member).some((tag) => tag.tagName.text === 'deprecated');
  }
  return false;
};

describe('非推奨の表と、API リファレンス / JSDoc / CHANGELOG / 版', () => {
  const names = entries.map(([, entry]) => entry.name).sort();

  it('API_REFERENCE.md の「**非推奨**」の行が表と同じで、消す版を書いている', () => {
    const rows = deprecatedRows(reference);
    expect([...rows.keys()].sort()).toEqual(names);
    for (const [, entry] of entries) {
      expect(rows.get(entry.name), entry.name).toContain(entry.removeIn);
    }
    expect(reference).not.toContain('**@deprecated**');
  });

  it('website の API リファレンスも同じ', () => {
    const rows = new Map<string, string>();
    for (const text of Object.values(websiteApi)) {
      for (const [name, row] of deprecatedRows(text)) rows.set(name, row);
      expect(text).not.toContain('**@deprecated**');
    }
    expect([...rows.keys()].sort()).toEqual(names);
    for (const [, entry] of entries) {
      expect(rows.get(entry.name), entry.name).toContain(entry.removeIn);
    }
  });

  it.each(entries)('%s: JSDoc に @deprecated がある', (_id, entry) => {
    expect(hasDeprecatedJsdoc(entry.jsdoc), entry.jsdoc).toBe(true);
  });

  it.each(entries)('%s: CHANGELOG の「### 非推奨」の節に名前を書いた行がある', (_id, entry) => {
    let section = '';
    const lines: string[] = [];
    for (const line of changelog.split('\n')) {
      if (line.startsWith('## ')) section = '';
      else if (line.startsWith('### ')) section = line.trim();
      else if (section === '### 非推奨' && line.includes(entry.name)) lines.push(line);
    }
    expect(lines.length, entry.name).toBeGreaterThan(0);
  });

  it.each(entries)('%s: 警告の文に消す版と代わりが入る', (_id, entry) => {
    const [ja, en] = formatDeprecationWarning(entry).split('\n');
    expect(ja).toBe(`[spreadsheet-grid] 非推奨: ${entry.what.ja} は ${entry.removeIn} で消します。${entry.instead.ja}`);
    expect(en).toBe(`[spreadsheet-grid] Deprecated: ${entry.what.en} will be removed in ${entry.removeIn}. ${entry.instead.en}`);
  });

  it.each(entries)('%s: 非推奨にした版 ≦ 今の版 < 消す版(届いたら消す)', (_id, entry) => {
    expect(compareVersions(entry.since, corePackage.version)).toBeLessThanOrEqual(0);
    expect(compareVersions(corePackage.version, entry.removeIn)).toBeLessThan(0);
  });
});

// 表の項目に頼らない形で確かめます(1.0.0 で表が空になっても仕組みのテストは残る)。
describe('非推奨の警告', () => {
  const sample: Deprecation = {
    name: '`sampleProp`',
    since: '0.1.0',
    removeIn: '9.0.0',
    jsdoc: 'SampleType.sampleProp',
    what: { ja: 'prop `sampleProp`', en: 'The prop `sampleProp`' },
    instead: { ja: '`newProp` を使ってください。', en: 'Use `newProp` instead.' },
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetDeprecationWarningsForTest();
  });

  it('日本語の行と英語の行の 2 行で、消す版と代わりを書く', () => {
    expect(formatDeprecationWarning(sample).split('\n')).toEqual([
      '[spreadsheet-grid] 非推奨: prop `sampleProp` は 9.0.0 で消します。`newProp` を使ってください。',
      '[spreadsheet-grid] Deprecated: The prop `sampleProp` will be removed in 9.0.0. Use `newProp` instead.',
    ]);
  });

  it('1 つにつき 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDeprecation('a', sample);
    warnDeprecation('a', sample);
    warnDeprecation('b', sample);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('本番では警告しない', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDeprecation('a', sample);
    expect(warn).not.toHaveBeenCalled();
  });
});