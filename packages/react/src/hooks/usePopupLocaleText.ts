// 追加(英語対応): 遅れて読み込む部品(列フィルター・ツールパネル・日付のカレンダー)の文言です。グリッドの文言の
//   残り(この部品だけが使う文言)を既定で埋めます。このファイルはその部品からだけ読み込みます。
import { useMemo } from 'react';
import {
  resolvePopupLocaleText,
  type PopupLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextPopups';
import { useGridLocaleText } from './useGridLocaleText';

export const usePopupLocaleText = (): PopupLocaleText => {
  const texts = useGridLocaleText();
  return useMemo(() => resolvePopupLocaleText(texts), [texts]);
};