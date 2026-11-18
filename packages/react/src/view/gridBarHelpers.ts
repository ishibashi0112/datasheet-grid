import type { ReactNode } from 'react';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

// 追加: Grid の slot renderer を解決します。
//   バーの文字列と slot context の派生 summary は core の logic/gridBarSummary(フレームワークに依存しないため移した)。
export const resolveGridSlot = <T,>(
  slotRenderer:
    | ((context: SpreadsheetGridSlotContext<T>) => ReactNode)
    | undefined,
  context: SpreadsheetGridSlotContext<T>,
  fallback: ReactNode,
) => {
  if (slotRenderer) {
    return slotRenderer(context);
  }
  return fallback;
};