// 背の高い行で上にそろえたセルの 1 行のエディタの文字を、セルの 1 行目にそろえます(core utils/topAlignedInput)。React 版の
//   editors/useTopAlignedInput.ts にあたります。描き終わった後と、そろえ方・セルの高さが変わったときに合わせます。
//   effect の後半(DOM を触る側)では signal を読まず、前半で読んだ値を使います(Solid の開発ビルドの STRICT_READ_UNTRACKED)。
import { createRenderEffect, onSettled, untrack } from 'solid-js';
import {
  alignInputTextToTop,
  resolveHiddenTopOf,
} from '@ishibashi0112/spreadsheet-grid-core/internal/utils/topAlignedInput';

export function createTopAlignedInput(
  input: () => HTMLInputElement | undefined,
  alignTop: () => boolean,
  cellHeight: () => number,
): void {
  const apply = ([element, top, height]: readonly [HTMLInputElement | undefined, boolean, number]) => {
    if (element) {
      // セルの上が帯の下に隠れていたら、文字を見えている所の 1 行目へ下げる(1.2.0 の確かめ直し C-N1)。
      alignInputTextToTop(element, top, height, top ? resolveHiddenTopOf(element) : 0);
    }
  };
  const read = () => [input(), alignTop(), cellHeight()] as const;
  createRenderEffect(read, apply);
  onSettled(() => apply(untrack(read)));
}