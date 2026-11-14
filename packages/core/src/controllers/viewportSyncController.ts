// 追加(非依存化 ③-3): ビューポート同期のコントローラです(React 非依存。旧 hooks/useGridViewportSync の
//   3 つの effect を移設)。update(args) をレンダー後に毎回呼ぶ前提で、各処理の実行条件(旧 effect の
//   deps に相当する引数の参照 / 値の変化)はコントローラ側で判定します(Object.is 比較 = React の deps
//   比較と同じ)。したがって「update を毎回呼ぶ」アダプタでも、旧実装と同じタイミングでだけ動きます。
//   1) 列計測(columnMeasurements)の参照が変わったら virtualizer を再測定する。
//   2) 内容が縮んだら scrollLeft / scrollTop を上限へ clamp する(内容縮小時のはみ出し防止)。
//   3) active cell の「座標」が変わったときだけ可視域へスクロールする(rect 参照だけの変化 = フィルター
//      確定等ではスクロールしない = scroll-jump 対策)。
import type { ColumnMeasurement } from '../logic/geometry';
import type { CellCoord } from '../model/gridTypes.unbound';
import type { StickyTopInset } from '../logic/scrollTargets';
import {
  logicalToPhysicalScrollTop,
  physicalToLogicalScrollTop,
} from '../logic/verticalGeometry';

// active cell の矩形(ペイン列領域内ローカル座標。ActiveCellOverlayRect と同形)。
export type ViewportCellRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ViewportSyncArgs<T> = {
  // 共有スクロールコンテナ(未マウントなら null)。
  scrollElement: HTMLElement | null;
  columnVirtualizer: { measure: () => void };
  columnMeasurements: ColumnMeasurement<T>[];
  totalScrollWidth: number;
  // 物理ボディ高さ(pixel scaling 適用後)。
  physicalBodyHeight: number;
  headerHeight: number;
  leftPaneWidth: number;
  rightPaneWidth: number;
  centerLeadingWidth: number;
  activeCellRect: ViewportCellRect | null;
  // 追加(1.0 前の最終チェック FC-01): active cell が固定ペイン(左 / 右)にあるか。固定ペインは横にスクロールしないので
  //   縦だけ合わせます(従来は固定ペインでは矩形を渡さず、縦にも追従しなかった = ↓ / Enter で画面外へ出たまま打ち込めた)。
  activeCellPinned?: boolean;
  activeCell: CellCoord | null;
  verticalScaleFactor: number;
  // 追加(合計行 3A): 下端に固定する行(合計行)の高さ。スクロール可能な高さに足し、行を見せるときは
  //   その裏に隠れないようにします。既定 0。
  footerHeight?: number;
  // 追加(段階 2 の確かめ直し N4-1): ラベル行の縦スクロール固定の帯。上へ動いた active cell を帯の裏に隠さない。
  stickyTopInset?: StickyTopInset;
};

export type ViewportSyncController<T> = {
  update: (args: ViewportSyncArgs<T>) => void;
};

// 内容縮小時の clamp(純粋な DOM 書き込み。テストからも直接呼べます)。
export const clampScrollToContent = (
  scrollElement: HTMLElement,
  args: Pick<
    ViewportSyncArgs<unknown>,
    'totalScrollWidth' | 'physicalBodyHeight' | 'headerHeight' | 'footerHeight'
  >,
): void => {
  const maxScrollLeft = Math.max(
    args.totalScrollWidth - scrollElement.clientWidth,
    0,
  );
  const maxScrollTop = Math.max(
    args.headerHeight + args.physicalBodyHeight + (args.footerHeight ?? 0) - scrollElement.clientHeight,
    0,
  );
  if (scrollElement.scrollLeft > maxScrollLeft) {
    scrollElement.scrollLeft = maxScrollLeft;
  }
  if (scrollElement.scrollTop > maxScrollTop) {
    scrollElement.scrollTop = maxScrollTop;
  }
};

// active cell を可視域へ入れるスクロール(必要なときだけ scrollTo)。
export const scrollCellIntoView = (
  scrollElement: HTMLElement,
  rect: ViewportCellRect,
  args: Pick<
    ViewportSyncArgs<unknown>,
    | 'headerHeight'
    | 'leftPaneWidth'
    | 'rightPaneWidth'
    | 'centerLeadingWidth'
    | 'verticalScaleFactor'
    | 'footerHeight'
    | 'activeCellPinned'
    | 'stickyTopInset'
  >,
): void => {
  const cellTop = args.headerHeight + rect.top;
  const cellBottom = cellTop + rect.height;
  const cellLeft = args.leftPaneWidth + args.centerLeadingWidth + rect.left;
  const cellRight = cellLeft + rect.width;

  const currentScrollTop = physicalToLogicalScrollTop(
    scrollElement.scrollTop,
    args.verticalScaleFactor,
  );
  const currentScrollLeft = scrollElement.scrollLeft;
  // 変更(合計行 3A): 下端の合計行に隠れる分を除いた高さ(既定 0 = 従来どおり clientHeight)。
  const viewportHeight = scrollElement.clientHeight - (args.footerHeight ?? 0);
  const viewportWidth = scrollElement.clientWidth;

  let nextScrollTop = currentScrollTop;
  let nextScrollLeft = currentScrollLeft;

  // 変更(段階 2 の確かめ直し N4-1): ラベル行の固定の帯に隠れている行も見えていない扱いにし、帯の下へ合わせます。
  const visibleTop = currentScrollTop + args.headerHeight + (args.stickyTopInset?.visibleAt(currentScrollTop) ?? 0);
  const visibleBottom = currentScrollTop + viewportHeight;
  const alignedTop = () =>
    Math.max(cellTop - args.headerHeight - (args.stickyTopInset?.coveringRowAt(rect.top) ?? 0), 0);
  if (cellTop < visibleTop) {
    nextScrollTop = alignedTop();
  } else if (cellBottom > visibleBottom) {
    // 変更(段階 2 の確かめ直し N5-1): 見える高さより背の高い行(auto-height の長い文など)は、下端ではなく上端に合わせます
    //   (下端に合わせると書き出しが見えなかった。Excel と同じ)。
    nextScrollTop = rect.height > visibleBottom - visibleTop ? alignedTop() : Math.max(cellBottom - viewportHeight, 0);
  }

  const visibleLeft = currentScrollLeft + args.leftPaneWidth;
  const visibleRight = currentScrollLeft + viewportWidth - args.rightPaneWidth;
  // 固定ペインのセルは常に横の見える範囲にあるので横は動かしません(rect はそのペインのローカル座標で、中央ペインの
  //   位置ではない)。
  const pinned = args.activeCellPinned === true;
  if (!pinned && cellLeft < visibleLeft) {
    nextScrollLeft = Math.max(cellLeft - args.leftPaneWidth, 0);
  } else if (!pinned && cellRight > visibleRight) {
    nextScrollLeft = Math.max(
      cellRight - viewportWidth + args.rightPaneWidth,
      0,
    );
  }

  if (
    nextScrollTop !== currentScrollTop ||
    nextScrollLeft !== currentScrollLeft
  ) {
    const top = logicalToPhysicalScrollTop(nextScrollTop, args.verticalScaleFactor);
    scrollElement.scrollTo({
      // 変更(BR-5 2026-10-28): 下端に合わせるとき(= 下へ動かすとき)は物理位置を切り上げます(行の位置を縮めて持つ
      //   モードの小数の位置を WebKit が切り捨て、最後の行が合計行の下に 2px 隠れていたため)。
      top: nextScrollTop > currentScrollTop ? Math.ceil(top) : top,
      left: nextScrollLeft,
      behavior: 'auto',
    });
  }
};

// 追加(1.0.2 / 2026-11-09 実アプリの総点検 J-10): キーボードでアクティブセルを動かしたとき、グリッドの外側(スクロールする親と
//   ページ)も最小限スクロールしてセルを見せます。グリッドの下半分がウィンドウの外にあると、↓ でアクティブセルが画面の外へ
//   出てもページが動かず、打ち始めてエディタにフォーカスが移ったときに初めて動いていた。グリッドの中のスクロール
//   (scrollCellIntoView)の後に呼びます。グリッドがフォーカスを持っていて、最後の操作がマウス / タッチでないとき
//   (シェルの data-ssg-pointer が無いとき)だけ。命令的な API でフォーカスが外にあるときと、押したセルでは動かしません。
//   縦だけ。大きさの無い環境(jsdom)では何もしません。
const resolveRevealDelta = (top: number, bottom: number, viewTop: number, viewBottom: number): number => {
  if (top < viewTop) {
    return top - viewTop;
  }
  if (bottom > viewBottom) {
    // 見える高さより背の高いセルは上端に合わせます。
    return Math.min(bottom - viewBottom, top - viewTop);
  }
  return 0;
};

export const revealActiveCellInPage = (
  scrollElement: HTMLElement,
  rect: ViewportCellRect,
  args: Pick<ViewportSyncArgs<unknown>, 'headerHeight' | 'verticalScaleFactor'>,
): void => {
  const doc = scrollElement.ownerDocument;
  const view = doc.defaultView;
  const shell = scrollElement.closest('.ssg-shell');
  const active = doc.activeElement;
  // 変更(1.0.2 / レビュー QA-7): フォーカスがグリッド(シェル)か IME の入力受けにあるときだけ動かします。シェルの中の検索バーで
  //   打つと、ヒットへ移るたびにページが動き、検索バーが画面の外へ出ていた。
  if (
    !view ||
    !shell ||
    !active ||
    (active !== shell && !(active.classList.contains('ssg-ime-input') && shell.contains(active))) ||
    shell.hasAttribute('data-ssg-pointer')
  ) {
    return;
  }
  const box = scrollElement.getBoundingClientRect();
  if (box.height === 0) {
    return;
  }
  const scrollTop = physicalToLogicalScrollTop(scrollElement.scrollTop, args.verticalScaleFactor);
  let top = box.top + scrollElement.clientTop + args.headerHeight + rect.top - scrollTop;
  let bottom = top + rect.height;
  for (
    let element = scrollElement.parentElement;
    element && element !== doc.body && element !== doc.documentElement;
    element = element.parentElement
  ) {
    const max = element.scrollHeight - element.clientHeight;
    if (max <= 0) {
      continue;
    }
    const overflowY = view.getComputedStyle(element).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
      continue;
    }
    const viewTop = element.getBoundingClientRect().top + element.clientTop;
    const delta = resolveRevealDelta(top, bottom, viewTop, viewTop + element.clientHeight);
    if (delta === 0) {
      continue;
    }
    // CSS の scroll-behavior: smooth でも動いた量が分かるよう、行き先を自分で上限へ詰めます。
    const before = element.scrollTop;
    const target = Math.min(Math.max(before + delta, 0), max);
    element.scrollTop = target;
    top -= target - before;
    bottom -= target - before;
  }
  const delta = resolveRevealDelta(top, bottom, 0, view.innerHeight);
  if (delta !== 0) {
    view.scrollBy({ top: delta, behavior: 'auto' });
  }
};

// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-24): 縮めたスクロール(論理全高が MAX_BODY_PX を超える表)で、行の数が
//   変わって縮める率(verticalScaleFactor)が変わったときに、見ている行(論理の位置)を保ちます。物理の scrollTop が
//   同じままだと論理の位置 = scrollTop × 率 が変わり、ログに行を足し続ける 100 万行の表では、上へ戻って読んでいる
//   行が足すたびに流れていた(縮めない表では scrollTop = 論理の位置なので流れない。同じ動きにそろえる)。
//   コミットの後(描く前)に呼び、物理の位置を直したら onAnchored(新しい scrollTop)で知らせます(view スライスへ書く)。
//   変更(1.0.1 の確かめ直し G): 末尾までスクロールしていたときは直しません(1.0.0 と同じく末尾のまま = 足した行が見える)。
//   末尾を追うログ(行を足すたびに scrollToBottom())で、直して上へ動かしてから末尾へ戻す 2 回の描き直しになり、
//   100 万行で足すたびに約 100ms の長いタスクが出ていたため。
export type ScrollScaleAnchor = {
  update: (
    scrollElement: HTMLElement | null,
    verticalScaleFactor: number,
    onAnchored: (scrollTop: number) => void,
  ) => void;
};

export const createScrollScaleAnchor = (): ScrollScaleAnchor => {
  let previousElement: HTMLElement | null = null;
  let previousScale = 1;
  // 前のコミットでのスクロールの上限(縮めたスクロールのときだけ測る。末尾にいたかの判定に使う)。
  let previousMaxTop = 0;
  return {
    update: (scrollElement, verticalScaleFactor, onAnchored) => {
      const element = previousElement;
      const scale = previousScale;
      const maxTop = previousMaxTop;
      previousElement = scrollElement;
      previousScale = verticalScaleFactor;
      previousMaxTop =
        scrollElement !== null && verticalScaleFactor !== 1
          ? Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0)
          : 0;
      if (scrollElement === null || scrollElement !== element || scale === verticalScaleFactor) {
        return;
      }
      const before = scrollElement.scrollTop;
      if (maxTop > 0 && before >= maxTop - 1) {
        return;
      }
      const target = logicalToPhysicalScrollTop(physicalToLogicalScrollTop(before, scale), verticalScaleFactor);
      if (Math.abs(target - before) < 1) {
        return;
      }
      scrollElement.scrollTop = target;
      if (scrollElement.scrollTop !== before) {
        onAnchored(scrollElement.scrollTop);
      }
    },
  };
};

const changed = <A extends object>(
  prev: A | null,
  next: A,
  keys: ReadonlyArray<keyof A>,
): boolean => prev === null || keys.some((key) => !Object.is(prev[key], next[key]));

export const createViewportSyncController = <T,>(): ViewportSyncController<T> => {
  let prev: ViewportSyncArgs<T> | null = null;
  // 3) の座標変化ゲート用: 前回評価した active cell 座標。
  let lastEvaluatedCell: CellCoord | null = null;

  const update = (args: ViewportSyncArgs<T>) => {
    // 1) 列計測の再測定(旧 effect deps: columnVirtualizer, columnMeasurements)。
    if (changed(prev, args, ['columnVirtualizer', 'columnMeasurements'])) {
      args.columnVirtualizer.measure();
    }

    // 2) 内容縮小時の clamp(旧 effect deps: scrollRef, totalScrollWidth, physicalBodyHeight, headerHeight)。
    if (
      changed(prev, args, [
        'scrollElement',
        'totalScrollWidth',
        'physicalBodyHeight',
        'headerHeight',
        'footerHeight',
      ]) &&
      args.scrollElement
    ) {
      clampScrollToContent(args.scrollElement, args);
    }

    // 3) active cell 可視化(旧 effect deps: scrollRef, activeCellRect, activeCell, headerHeight,
    //    leftPaneWidth, rightPaneWidth, centerLeadingWidth, verticalScaleFactor)。
    if (
      changed(prev, args, [
        'scrollElement',
        'activeCellRect',
        'activeCellPinned',
        'activeCell',
        'headerHeight',
        'leftPaneWidth',
        'rightPaneWidth',
        'centerLeadingWidth',
        'verticalScaleFactor',
        'footerHeight',
      ])
    ) {
      const prevCell = lastEvaluatedCell;
      const { activeCell } = args;
      const coordUnchanged =
        prevCell !== null &&
        activeCell !== null &&
        prevCell.row === activeCell.row &&
        prevCell.col === activeCell.col;
      lastEvaluatedCell = activeCell;
      if (!coordUnchanged && args.scrollElement && args.activeCellRect) {
        scrollCellIntoView(args.scrollElement, args.activeCellRect, args);
        revealActiveCellInPage(args.scrollElement, args.activeCellRect, args);
      }
    }

    prev = args;
  };

  return { update };
};