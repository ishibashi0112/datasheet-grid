// 追加(api-docs): 公開型の JSDoc が API_REFERENCE.md の表と同期していることを検査します。
//   JSDoc は scripts/sync-api-jsdoc.mjs が表から生成します(tsc の d.ts は // コメントを落とすため、npm 利用者 /
//   AI に説明を届けるには JSDoc が要る)。失敗したら:
//   - errors(表と型の過不足): 型にフィールドを足したら API_REFERENCE.md の該当表に行を足す(逆も同様)。
//   - changedMembers(JSDoc のずれ): `pnpm run docs:jsdoc` で再生成する。
import { describe, expect, it } from 'vitest';
import reference from '../../../react/API_REFERENCE.md?raw';
import source from './gridTypes.core.ts?raw';
import { syncApiJsdoc } from '../../../../scripts/sync-api-jsdoc.mjs';

describe('公開型の JSDoc(API_REFERENCE.md の表から生成)', () => {
  const result = syncApiJsdoc(reference, source);

  it('表と型のフィールドが 1 対 1 に対応する', () => {
    expect(result.errors).toEqual([]);
  });

  it('JSDoc が表と同期している(ずれたら pnpm run docs:jsdoc)', () => {
    expect(result.changedMembers).toEqual([]);
  });

  it('API_REFERENCE.md の表から主要な型のフィールドへ JSDoc が付いている', () => {
    expect(source).toMatch(/\/\*\*\n {3}\* グリッドの明示高さ。[\s\S]*?\*\/\n {2}height\?: number \| string;/);
  });
});