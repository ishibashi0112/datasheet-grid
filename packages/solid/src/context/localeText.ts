// 文言(localeText)を子の部品へ渡す文脈。React 版の hooks/useGridLocaleText.ts の GridLocaleTextContext にあたります。
//   値は accessor(props.localeText が変わったら読み直す)。Provider の外では既定の日本語。
import { createContext, createMemo, useContext } from 'solid-js';
import {
  resolvePopupLocaleText,
  type PopupLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextPopups';
import {
  DEFAULT_GRID_LOCALE_TEXT,
  type FeatureLocaleText,
  type ResolvedGridLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';

export const GridLocaleTextContext = createContext<() => ResolvedGridLocaleText>(() => DEFAULT_GRID_LOCALE_TEXT);

export const useGridLocaleText = (): (() => ResolvedGridLocaleText) => useContext(GridLocaleTextContext);

// 機能の部品が文言を読みます。その機能だけが使う文言(D = core の logic/localeText<機能>.ts の表の型)は、機能の localeText として
//   シェルが既定に重ねてあるので、型だけを足します(React 版と同じ。既定はその機能の部品だけが読み込む)。
export const useFeatureLocaleText = <D>(): (() => FeatureLocaleText<D>) =>
  useContext(GridLocaleTextContext) as () => FeatureLocaleText<D>;

// ポップアップ(列フィルター / ツールパネル / 日付のカレンダー)だけが使う文言を既定で埋めます(React 版の
//   hooks/usePopupLocaleText.ts。React 版は遅れて読み込む部品からだけ読む)。
export const usePopupLocaleText = (): (() => PopupLocaleText) => {
  const texts = useGridLocaleText();
  return createMemo(() => resolvePopupLocaleText(texts()));
};

// 機能セットの各機能の文言の既定(localeText)を本体の既定に重ねます(シェルが 1 回だけ作る。React 版と同じ)。
export const mergeFeatureLocaleDefaults = (features: object): ResolvedGridLocaleText =>
  Object.assign(
    {},
    DEFAULT_GRID_LOCALE_TEXT,
    ...Object.values(features).map((feature: { localeText?: object } | undefined) => feature?.localeText),
  ) as ResolvedGridLocaleText;