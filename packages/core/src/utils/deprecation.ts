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
//        それ以外は jsdoc に書いた型 / フィールドへ @deprecated を手で書く。prop やメソッドはエディタで取り消し線が出るが、
//        値(scope の 'all' のような文字列)には出ないので、値の非推奨は開発時の警告が頼り。
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

// 今は空です(1.0.0 で、0.9.0 から非推奨だったエクスポートの scope 'all' / 'visible' を消しました)。項目の書き方(架空の例):
//   samplePropRename: {
//     name: '`sampleProp`',
//     since: '1.3.0',
//     removeIn: '2.0.0',
//     jsdoc: 'SpreadsheetGridProps.sampleProp',
//     what: { ja: 'prop `sampleProp`', en: 'The prop `sampleProp`' },
//     instead: { ja: '`newProp` を使ってください。', en: 'Use `newProp` instead.' },
//   },
export const DEPRECATIONS = {} satisfies Record<string, Deprecation>;

export type DeprecationId = keyof typeof DEPRECATIONS;

const warned = new Set<string>();

export const formatDeprecationWarning = (entry: Deprecation): string =>
  `[spreadsheet-grid] 非推奨: ${entry.what.ja} は ${entry.removeIn} で消します。${entry.instead.ja}` +
  `\n[spreadsheet-grid] Deprecated: ${entry.what.en} will be removed in ${entry.removeIn}. ${entry.instead.en}`;

// key と項目を直接受ける形です(表が空のときもテストで仕組みを確かめられるように)。ふだんは warnDeprecated を使います。
export const warnDeprecation = (key: string, entry: Deprecation): void => {
  if (process.env.NODE_ENV === 'production' || warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(formatDeprecationWarning(entry));
};

export const warnDeprecated = (id: DeprecationId): void => {
  warnDeprecation(id, DEPRECATIONS[id]);
};

// テスト用: 「1 回だけ」の記録を消します。
export const resetDeprecationWarningsForTest = (): void => {
  warned.clear();
};