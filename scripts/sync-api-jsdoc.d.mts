// 追加(api-docs): sync-api-jsdoc.mjs の型宣言です(vitest の同期テストから純関数を import するため)。
export declare const REFERENCE_PATH: string;
export declare const SOURCE_PATH: string;
export declare function syncApiJsdoc(
  reference: string,
  source: string,
): { output: string; errors: string[]; changedMembers: string[] };