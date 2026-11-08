// 追加(英語対応): グリッドの文言(localeText を既定と合わせたもの)を部品へ渡す context です。シェルが渡し、
//   本体・バー・メニューなどの部品は useGridLocaleText で読みます。遅れて読み込む部品(列フィルター・ツールパネル)は
//   usePopupLocaleText で残りの文言を既定で埋めて読みます(その既定を初期 JS に入れないため、別のファイル)。
import { createContext, useContext } from 'react';
import {
  DEFAULT_GRID_LOCALE_TEXT,
  type FeatureLocaleText,
  type ResolvedGridLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';

export const GridLocaleTextContext = /* @__PURE__ */ createContext<ResolvedGridLocaleText>(DEFAULT_GRID_LOCALE_TEXT);

export const useGridLocaleText = (): ResolvedGridLocaleText => useContext(GridLocaleTextContext);

// 追加(英語対応): 機能の部品が文言を読みます。その機能だけが使う文言(D = core の logic/localeText<機能>.ts の表の型)は、
//   機能の localeText としてシェルが既定に重ねてあるので、型だけを足します(既定をその機能の部品だけが読み込み、
//   機能を使わない構成(/lite)の初期 JS に入れないため)。
export const useFeatureLocaleText = <D,>(): FeatureLocaleText<D> => useContext(GridLocaleTextContext) as FeatureLocaleText<D>;

// 追加(英語対応): 機能セットの各機能の文言の既定(localeText)を本体の既定に重ねます(シェルが 1 回だけ作る)。
export const mergeFeatureLocaleDefaults = (features: object): ResolvedGridLocaleText =>
  Object.assign(
    {},
    DEFAULT_GRID_LOCALE_TEXT,
    ...Object.values(features).map((feature: { localeText?: object } | undefined) => feature?.localeText),
  ) as ResolvedGridLocaleText;