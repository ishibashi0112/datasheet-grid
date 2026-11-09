// 追加(1.0 の準備): 非推奨を知らせる共通の仕組みです。React 版もこれを使います。
//   非推奨にしたものは DEPRECATIONS に 1 つ足し、使われた所で warnDeprecated(id) を呼びます。開発時だけ、1 つにつき
//   1 回、日本語の行と英語の行の 2 行で console.warn します。判定は利用側のバンドラが置き換える process.env.NODE_ENV
//   (logic/featureWarnings.ts と同じ。import.meta.env.DEV はライブラリのビルド時に固定されるため使わない)。
//   呼ぶ側も `if (process.env.NODE_ENV !== 'production') warnDeprecated(...)` で包みます(本番のバンドルから呼び出しと
//   この表を消すため)。
//   非推奨にする手順(docs/versioning と CLAUDE.md にも):
//     1. ここに 1 つ足す(since = 非推奨にした版、removeIn = 消す版。1.0 からは次の major)。
//     2. API_REFERENCE.md と website の API リファレンスの、その名前の行に「**非推奨**(removeIn で消します)」と書く。
//        表から JSDoc を作る型(sync-api-jsdoc.mjs の対象)のフィールドなら、JSDoc の @deprecated は再生成で付く。
//        それ以外は jsdoc に書いた型 / フィールドへ @deprecated を手で書く。
//     3. CHANGELOG の「## 未リリース」の「### 非推奨」に書く。
//   deprecation.test.ts がこの表と API リファレンス(両方)・JSDoc・CHANGELOG を照らし合わせ、
//   bump-version.mjs は removeIn 以上の版へ上げるときに、ここに残っていれば止めます(消し忘れの防止)。

// 型だけの宣言です(ブラウザに process は無く、利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

export type Deprecation = {
  // API リファレンスの表の名前のセル(例: "`'all'`")。その行に「**非推奨**」と removeIn を書く。
  name: string;
  // 非推奨にした版と、消す版。
  since: string;
  removeIn: string;
  // @deprecated の JSDoc を持つ型(`型名`)かフィールド(`型名.フィールド名`)。core の model/gridTypes.core.ts のもの。
  jsdoc: string;
  // 警告の文: 「<what> は <removeIn> で消します。<instead>」/「<what> will be removed in <removeIn>. <instead>」
  what: { ja: string; en: string };
  instead: { ja: string; en: string };
};

export const DEPRECATIONS = {
  exportScopeAll: {
    name: "`'all'`",
    since: '0.9.0',
    removeIn: '1.0.0',
    jsdoc: 'DeprecatedCsvExportScope',
    what: { ja: "エクスポートの scope `'all'`", en: "The export scope `'all'`" },
    instead: { ja: "`'view'` を使ってください(挙動は同じです)。", en: "Use `'view'` instead (same behavior)." },
  },
  exportScopeVisible: {
    name: "`'visible'`",
    since: '0.9.0',
    removeIn: '1.0.0',
    jsdoc: 'DeprecatedCsvExportScope',
    what: { ja: "エクスポートの scope `'visible'`", en: "The export scope `'visible'`" },
    instead: {
      ja: "`'rendered'` を使ってください(挙動は同じです。フィルターで見えている行全体なら `'view'`)。",
      en: "Use `'rendered'` instead (same behavior; for all rows that pass the filters, use `'view'`).",
    },
  },
} satisfies Record<string, Deprecation>;

export type DeprecationId = keyof typeof DEPRECATIONS;

const warned = new Set<DeprecationId>();

export const formatDeprecationWarning = (id: DeprecationId): string => {
  const entry: Deprecation = DEPRECATIONS[id];
  return (
    `[spreadsheet-grid] 非推奨: ${entry.what.ja} は ${entry.removeIn} で消します。${entry.instead.ja}` +
    `\n[spreadsheet-grid] Deprecated: ${entry.what.en} will be removed in ${entry.removeIn}. ${entry.instead.en}`
  );
};

export const warnDeprecated = (id: DeprecationId): void => {
  if (process.env.NODE_ENV === 'production' || warned.has(id)) {
    return;
  }
  warned.add(id);
  console.warn(formatDeprecationWarning(id));
};

// テスト用: 「1 回だけ」の記録を消します。
export const resetDeprecationWarningsForTest = (): void => {
  warned.clear();
};