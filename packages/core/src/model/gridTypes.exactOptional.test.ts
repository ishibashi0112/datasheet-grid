// 追加(1.0.2 / 2026-11-09 実アプリの総点検 K-08): 公開型の省略可の項目は `name?: X | undefined` と書く。利用側が
//   `exactOptionalPropertyTypes`(@tsconfig/strictest など)を有効にしていても undefined を渡せるようにするため
//   (リポジトリの設定では `?: X` と同じ意味なので、書き忘れても型の検査では気付けない)。
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import source from './gridTypes.core.ts?raw';

const optionalWithoutUndefined = (text: string): string[] => {
  const file = ts.createSourceFile('gridTypes.core.ts', text, ts.ScriptTarget.Latest, true);
  const includesUndefined = (type: ts.TypeNode): boolean => {
    if (
      type.kind === ts.SyntaxKind.UndefinedKeyword ||
      type.kind === ts.SyntaxKind.AnyKeyword ||
      type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      return true;
    }
    if (ts.isUnionTypeNode(type)) {
      return type.types.some(includesUndefined);
    }
    return ts.isParenthesizedTypeNode(type) && includesUndefined(type.type);
  };
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertySignature(node) && node.questionToken && node.type && !includesUndefined(node.type)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      found.push(`${line + 1}: ${node.name.getText(file)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

describe('公開型の省略可の項目(K-08)', () => {
  it('gridTypes.core.ts の省略可の項目は、どれも型に undefined を含む', () => {
    expect(optionalWithoutUndefined(source)).toEqual([]);
  });

  it('書き忘れを見つける', () => {
    expect(optionalWithoutUndefined('type A = {\n  a?: number;\n  b?: number | undefined;\n  c?: (() => void) | undefined;\n};')).toEqual([
      '2: a',
    ]);
  });
});