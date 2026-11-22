// 追加(1.3.0 の段 2-10 / R4-5): npm に同梱する Skill(skills/spreadsheet-grid-solid/SKILL.md)と API_REFERENCE.md が、公開 API と
//   ずれていないかを見張ります(React 版の skill.test.ts と同じ検査)。API_REFERENCE.md は React 版のものを build:lib で写す
//   (scripts/emit-docs.mjs)ので、ここでは React 版の正本と比べます。
//   - frontmatter が Agent Skills の仕様(name はディレクトリ名と同じ英小文字 + ハイフン、description は 1024 字まで)に沿う
//   - 本文の `名前` が API_REFERENCE.md に単語として出てくる(prop / メソッド / 型の改名を検出する)
//   - 「見出し」が API_REFERENCE.md の見出しにある(AI はこの名前で節を探す)
//   - パッケージのパスが exports か同梱ファイルにある / 同梱の設定(files と build:lib)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as entry from './index';

const PACKAGE_DIR = resolve(import.meta.dirname, '..');
const SKILL_DIR = 'spreadsheet-grid-solid';
const PACKAGE_NAME = '@ishibashi0112/spreadsheet-grid-solid';

const skill = readFileSync(resolve(PACKAGE_DIR, `skills/${SKILL_DIR}/SKILL.md`), 'utf8');
const reference = readFileSync(resolve(PACKAGE_DIR, '../react/API_REFERENCE.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  files: string[];
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
};

const frontmatterMatch = /^---\n([\s\S]*?)\n---\n/.exec(skill);
const frontmatter = frontmatterMatch?.[1] ?? '';
const body = frontmatterMatch ? skill.slice(frontmatterMatch[0].length) : skill;
const field = (name: string) => new RegExp(`^${name}: (.*)$`, 'm').exec(frontmatter)?.[1] ?? '';

const proseWithoutCodeBlocks = body.replace(/```[\s\S]*?```/g, '');
const inlineCode = [...proseWithoutCodeBlocks.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? '');
const identifiers = [...new Set(inlineCode.filter((code) => /^[A-Za-z][A-Za-z0-9]*(<T>)?(\(\))?$/.test(code)))];

// API_REFERENCE.md に出てこないが Skill に書いてよい名前(Solid / ツールの名前)。
const NOT_IN_REFERENCE = new Set(['useState', 'useRef', 'createStore', 'createSignal', 'untrack', 'map', 'tsc', 'current']);

const appearsAsWord = (text: string, name: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text);

const referenceHeadings = reference.split('\n').filter((line) => /^#{2,3} /.test(line));

describe('同梱の Skill(skills/spreadsheet-grid-solid/SKILL.md)', () => {
  it('frontmatter が Agent Skills の仕様に沿う', () => {
    expect(frontmatterMatch).not.toBeNull();
    const name = field('name');
    expect(name).toBe(SKILL_DIR);
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(name.length).toBeLessThanOrEqual(64);
    const description = field('description');
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).toContain(PACKAGE_NAME);
  });

  it('本文は 500 行未満(AI が一度に読み込む)', () => {
    expect(body.split('\n').length).toBeLessThan(500);
  });

  it('npm に同梱される(files と、API_REFERENCE.md を作る build:lib)', () => {
    expect(packageJson.files).toContain('skills');
    expect(packageJson.files).toContain('API_REFERENCE.md');
    expect(packageJson.scripts['build:lib']).toContain('node scripts/emit-docs.mjs');
  });

  it('本文の API の名前が API_REFERENCE.md に出てくる', () => {
    expect(identifiers.length).toBeGreaterThan(20);
    const missing = identifiers
      .map((code) => code.replace(/<T>$/, '').replace(/\(\)$/, ''))
      .filter((name) => !NOT_IN_REFERENCE.has(name) && !appearsAsWord(reference, name));
    expect(missing).toEqual([]);
  });

  it('本文の部品の名前(〜Feature / standardFeatures / createSpreadsheetGrid)が Solid 版の入口にある', () => {
    const words = inlineCode.flatMap((code) => [...code.matchAll(/(?<![A-Za-z0-9_])([a-z][A-Za-z]*Features?|createSpreadsheetGrid)(?![A-Za-z0-9_])/g)].map((m) => m[1] ?? ''));
    const names = [...new Set(words)];
    expect(names).toEqual(expect.arrayContaining(['createSpreadsheetGrid', 'standardFeatures', 'serverSideFeature']));
    expect(names.filter((name) => !(name in entry))).toEqual([]);
  });

  it('「見出し」が API_REFERENCE.md の見出しにある', () => {
    const table = body.slice(body.indexOf('## 5.'), body.indexOf('## 6.'));
    const names = [...table.matchAll(/「([^」]+)」/g)].map((m) => m[1] ?? '');
    expect(names.length).toBeGreaterThan(15);
    const missing = names.filter((name) => !referenceHeadings.some((heading) => heading.includes(name)));
    expect(missing).toEqual([]);
  });

  it('パッケージのパスが exports か同梱ファイルにある', () => {
    const paths = [...skill.matchAll(/(node_modules\/)?@ishibashi0112\/spreadsheet-grid-solid(?![-\w])(\/[\w./-]*[\w])?/g)];
    expect(paths.length).toBeGreaterThan(5);
    for (const [, nodeModules, subpath] of paths) {
      if (nodeModules) {
        const file = (subpath ?? '').slice(1);
        // README.md は npm がいつも同梱する。
        expect(file === 'README.md' || packageJson.files.some((entry) => file === entry || file.startsWith(`${entry}/`))).toBe(true);
      } else {
        expect(Object.keys(packageJson.exports)).toContain(subpath ? `.${subpath}` : '.');
      }
    }
  });
});