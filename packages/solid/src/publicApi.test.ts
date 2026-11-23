// 追加(段階 3-3 公開の形): Solid 版の入口が React 版と同じ名前の関数・部品・型を出しているかを確かめます(利用側が React 版の
//   ドキュメントのまま import を書けるように)。
//   - 値: React 版の index(全部入り)と /lite が出す値(React 版だけのもの REACT_ONLY_VALUES を除く)が、
//     Solid 版の入口にすべてあること・Solid 版の入口に余分なものが無いこと。
//   - 型: React 版の common.ts の `export type { … }` の名前(ReactGridTypes は SolidGridTypes)と、Solid 版の index.ts の名前が同じこと。
//   - 入口: /locales/en と /testing と /ai が React 版と同じものを出すこと(/ai の useGridAsk は Solid の慣例の名前で
//     createGridAsk、その型 UseGridAskOptions / UseGridAskResult は CreateGridAskOptions / CreateGridAskResult。段 3-1)。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as solidIndex from './index';
import * as solidLocalesEn from './locales/en';
import * as solidTesting from './testing/index';
import * as solidAi from './ai';

// React 版のソースは型検査で辿らないよう、パスを変数にして読みます(parity/harness.tsx と同じ)。
const REACT_SRC = `${resolve(import.meta.dirname, '../../react/src')}/`;
// React 版だけのもの(今は無い)。
const REACT_ONLY_VALUES = new Set<string>();

// 行のコメントを先に消します(コメントの中の `{ className, style }` で切れないように)。
const typeNames = (source: string): string[] =>
  [...source.replace(/\/\/.*$/gm, '').matchAll(/export type \{([^}]*)\}/g)]
    .flatMap((match) => (match[1] ?? '').split(','))
    .map((name) => name.trim())
    .filter((name) => name !== '');

describe('Solid 版の入口(React 版と同じ名前)', () => {
  it('React 版の index と /lite が出す値を、React 版だけのものを除いてすべて出す', async () => {
    const reactIndex = (await import(/* @vite-ignore */ `${REACT_SRC}index.ts`)) as Record<string, unknown>;
    const reactLite = (await import(/* @vite-ignore */ `${REACT_SRC}lite.ts`)) as Record<string, unknown>;
    const reactValues = new Set([...Object.keys(reactIndex), ...Object.keys(reactLite)].filter((name) => !REACT_ONLY_VALUES.has(name)));
    expect(Object.keys(solidIndex).sort()).toEqual([...reactValues].sort());
  });

  it('React 版の common.ts と同じ名前の型を出す(束ね型は SolidGridTypes)', () => {
    const reactTypes = typeNames(readFileSync(`${REACT_SRC}common.ts`, 'utf8')).map((name) => (name === 'ReactGridTypes' ? 'SolidGridTypes' : name));
    const reactEntryTypes = [
      ...typeNames(readFileSync(`${REACT_SRC}lite.ts`, 'utf8')),
      ...reactTypes,
    ];
    const solidTypes = typeNames(readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8'));
    expect([...new Set(solidTypes)].sort()).toEqual([...new Set(reactEntryTypes)].sort());
  });

  it('/locales/en と /testing は React 版と同じものを出す', async () => {
    const reactLocalesEn = (await import(/* @vite-ignore */ `${REACT_SRC}locales/en.ts`)) as Record<string, unknown>;
    const reactTesting = (await import(/* @vite-ignore */ `${REACT_SRC}testing/index.ts`)) as Record<string, unknown>;
    expect(Object.keys(solidLocalesEn).sort()).toEqual(Object.keys(reactLocalesEn).sort());
    expect(solidLocalesEn.localeTextEn).toBe(reactLocalesEn.localeTextEn);
    expect(solidLocalesEn.gridAskLocaleTextEn).toBe(reactLocalesEn.gridAskLocaleTextEn);
    expect(Object.keys(solidTesting).sort()).toEqual(Object.keys(reactTesting).sort());
  });

  it('/ai は React 版と同じものを出す(useGridAsk は createGridAsk)', async () => {
    const rename = (name: string) =>
      name === 'useGridAsk'
        ? 'createGridAsk'
        : name === 'UseGridAskOptions'
          ? 'CreateGridAskOptions'
          : name === 'UseGridAskResult'
            ? 'CreateGridAskResult'
            : name;
    const reactAi = (await import(/* @vite-ignore */ `${REACT_SRC}ai.ts`)) as Record<string, unknown>;
    expect(Object.keys(solidAi).sort()).toEqual(Object.keys(reactAi).map(rename).sort());
    // core の関数はどちらも同じもの。
    expect(solidAi.readGridAskAnswer).toBe(reactAi.readGridAskAnswer);
    const reactTypes = typeNames(readFileSync(`${REACT_SRC}ai.ts`, 'utf8')).map(rename);
    const solidTypes = typeNames(readFileSync(resolve(import.meta.dirname, 'ai.ts'), 'utf8'));
    expect([...new Set(solidTypes)].sort()).toEqual([...new Set(reactTypes)].sort());
  });
});