// 文言(localeText)を子の部品へ渡す文脈。React 版の hooks/useGridLocaleText.ts の GridLocaleTextContext にあたります。
//   値は accessor(props.localeText が変わったら読み直す)。Provider の外では既定の日本語。
import { createContext, useContext } from 'solid-js';
import {
  DEFAULT_GRID_LOCALE_TEXT,
  type ResolvedGridLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';

export const GridLocaleTextContext = createContext<() => ResolvedGridLocaleText>(() => DEFAULT_GRID_LOCALE_TEXT);

export const useGridLocaleText = (): (() => ResolvedGridLocaleText) => useContext(GridLocaleTextContext);