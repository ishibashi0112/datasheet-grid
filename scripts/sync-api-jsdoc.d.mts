// 追加(api-docs): sync-api-jsdoc.mjs の型宣言です(vitest の同期テストから純関数を import するため)。
export declare const REFERENCE_PATH: string;
export declare const SOURCE_PATH: string;
// 追加(1.0 の準備): 非推奨の行の印と表の読み取り(core の utils/deprecation.test.ts が使う)。
export declare const DEPRECATED_MARK: string;
export declare function parseTables(markdown: string): {
  h2: string;
  h3: string;
  header: string[];
  rows: { lineNumber: number; cells: string[] }[];
}[];
export declare function syncApiJsdoc(
  reference: string,
  source: string,
): { output: string; errors: string[]; changedMembers: string[] };