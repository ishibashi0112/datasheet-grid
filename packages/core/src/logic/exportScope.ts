import type { CsvExportScope } from '../model/gridTypes.unbound';
import { warnDeprecated } from '../utils/deprecation';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

// 追加(export-scope 再編): エクスポート scope の正規化純関数です。
//   実利用(SS2603)で「'visible' = フィルターで見えている行」という誤読が発生した(実体は仮想化
//   ウィンドウ = 描画中の行のため、出力行数がスクロール位置に依存して変わる)ことを受け、scope を
//   意味論ベースの 4 値('view' / 'raw' / 'rendered' / 'selection')へ再編しました。旧 'all' / 'visible' は
//   後方互換エイリアスとして受け付け続けます(実行時挙動は従来と完全同一 = 既存利用者を壊さない)。
//   本ファイルはその「エイリアス → 新 scope」の対応だけを持つ純関数で、範囲解決(行アクセサ /
//   行レンジ / 列集合)は SpreadsheetGrid 本体の resolveExportScope が担います。

// 正規化後の scope(エイリアスを含まない 4 値)です。
export type NormalizedCsvExportScope = 'view' | 'raw' | 'rendered' | 'selection';

// 旧エイリアスを新 scope へ写します: 'all' → 'view'、'visible' → 'rendered'。新 4 値はそのまま返します。
// 変更(1.0 の準備): 旧エイリアスは 1.0.0 で消すので、使われたら開発時だけ警告します(utils/deprecation.ts)。
export const normalizeExportScope = (
  scope: CsvExportScope,
): NormalizedCsvExportScope => {
  if (scope === 'all') {
    if (process.env.NODE_ENV !== 'production') {
      warnDeprecated('exportScopeAll');
    }
    return 'view';
  }
  if (scope === 'visible') {
    if (process.env.NODE_ENV !== 'production') {
      warnDeprecated('exportScopeVisible');
    }
    return 'rendered';
  }
  return scope;
};