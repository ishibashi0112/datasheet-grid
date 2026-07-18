// 追加(scrollHint): スクロール位置インジケーターのオーバーレイです。
//   .ssg-shell 直下(autosize / filter overlay と同層)へ絶対配置し、pointer-events: none の
//   装飾として既存操作へ一切干渉しません。位置・行番号は親(SpreadsheetGrid)の
//   scrollTop / 縦ジオメトリ props から毎レンダー導出し(親はスクロールごとに再レンダー済み)、
//   「スクロール中か」の活動フラグだけを本コンポーネントが自前の passive リスナーで持ちます
//   (親の scrollTop state 変化を effect で検知する方式は react-hooks/set-state-in-effect の
//   baseline に触れるため、イベントコールバック内 setState で完結させます)。
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { cx } from '../logic/cx';
import type { RowModel } from '../model/gridTypes';
import type { RowMetrics } from '../logic/verticalGeometry';
import { physicalToLogicalScrollTop } from '../logic/verticalGeometry';
import {
  computeScrollHintTrack,
  resolveScrollHintDetail,
} from '../logic/scrollHint';
import type { ResolvedScrollHintOptions } from '../logic/scrollHint';

// スクロール停止からフェードアウトまでの猶予(ms)です(trigger='scroll' / 'hover')。
const SCROLL_HINT_LINGER_MS = 1000;
// バブルとネイティブスクロールバーの間の右マージン(px)です。
const SCROLL_HINT_BUBBLE_GAP_PX = 8;

export type GridScrollHintProps<T> = {
  options: ResolvedScrollHintOptions<T>;
  // 共有スクロールコンテナ(.ssg-scroll-container)の ref です(活動リスナー / スクロール
  //   バー幅計測に使用。位置計算そのものは props の計測値で行い、render 中に DOM は読みません)。
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // 物理 scrollTop / 可視高さ(clientHeight)。親の scroll リスナー / ResizeObserver 由来の state。
  scrollTop: number;
  viewportHeight: number;
  headerHeight: number;
  // 物理ボディ高さ(pixel scaling 適用後)。コンテンツ全高 = headerHeight + これ。
  physicalBodyHeight: number;
  // 物理 scrollTop → 論理 scrollTop の倍率(pixel scaling 無効時は 1)。
  verticalScaleFactor: number;
  // 論理 y → 行 index の解決(uniform / auto-height の両経路を吸収する既存シーム)。
  rowMetrics: RowMetrics;
  // 行データの取得口(clientSide / SSRM 共通シーム。未ロード行 / グループ行は実行時 undefined)。
  rowModel: RowModel<T>;
};

export function GridScrollHint<T>({
  options,
  scrollContainerRef,
  scrollTop,
  viewportHeight,
  headerHeight,
  physicalBodyHeight,
  verticalScaleFactor,
  rowMetrics,
  rowModel,
}: GridScrollHintProps<T>) {
  // スクロール活動フラグ(最後のスクロールから LINGER ms 経過で消灯)。
  const [scrollActive, setScrollActive] = useState(false);
  // コンテナホバーフラグ(trigger='hover' 用)。
  const [hovered, setHovered] = useState(false);
  // ネイティブ縦スクロールバーの実効幅(px)。macOS 既定のオーバーレイスクロールバーでは 0。
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const lingerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    const handleScroll = () => {
      setScrollActive(true);
      if (lingerTimerRef.current !== null) {
        window.clearTimeout(lingerTimerRef.current);
      }
      lingerTimerRef.current = window.setTimeout(() => {
        lingerTimerRef.current = null;
        setScrollActive(false);
      }, SCROLL_HINT_LINGER_MS);
    };
    const handlePointerEnter = () => setHovered(true);
    const handlePointerLeave = () => setHovered(false);
    // ResizeObserver は observe 直後にも 1 回発火するため、スクロールバー幅の初期計測を兼ねます。
    const resizeObserver = new ResizeObserver(() => {
      setScrollbarWidth(Math.max(el.offsetWidth - el.clientWidth, 0));
    });
    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('pointerenter', handlePointerEnter);
    el.addEventListener('pointerleave', handlePointerLeave);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('pointerenter', handlePointerEnter);
      el.removeEventListener('pointerleave', handlePointerLeave);
      resizeObserver.disconnect();
      if (lingerTimerRef.current !== null) {
        window.clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
    };
  }, [scrollContainerRef]);

  // スクロール不能(全行が viewport に収まる)/ 行なし ではインジケーター自体を描画しません。
  const track = computeScrollHintTrack({
    scrollTop,
    contentHeight: headerHeight + physicalBodyHeight,
    viewportHeight,
  });
  if (track === null || rowMetrics.rowCount <= 0) {
    return null;
  }

  const visible =
    options.trigger === 'always' ||
    scrollActive ||
    (options.trigger === 'hover' && hovered);

  // 物理 scrollTop → 論理 scrollTop → 表示先頭行。既存の縦ジオメトリ写像
  //   (computeVerticalGeometry の firstVisible)と同一式で、pixel scaling /
  //   auto-height の両経路と数値一致します。
  const logicalScrollTop = physicalToLogicalScrollTop(
    Math.min(Math.max(scrollTop, 0), track.maxScroll),
    verticalScaleFactor,
  );
  const topRowIndex = rowMetrics.rowAtContentY(logicalScrollTop);
  // SSRM 未ロード行 / グループ行は実行時 undefined(シーム契約)→ detail はフォールバック。
  const rowData = rowModel.getRow(topRowIndex) as T | undefined;
  const detail: ReactNode = resolveScrollHintDetail(options, {
    rowIndex: topRowIndex,
    rowData,
  });

  return (
    <div className="ssg-scroll-hint" aria-hidden="true">
      {options.bubble && (
        <div
          className={cx(
            'ssg-scroll-hint-bubble',
            visible && 'ssg-scroll-hint-bubble--visible',
          )}
          style={{
            top: track.centerY,
            right: scrollbarWidth + SCROLL_HINT_BUBBLE_GAP_PX,
          }}
        >
          <span className="ssg-scroll-hint-bubble-main">
            行 {(topRowIndex + 1).toLocaleString()}
            <span className="ssg-scroll-hint-bubble-total">
              {' '}/ {rowMetrics.rowCount.toLocaleString()}
            </span>
          </span>
          {detail !== null && (
            <span className="ssg-scroll-hint-bubble-detail">{detail}</span>
          )}
        </div>
      )}
    </div>
  );
}