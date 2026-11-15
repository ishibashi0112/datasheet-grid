// 追加(ドキュメントの整備): sync-api-pages.mjs の型宣言です(vitest の同期テストから純関数を import するため)。
export declare const REFERENCE_PATH: string;
export declare const PAGES_DIR: string;
export declare const SITE_DOCS_URL: string;
export declare const PAGES: readonly {
  file: string;
  title: string;
  description: string;
  sections: readonly string[];
  moveIn?: { from: string; after: string; blocks: readonly string[] };
}[];
export declare function buildApiPages(reference: string): { pages: Record<string, string>; errors: string[] };