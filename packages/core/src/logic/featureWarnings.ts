// 追加(差し込み式 段階 2): 機能セットに入っていない機能の prop が渡されたときの開発時の警告です。
//   その prop は何もしない(機能の代役が受ける)ので、気づけるように 1 つの prop につき 1 回だけ console.warn します。
//   本番では出しません。判定は利用側のバンドラが置き換える process.env.NODE_ENV で行います(import.meta.env.DEV は
//   ライブラリのビルド時に false へ固定されて利用側の開発時にも消えるため使わない)。

// 型だけの宣言です(ブラウザに process は無く、利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

const warnedProps = new Set<string>();

const HINT = 'createSpreadsheetGrid の features に該当する機能を入れてください。';

// 変更(差し込み式 段階 6): 機能の名前(機能セットのキー)が分かれば、足すべき機能を名指しします(/lite の機能の
//   部品はキー + Feature の名前で公開している。例: filtering → filteringFeature)。
const hintFor = (feature: string | undefined): string =>
  feature === undefined ? HINT : `createSpreadsheetGrid の features に \`${feature}: ${feature}Feature\` を入れてください。`;

// props: 使われているのに機能セットに無い prop の名前。feature: その prop の機能(機能セットのキー)。
export const warnUnregisteredFeatureProps = (props: readonly string[], feature?: string): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  for (const prop of props) {
    if (warnedProps.has(prop)) {
      continue;
    }
    warnedProps.add(prop);
    console.warn(
      `[spreadsheet-grid] prop \`${prop}\` が渡されましたが、その機能が機能セットに入っていないため何もしません。` +
        hintFor(feature),
    );
  }
};

// method: 呼ばれたのに機能セットに無い命令的 API のメソッド名(例: exportCsv)。1 つのメソッドにつき 1 回だけ。
export const warnUnregisteredFeatureMethod = (method: string, feature?: string): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const key = `${method}()`;
  if (warnedProps.has(key)) {
    return;
  }
  warnedProps.add(key);
  console.warn(
    `[spreadsheet-grid] \`${key}\` が呼ばれましたが、その機能が機能セットに入っていないため何もしません。` + hintFor(feature),
  );
};

// 追加(差し込み式 段階 5): state: 状態としては受け取ったのに、機能セットに無いため効かないもの(例: フィルターの機能が
//   無い構成で applyState に渡したフィルター)。1 つにつき 1 回だけ。
export const warnUnregisteredFeatureState = (state: string, feature?: string): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const key = `state:${state}`;
  if (warnedProps.has(key)) {
    return;
  }
  warnedProps.add(key);
  console.warn(
    `[spreadsheet-grid] ${state}が設定されましたが、その機能が機能セットに入っていないため効きません。` + hintFor(feature),
  );
};

// テスト用: 警告済みの記録を消します(同じ prop の警告をテストごとに確かめるため)。
export const resetUnregisteredFeatureWarnings = (): void => {
  warnedProps.clear();
};