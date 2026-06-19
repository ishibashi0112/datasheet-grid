import { useEffect, type RefObject } from 'react';
import type { ActiveCellOverlayRect } from '../ActiveCellOverlay';
import type { ColumnMeasurement } from '../logic/geometry';
// 追加(scroll-space 仮想化): active cell 自動スクロール / clamp の物理↔論理換算。
import {
  logicalToPhysicalScrollTop,
  physicalToLogicalScrollTop,
} from '../logic/verticalGeometry';

type VirtualizerLike = {
  measure: () => void;
};

type UseGridViewportSyncArgs<T> = {
  // 変更(10-G): 縦横ともに「外側スクロールコンテナ 1 本」がネイティブスクロールします。
  //             旧 bodyScrollRef(中央ペイン)はスクロールしなくなったため、scroll clamp /
  //             active cell 可視化はすべてこの共有スクロール要素に対して行います。
  scrollRef: RefObject<HTMLDivElement | null>;
  columnVirtualizer: VirtualizerLike;
  // columnVirtualizer の再計測トリガー用の依存です（中身は座標計算には使いません）。
  columnMeasurements: ColumnMeasurement<T>[];
  // 変更(10-G): 共有スクロールコンテナの内側コンテンツ全幅です。
  //             = 左固定ペイン幅 + 中央ペイン幅 + 右固定ペイン幅。
  //             水平方向の scroll clamp(content shrink 対策)に使います。
  totalScrollWidth: number;
  // 変更(scroll-space 仮想化): content-shrink clamp は物理ボディ高さ基準にします
  //   (旧 totalBodyHeight=論理全高 → physicalBodyHeight=ブラウザ上限内へ圧縮済みの高さ)。
  physicalBodyHeight: number;
  headerHeight: number;
  // 追加(10-G): 左/右固定ペインの幅です。固定ペインは sticky で視界の左右端を覆うため、
  //             active cell の可視判定では「固定ペインに隠れない領域」へ収める必要があります。
  leftPaneWidth: number;
  rightPaneWidth: number;
  // 追加(10-G): 中央ペインが列の前に確保する先頭幅です（左固定なし時の行ヘッダー幅 / 左固定あり時 0）。
  centerLeadingWidth: number;
  // active cell が中央ペインにあるときの「中央ペインローカル矩形」です。
  // 固定ペインにある場合は横スクロール不要なので null が渡されます。
  activeCellRect: ActiveCellOverlayRect | null;
  // 追加(scroll-space 仮想化): active cell 自動スクロールの論理↔物理換算倍率
  //   (scaleFactor=1 のとき両変換は恒等＝現状と完全一致)。
  verticalScaleFactor: number;
};

// 追加: virtualizer 再計測、content shrink 時の scroll clamp、active cell 可視化をまとめます。
// 変更(10-G): スクロールのマスターを中央ペインから「外側の共有スクロールコンテナ」へ移しました。
//             これにより左右固定ペインは同一ネイティブスクロールで縦に動き、JS による
//             transform 同期が不要になります（＝固定列のチカチカ/ティアリングが原理的に消えます）。
export const useGridViewportSync = <T,>({
  scrollRef,
  columnVirtualizer,
  columnMeasurements,
  totalScrollWidth,
  physicalBodyHeight,
  headerHeight,
  leftPaneWidth,
  rightPaneWidth,
  centerLeadingWidth,
  activeCellRect,
  verticalScaleFactor,
}: UseGridViewportSyncArgs<T>) => {
  // 追加: column geometry が変わった際に horizontal virtualizer を再計測します。
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer, columnMeasurements]);

  // 追加: content サイズが縮んだ場合に scroll を clamp します。
  // 変更(10-G): 対象を中央ペインから共有スクロールコンテナへ。最大スクロール量は
  //             コンテンツ全幅/全高 - クライアントサイズで求めます。
  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    const scrollElement = scrollRef.current;
    const maxScrollLeft = Math.max(
      totalScrollWidth - scrollElement.clientWidth,
      0,
    );
    const maxScrollTop = Math.max(
      headerHeight + physicalBodyHeight - scrollElement.clientHeight,
      0,
    );

    if (scrollElement.scrollLeft > maxScrollLeft) {
      scrollElement.scrollLeft = maxScrollLeft;
    }
    if (scrollElement.scrollTop > maxScrollTop) {
      scrollElement.scrollTop = maxScrollTop;
    }
  }, [scrollRef, totalScrollWidth, physicalBodyHeight, headerHeight]);

  // 追加: active cell が画面外へ出た場合に、scroll container を自動調整して常に表示領域内へ収めます。
  // 注記(10-G): activeCellRect は中央ペインローカル座標です。中央ペイン以外（固定列）に
  //             active cell がある場合は呼び出し側で null が渡るため、横スクロールは発生しません。
  //   - 縦: ヘッダー(sticky)に隠れない領域 [scrollTop + headerHeight, scrollTop + clientHeight] に収めます。
  //   - 横: 左右固定ペイン(sticky)に隠れない領域
  //         [scrollLeft + leftPaneWidth, scrollLeft + clientWidth - rightPaneWidth] に収めます。
  useEffect(() => {
    if (!scrollRef.current || !activeCellRect) {
      return;
    }

    const scrollElement = scrollRef.current;

    // セルの「スクロールコンテンツ内」絶対座標(論理)です。
    const cellTop = headerHeight + activeCellRect.top;
    const cellBottom = cellTop + activeCellRect.height;
    const cellLeft = leftPaneWidth + centerLeadingWidth + activeCellRect.left;
    const cellRight = cellLeft + activeCellRect.width;

    // 変更(scroll-space 仮想化): 縦の可視判定は論理座標で行い、設定時に物理 scrollTop へ戻します。
    //   行は物理 36px のまま(サイズは非圧縮)なので可視域は実 viewportHeight のまま不変で、
    //   縦のスクロール位置のみ scaleFactor 換算します(scaleFactor=1 のとき現状と完全一致)。
    //   横(scrollLeft)は圧縮対象外のため物理値のまま据え置きです。
    const currentScrollTop = physicalToLogicalScrollTop(
      scrollElement.scrollTop,
      verticalScaleFactor,
    );
    const currentScrollLeft = scrollElement.scrollLeft;
    const viewportHeight = scrollElement.clientHeight;
    const viewportWidth = scrollElement.clientWidth;

    let nextScrollTop = currentScrollTop;
    let nextScrollLeft = currentScrollLeft;

    const visibleTop = currentScrollTop + headerHeight;
    const visibleBottom = currentScrollTop + viewportHeight;
    if (cellTop < visibleTop) {
      nextScrollTop = Math.max(cellTop - headerHeight, 0);
    } else if (cellBottom > visibleBottom) {
      nextScrollTop = Math.max(cellBottom - viewportHeight, 0);
    }

    const visibleLeft = currentScrollLeft + leftPaneWidth;
    const visibleRight = currentScrollLeft + viewportWidth - rightPaneWidth;
    if (cellLeft < visibleLeft) {
      nextScrollLeft = Math.max(cellLeft - leftPaneWidth, 0);
    } else if (cellRight > visibleRight) {
      nextScrollLeft = Math.max(
        cellRight - viewportWidth + rightPaneWidth,
        0,
      );
    }

    if (
      nextScrollTop !== currentScrollTop ||
      nextScrollLeft !== currentScrollLeft
    ) {
      scrollElement.scrollTo({
        // nextScrollTop は論理。実 scrollTop は物理なので戻します(横はそのまま)。
        top: logicalToPhysicalScrollTop(nextScrollTop, verticalScaleFactor),
        left: nextScrollLeft,
        behavior: 'auto',
      });
    }
  }, [
    scrollRef,
    activeCellRect,
    headerHeight,
    leftPaneWidth,
    rightPaneWidth,
    centerLeadingWidth,
    verticalScaleFactor,
  ]);
};

export default useGridViewportSync;