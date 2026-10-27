import { describe, expect, it } from 'vitest';
import skill from '../skills/spreadsheet-grid/SKILL.md?raw';
import reference from '../API_REFERENCE.md?raw';
import packageJsonText from '../package.json?raw';
import { standardFeatures } from './features/standard';

// 追加(AI の入口): npm に同梱する Skill(skills/spreadsheet-grid/SKILL.md)が、公開 API とずれていないかを見張ります。
//   Skill は AI コーディングツールが読む手順書で、名前を 1 つ間違えると AI がそのまま無い prop を書きます。
//   - frontmatter が Agent Skills の仕様(name はディレクトリ名と同じ英小文字 + ハイフン、description は 1024 字まで)に沿う
//   - 本文の `名前` が API_REFERENCE.md に単語として出てくる(prop / メソッド / 型の改名を検出する)
//   - 本文に並べた standardFeatures の機能が、実際のプリセットの機能と同じ
//   - 「見出し」が API_REFERENCE.md の見出しにある(AI はこの名前で節を探す)
//   - パッケージのパスが exports か同梱ファイルにある
//   失敗したら Skill を直す(API_REFERENCE.md の見出しや名前を変えたときは Skill も合わせる)。
const SKILL_DIR = 'spreadsheet-grid';
const PACKAGE_NAME = '@ishibashi0112/spreadsheet-grid';

const packageJson = JSON.parse(packageJsonText) as { files: string[]; exports: Record<string, unknown> };

const frontmatterMatch = /^---\n([\s\S]*?)\n---\n/.exec(skill);
const frontmatter = frontmatterMatch?.[1] ?? '';
const body = frontmatterMatch ? skill.slice(frontmatterMatch[0].length) : skill;
const field = (name: string) => new RegExp(`^${name}: (.*)$`, 'm').exec(frontmatter)?.[1] ?? '';

// 本文の `…` のうち、API の名前に見えるもの(コードブロックの外)。
const proseWithoutCodeBlocks = body.replace(/```[\s\S]*?```/g, '');
const inlineCode = [...proseWithoutCodeBlocks.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? '');
const identifiers = [...new Set(inlineCode.filter((code) => /^[A-Za-z][A-Za-z0-9]*(<T>)?(\(\))?$/.test(code)))];

// API_REFERENCE.md に出てこないが Skill に書いてよい名前(React / ツールの名前)。
const NOT_IN_REFERENCE = new Set(['forwardRef', 'map', 'tsc']);

// 部分一致だと `ref` が `refreshServerSide` に当たるなどで改名を見逃すため、前後が英数字でない所に出てくるかで見ます。
const appearsAsWord = (text: string, name: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text);

const referenceHeadings = reference.split('\n').filter((line) => /^#{2,3} /.test(line));

describe('同梱の Skill(skills/spreadsheet-grid/SKILL.md)', () => {
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

  it('npm に同梱される(package.json の files)', () => {
    expect(packageJson.files).toContain('skills');
    expect(packageJson.files).toContain('API_REFERENCE.md');
  });

  it('本文の API の名前が API_REFERENCE.md に出てくる', () => {
    expect(identifiers.length).toBeGreaterThan(20);
    const missing = identifiers
      .map((code) => code.replace(/<T>$/, '').replace(/\(\)$/, ''))
      .filter((name) => !NOT_IN_REFERENCE.has(name) && !appearsAsWord(reference, name));
    expect(missing).toEqual([]);
  });

  it('standardFeatures の中身が実際のプリセットと同じ', () => {
    const line = body.split('\n').find((text) => text.includes('`standardFeatures` は '));
    expect(line).toBeDefined();
    const listed = (line ?? '').slice((line ?? '').indexOf('`standardFeatures` は ') + '`standardFeatures` は '.length).split('。')[0] ?? '';
    const names = [...listed.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
    expect([...names].sort()).toEqual(Object.keys(standardFeatures).sort());
  });

  it('「見出し」が API_REFERENCE.md の見出しにある', () => {
    const table = body.slice(body.indexOf('## 5.'), body.indexOf('## 6.'));
    const names = [...table.matchAll(/「([^」]+)」/g)].map((m) => m[1] ?? '');
    expect(names.length).toBeGreaterThan(15);
    const missing = names.filter((name) => !referenceHeadings.some((heading) => heading.includes(name)));
    expect(missing).toEqual([]);
  });

  it('パッケージのパスが exports か同梱ファイルにある', () => {
    const paths = [...skill.matchAll(/(node_modules\/)?@ishibashi0112\/spreadsheet-grid(?![-\w])(\/[\w./-]*[\w])?/g)];
    expect(paths.length).toBeGreaterThan(5);
    for (const [, nodeModules, subpath] of paths) {
      if (nodeModules) {
        // node_modules 越しに読むファイルは files に入っていること。
        const file = (subpath ?? '').slice(1);
        expect(packageJson.files.some((entry) => file === entry || file.startsWith(`${entry}/`))).toBe(true);
      } else {
        expect(Object.keys(packageJson.exports)).toContain(subpath ? `.${subpath}` : '.');
      }
    }
  });
});