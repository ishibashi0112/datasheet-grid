// 追加(差し込み式 段階 2): 機能セットに入っていない機能の prop が使われていたら、開発時に 1 回だけ警告します
//   (core logic/featureWarnings)。entries は [prop 名, 使われているか, 機能セットにあるか]。本番では何もしない
//   hook に差し替わり、利用側のバンドラが警告の処理ごと取り除きます(process.env.NODE_ENV の置き換え)。
import { useEffect } from 'react';
import { warnUnregisteredFeatureProps } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

export type UnregisteredFeatureEntry = readonly [prop: string, used: boolean, registered: boolean];

function useUnregisteredFeatureWarningsInDev(entries: readonly UnregisteredFeatureEntry[]): void {
  // 警告の対象を文字列のキーへ畳みます(entries は毎レンダー新しい配列のため、中身が変わったときだけ effect を走らせる)。
  const missingKey = entries
    .filter(([, used, registered]) => used && !registered)
    .map(([prop]) => prop)
    .join(',');
  useEffect(() => {
    if (missingKey !== '') {
      warnUnregisteredFeatureProps(missingKey.split(','));
    }
  }, [missingKey]);
}

const useUnregisteredFeatureWarningsInProduction: typeof useUnregisteredFeatureWarningsInDev = () => {};

export const useUnregisteredFeatureWarnings =
  process.env.NODE_ENV === 'production'
    ? useUnregisteredFeatureWarningsInProduction
    : useUnregisteredFeatureWarningsInDev;