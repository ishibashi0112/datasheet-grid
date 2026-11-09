// 追加(1.0 の準備): 非推奨の表(deprecation.ts の DEPRECATIONS)と、利用者に届く 4 か所が食い違わないことを検査します。
//   - API リファレンス(API_REFERENCE.md と website の api/*.mdx): 「**非推奨**」で始まる説明の行が、表の名前と同じ集合で、
//     消す版を書いている。印は「**非推奨**」に統一(「**@deprecated**」は使わない)。
//   - JSDoc: jsdoc に書いた型 / フィールドに @deprecated がある(エディタが取り消し線で出す)。
//   - CHANGELOG: 名前と「非推奨」を書いた行がある。
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
  warnDeprecated,
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

  it.each(entries)('%s: CHANGELOG に名前と「非推奨」を書いた行がある', (_id, entry) => {
    const lines = changelog.split('\n').filter((line) => line.includes(entry.name) && line.includes('非推奨'));
    expect(lines.length, entry.name).toBeGreaterThan(0);
  });

  it.each(entries)('%s: 非推奨にした版 ≦ 今の版 < 消す版(届いたら消す)', (_id, entry) => {
    expect(compareVersions(entry.since, corePackage.version)).toBeLessThanOrEqual(0);
    expect(compareVersions(corePackage.version, entry.removeIn)).toBeLessThan(0);
  });
});

describe('warnDeprecated', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetDeprecationWarningsForTest();
  });

  it('日本語の行と英語の行の 2 行で、消す版と代わりを書く', () => {
    const lines = formatDeprecationWarning('exportScopeAll').split('\n');
    expect(lines).toEqual([
      "[spreadsheet-grid] 非推奨: エクスポートの scope `'all'` は 1.0.0 で消します。`'view'` を使ってください(挙動は同じです)。",
      "[spreadsheet-grid] Deprecated: The export scope `'all'` will be removed in 1.0.0. Use `'view'` instead (same behavior).",
    ]);
  });

  it('1 つにつき 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDeprecated('exportScopeAll');
    warnDeprecated('exportScopeAll');
    warnDeprecated('exportScopeVisible');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('本番では警告しない', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDeprecated('exportScopeAll');
    expect(warn).not.toHaveBeenCalled();
  });
});