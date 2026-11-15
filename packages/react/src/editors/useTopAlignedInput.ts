// 追加(1.2.0): 背の高い行で上にそろえたセルの 1 行のエディタの文字を、セルの 1 行目にそろえます(core
//   utils/topAlignedInput。描く前に合わせて、真ん中から上へ動く途中を見せない)。
import type { RefObject } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import { alignInputTextToTop } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/topAlignedInput';

export const useTopAlignedInput = (
  inputRef: RefObject<HTMLInputElement | null>,
  alignTop: boolean,
  cellHeight: number,
): void => {
  useIsomorphicLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      alignInputTextToTop(input, alignTop, cellHeight);
    }
  }, [inputRef, alignTop, cellHeight]);
};
