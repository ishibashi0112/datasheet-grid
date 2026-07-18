// 追加(scrollHint): スクロール位置インジケーターのオーバーレイです。
//   .ssg-shell 直下(autosize / filter overlay と同層)へ絶対配置し、pointer-events: none の
//   装飾として既存操作へ一切干渉しません。位置・行番号は親(SpreadsheetGrid)の
//   scrollTop / 縦ジオメトリ props から毎レンダー導出し(親はスクロールごとに再レンダー済み)、
//   「スクロール中か」の活動フラグだけを本コンポーネントが自前の passive リスナーで持ちます
//   (親の scrollTop state 変化を effect で検知する方式は react-hooks/set-state-in-effect の
//   baseline に触れるため、イベントコールバック内 setState で完結させます)。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { cx } from '../logic/cx';
import type { RowModel } from '../model/gridTypes';
import type { RowMetrics } from '../logic/verticalGeometry';
import { physicalToLogicalScrollTop } from '../logic/verticalGeometry';
import {
  computeScrollHintRulerTicks,
  computeScrollHintTrack,
  computeScrollHintTrackPointerScrollTop,
  resolveScrollHintDetail,
} from '../logic/scrollHint';
import type { ResolvedScrollHintOptions } from '../logic/scrollHint';

// スクロール停止からフェードアウトまでの猶予(ms)です(trigger='scroll' / 'hover')。
const SCROLL_HINT_LINGER_MS = 1000;
// バブルとネイティブスクロールバーの間の右マージン(px)です。
const SCROLL_HINT_BUBBLE_GAP_PX = 8;
// トラックホバー(ジャンププレビュー)の検知帯の幅(px)です。ネイティブスクロールバー
//   (幅はプラットフォーム依存。macOS オーバーレイでは 0)に右端の余白を足した帯を
//   「トラック上」とみなします。
const SCROLL_HINT_TRACK_ZONE_PX = 18;
// ジャンプラベルが上端に近いとき、線の下側へ反転させるしきい値(px)です。
const SCROLL_HINT_JUMP_LABEL_FLIP_PX = 28;

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
  // トラック帯(右端)ホバー中のポインタ y(コンテナ上端基準)。帯の外では null。
  //   ジャンププレビュー(ruler)の駆動に使います。帯の外どうし(null → null)は React の
  //   同値 bail-out で再レンダーしないため、ボディ上のマウス移動はコストを生みません。
  const [trackPointerY, setTrackPointerY] = useState<number | null>(null);
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
    const handlePointerLeave = () => {
      setHovered(false);
      setTrackPointerY(null);
    };
    // トラック帯(スクロールバー + 右端余白)上のポインタ追跡です。ネイティブスクロールバー
    //   上のポインタイベントも要素自身へ届くため、リスナーだけで検知でき、スクロールバー
    //   操作を一切妨げません(オーバーレイ要素は挟みません)。
    const handlePointerMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const zoneStart =
        el.offsetWidth -
        Math.max(el.offsetWidth - el.clientWidth, 0) -
        SCROLL_HINT_TRACK_ZONE_PX;
      setTrackPointerY(x >= zoneStart ? event.clientY - rect.top : null);
    };
    // ResizeObserver は observe 直後にも 1 回発火するため、スクロールバー幅の初期計測を兼ねます。
    const resizeObserver = new ResizeObserver(() => {
      setScrollbarWidth(Math.max(el.offsetWidth - el.clientWidth, 0));
    });
    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('pointerenter', handlePointerEnter);
    el.addEventListener('pointerleave', handlePointerLeave);
    el.addEventListener('pointermove', handlePointerMove, { passive: true });
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('pointerenter', handlePointerEnter);
      el.removeEventListener('pointerleave', handlePointerLeave);
      el.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      if (lingerTimerRef.current !== null) {
        window.clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
    };
  }, [scrollContainerRef]);

  // ルーラー目盛り(スクロール非依存。行数と可視高さが変わったときだけ再計算)。
  const rulerHeight = Math.max(viewportHeight - headerHeight, 0);
  const rulerTicks = useMemo(
    () =>
      options.ruler
        ? computeScrollHintRulerTicks({
            rowCount: rowMetrics.rowCount,
            rulerHeight,
          })
        : [],
    [options.ruler, rowMetrics.rowCount, rulerHeight],
  );

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
  // ルーラーはトラック帯ホバー中も表示します(ジャンプ先を狙っている瞬間こそ目盛りが要るため)。
  const rulerVisible = visible || trackPointerY !== null;

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

  // ジャンププレビュー(ruler + トラック帯ホバー中のみ): ネイティブスクロールバーの
  //   クリック/ドラッグと同じサム中心写像で「ここに飛ぶと行 N」を解決します。
  let jumpPreview: {
    lineY: number;
    rowIndex: number;
    detail: ReactNode;
  } | null = null;
  if (options.ruler && trackPointerY !== null) {
    const jumpScrollTop = computeScrollHintTrackPointerScrollTop(
      trackPointerY,
      track,
      viewportHeight,
    );
    const jumpRowIndex = rowMetrics.rowAtContentY(
      physicalToLogicalScrollTop(jumpScrollTop, verticalScaleFactor),
    );
    jumpPreview = {
      lineY: Math.min(Math.max(trackPointerY, headerHeight), viewportHeight),
      rowIndex: jumpRowIndex,
      detail: resolveScrollHintDetail(options, {
        rowIndex: jumpRowIndex,
        rowData: rowModel.getRow(jumpRowIndex) as T | undefined,
      }),
    };
  }

  return (
    <div className="ssg-scroll-hint" aria-hidden="true">
      {options.ruler && rulerTicks.length > 0 && (
        <div
          className={cx(
            'ssg-scroll-hint-ruler',
            rulerVisible && 'ssg-scroll-hint-ruler--visible',
          )}
          style={{ top: headerHeight, right: scrollbarWidth }}
        >
          {rulerTicks.map((tick) => (
            <div
              key={tick.row}
              className="ssg-scroll-hint-ruler-tick"
              style={{
                top: Math.min(Math.max(tick.y, 6), Math.max(rulerHeight - 6, 6)),
              }}
            >
              <span className="ssg-scroll-hint-ruler-label">{tick.label}</span>
            </div>
          ))}
        </div>
      )}
      {jumpPreview !== null && (
        <div
          className="ssg-scroll-hint-jumpline"
          style={{ top: jumpPreview.lineY, right: scrollbarWidth }}
        >
          <span
            className={cx(
              'ssg-scroll-hint-jumpline-label',
              jumpPreview.lineY < headerHeight + SCROLL_HINT_JUMP_LABEL_FLIP_PX &&
                'ssg-scroll-hint-jumpline-label--below',
            )}
          >
            行 {(jumpPreview.rowIndex + 1).toLocaleString()} へ
            {jumpPreview.detail !== null && (
              <span className="ssg-scroll-hint-jumpline-detail">
                {' '}・ {jumpPreview.detail}
              </span>
            )}
          </span>
        </div>
      )}
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