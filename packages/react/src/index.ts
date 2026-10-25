// SpreadsheetGrid の公開エントリ(バレル)です。
// ライブラリ利用者はこの index 経由で import します。reducer / hooks / view / logic /
// selectors などの内部実装は公開しません。公開する型は API_REFERENCE.md と対応します。

// 公開コンポーネント(named のみ。default export は廃止しました)。
export { SpreadsheetGrid } from './SpreadsheetGrid';
// 変更(差し込み式 段階 6): コンポーネント以外の公開物(関数と型)は /lite と共通の common へ移しました。
export * from './common';