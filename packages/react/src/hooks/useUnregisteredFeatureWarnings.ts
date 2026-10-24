// 追加(差し込み式 段階 2): 機能セットに入っていない機能の prop が使われていたら、開発時に 1 回だけ警告します
//   (core logic/featureWarnings)。createSpreadsheetGrid が作るコンポーネントの先頭で呼びます(全部入りの
//   SpreadsheetGrid は全機能がそろっているので呼ばない)。本番では何もしない hook に差し替わり、利用側のバンドラが
//   警告の処理と prop の判定表ごと取り除きます(process.env.NODE_ENV の置き換え)。
import { useEffect } from 'react';
import { warnUnregisteredFeatureProps } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import type { ReactGridFeatures } from '../features/types';
import type { SpreadsheetGridProps } from '../model/gridTypes';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

type FeatureName = keyof ReactGridFeatures;

// 機能ごとの「その機能の prop が使われているか」。機能を足すと型がここへの追加を求めます。
const FEATURE_PROPS: {
  [K in FeatureName]-?: { prop: string; isUsed: <T extends object>(props: SpreadsheetGridProps<T>) => boolean };
} = {
  find: { prop: 'find', isUsed: (props) => props.find !== undefined && props.find !== false },
  fillHandle: { prop: 'fillHandle', isUsed: (props) => Boolean(props.fillHandle) },
  // 列の並べ替えは onColumnsChange で有効になる(リサイズ等と共通の prop なので、それでは警告しない)。
  columnReorder: { prop: 'columnDragMotion', isUsed: (props) => props.columnDragMotion !== undefined },
  rowDrag: { prop: 'enableRowDrag', isUsed: (props) => props.enableRowDrag === true },
  scrollHint: { prop: 'scrollHint', isUsed: (props) => props.scrollHint !== undefined && props.scrollHint !== false },
};

function useUnregisteredFeatureWarningsInDev<T extends object>(
  props: SpreadsheetGridProps<T>,
  features: ReactGridFeatures,
): void {
  // 警告の対象を文字列のキーへ畳みます(中身が変わったときだけ effect を走らせる)。
  const missingKey = (Object.keys(FEATURE_PROPS) as FeatureName[])
    .filter((name) => features[name] === undefined && FEATURE_PROPS[name].isUsed(props))
    .map((name) => FEATURE_PROPS[name].prop)
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