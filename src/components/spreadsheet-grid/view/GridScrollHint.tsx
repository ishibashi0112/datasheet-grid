// 追加(scrollHint): スクロール位置インジケーターのオーバーレイです。
//   .ssg-shell 直下(autosize / filter overlay と同層)へ絶対配置し、バブル / ルーラー /
//   ジャンププレビューは pointer-events: none の装飾として既存操作へ一切干渉しません。
//   カスタムスクロールバー(options.scrollbar)のガターのみ pointer-events を生かし、
//   ドラッグ / クリックジャンプ / ホイールを受けます(コンテンツのスクロール自体は
//   ネイティブのまま。ガターは scrollTop を鏡映しするだけです)。
//   位置・行番号は親(SpreadsheetGrid)の scrollTop / 縦ジオメトリ props から毎レンダー
//   導出し(親はスクロールごとに再レンダー済み)、「スクロール中か」の活動フラグだけを
//   本コンポーネントが自前の passive リスナーで持ちます(親の scrollTop state 変化を
//   effect で検知する方式は react-hooks/set-state-in-effect の baseline に触れるため、
//   イベントコールバック内 setState で完結させます)。
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
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
// バブルとスクロールバー(ガターまたはネイティブバー)の間の右マージン(px)です。
const SCROLL_HINT_BUBBLE_GAP_PX = 8;
// カスタムスクロールバーのガター幅(px)です。
export const SCROLL_HINT_GUTTER_WIDTH_PX = 14;
// ネイティブバー運用時のトラックホバー(ジャンププレビュー)検知帯の幅(px)です。
//   ネイティブスクロールバー(幅はプラットフォーム依存。macOS オーバーレイでは 0)に
//   右端の余白を足した帯を「トラック上」とみなします。
const SCROLL_HINT_TRACK_ZONE_PX = 18;
// ジャンプラベルが上端に近いとき、線の下側へ反転させるしきい値(px)です。
const SCROLL_HINT_JUMP_LABEL_FLIP_PX = 28;

export type GridScrollHintProps<T> = {
  options: ResolvedScrollHintOptions<T>;
  // 共有スクロールコンテナ(.ssg-scroll-container)の ref です(活動リスナー / スクロール
  //   バー幅計測 / ガター操作の scrollTop 書き込みに使用。位置計算そのものは props の
  //   計測値で行い、render 中に DOM は読みません)。
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
  // コンテナ / ガターのホバーフラグ(trigger='hover' 用)。
  const [hovered, setHovered] = useState(false);
  // ネイティブ縦スクロールバーの実効幅(px)。macOS 既定のオーバーレイスクロールバーでは 0。
  //   カスタムスクロールバー有効時はネイティブ縦バーを CSS で隠すため常に 0 相当です。
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  // トラックホバー中のポインタ y(トラック上端基準)。トラック外では null。
  //   ジャンププレビュー(ruler)の駆動に使います。トラック外どうし(null → null)は React の
  //   同値 bail-out で再レンダーしないため、ボディ上のマウス移動はコストを生みません。
  const [trackPointerY, setTrackPointerY] = useState<number | null>(null);
  // カスタムスクロールバーのドラッグ中フラグ(サムの active 色 + ホバープレビュー抑止)。
  const [dragging, setDragging] = useState(false);
  const lingerTimerRef = useRef<number | null>(null);
  // ドラッグ中の「サム上端からの掴み位置オフセット」。null = 非ドラッグ。
  const dragGrabRef = useRef<number | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  // トラックの座標系: カスタムスクロールバーはヘッダー下から始まる専用ガター、
  //   ネイティブバー運用ではコンテナ全高(ネイティブの実トラック相当)です。
  const trackTop = options.scrollbar ? headerHeight : 0;
  const trackHeight = Math.max(
    options.scrollbar ? viewportHeight - headerHeight : viewportHeight,
    0,
  );
  // スクロール不能(全行が viewport に収まる)ならインジケーター全体を描画しません。
  const track = computeScrollHintTrack({
    scrollTop,
    contentHeight: headerHeight + physicalBodyHeight,
    viewportHeight,
    trackHeight,
  });
  const scrollable = track !== null && rowMetrics.rowCount > 0;

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
    // ネイティブバー運用時のみ: 右端帯(スクロールバー + 余白)上のポインタ追跡です。
    //   ネイティブスクロールバー上のポインタイベントも要素自身へ届くため、リスナーだけで
    //   検知でき、スクロールバー操作を一切妨げません。カスタムスクロールバー有効時は
    //   ガター自身のハンドラが担当するため付けません。
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
    if (!options.scrollbar) {
      el.addEventListener('pointermove', handlePointerMove, { passive: true });
    }
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
  }, [scrollContainerRef, options.scrollbar]);

  // ガター上のホイールをコンテンツのスクロールへ転送します(ガターはコンテナの兄弟のため、
  //   ネイティブでは何も起きない)。preventDefault が要るため React の onWheel(root 登録が
  //   passive)ではなく、非 passive のネイティブリスナーで張ります。
  useEffect(() => {
    // ガターが描画されているときのみ(options.scrollbar / scrollable は描画条件そのもの)。
    if (!options.scrollbar || !scrollable) {
      return;
    }
    const gutter = gutterRef.current;
    const el = scrollContainerRef.current;
    if (!gutter || !el) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      el.scrollTop += event.deltaY;
    };
    gutter.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      gutter.removeEventListener('wheel', handleWheel);
    };
  }, [scrollContainerRef, options.scrollbar, scrollable]);

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

  if (track === null || rowMetrics.rowCount <= 0) {
    return null;
  }

  const visible =
    options.trigger === 'always' ||
    scrollActive ||
    (options.trigger === 'hover' && hovered);
  // ルーラーはトラックホバー中も表示します(ジャンプ先を狙っている瞬間こそ目盛りが要るため)。
  const rulerVisible = visible || trackPointerY !== null;

  // バブル / ルーラーの右端オフセット。カスタムスクロールバー有効時はガター幅、
  //   ネイティブバー運用時は実測のネイティブバー幅です。
  const rightInset = options.scrollbar
    ? SCROLL_HINT_GUTTER_WIDTH_PX
    : scrollbarWidth;

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

  // ジャンププレビュー(ruler + トラックホバー中のみ。ドラッグ中はバブルが答えるため抑止):
  //   スクロールバーのクリック/ドラッグと同じサム中心写像で「ここに飛ぶと行 N」を解決します。
  let jumpPreview: {
    lineY: number;
    rowIndex: number;
    detail: ReactNode;
  } | null = null;
  if (options.ruler && trackPointerY !== null && !dragging) {
    const jumpScrollTop = computeScrollHintTrackPointerScrollTop(
      trackPointerY,
      track,
      trackHeight,
    );
    const jumpRowIndex = rowMetrics.rowAtContentY(
      physicalToLogicalScrollTop(jumpScrollTop, verticalScaleFactor),
    );
    jumpPreview = {
      lineY: Math.min(
        Math.max(trackTop + trackPointerY, headerHeight),
        viewportHeight,
      ),
      rowIndex: jumpRowIndex,
      detail: resolveScrollHintDetail(options, {
        rowIndex: jumpRowIndex,
        rowData: rowModel.getRow(jumpRowIndex) as T | undefined,
      }),
    };
  }

  // ── カスタムスクロールバー(ガター)のポインタ操作 ──
  //   コンテンツ側は常にネイティブスクロールのまま、ガターは el.scrollTop を書くだけです
  //   (書いた結果の scroll イベントで親 state → サム位置が追従する一方向データフロー)。
  const gutterTrackY = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const gutter = gutterRef.current;
    return gutter === null
      ? 0
      : event.clientY - gutter.getBoundingClientRect().top;
  };
  const applyGutterScroll = (y: number, grab: number) => {
    const el = scrollContainerRef.current;
    if (el === null) {
      return;
    }
    const range = trackHeight - track.thumbHeight;
    if (range <= 0) {
      return;
    }
    const fraction = Math.min(Math.max((y - grab) / range, 0), 1);
    el.scrollTop = fraction * track.maxScroll;
  };
  const handleGutterPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const y = gutterTrackY(event);
    // サム上なら掴んだ位置を保持、トラック上ならサム中心掴みで即ジャンプ(プレビューと同挙動)。
    const grab =
      y >= track.thumbTop && y <= track.thumbTop + track.thumbHeight
        ? y - track.thumbTop
        : track.thumbHeight / 2;
    dragGrabRef.current = grab;
    setDragging(true);
    setTrackPointerY(null);
    gutterRef.current?.setPointerCapture(event.pointerId);
    applyGutterScroll(y, grab);
  };
  const handleGutterPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const y = gutterTrackY(event);
    if (dragGrabRef.current !== null) {
      applyGutterScroll(y, dragGrabRef.current);
      return;
    }
    setTrackPointerY(y);
  };
  const handleGutterPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragGrabRef.current = null;
    setDragging(false);
    gutterRef.current?.releasePointerCapture(event.pointerId);
  };
  const handleGutterPointerEnter = () => setHovered(true);
  const handleGutterPointerLeave = () => {
    setHovered(false);
    if (dragGrabRef.current === null) {
      setTrackPointerY(null);
    }
  };

  return (
    <div className="ssg-scroll-hint" aria-hidden="true">
      {options.ruler && rulerTicks.length > 0 && (
        <div
          className={cx(
            'ssg-scroll-hint-ruler',
            rulerVisible && 'ssg-scroll-hint-ruler--visible',
          )}
          style={{ top: headerHeight, right: rightInset }}
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
          style={{ top: jumpPreview.lineY, right: rightInset }}
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
            top: trackTop + track.centerY,
            right: rightInset + SCROLL_HINT_BUBBLE_GAP_PX,
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
      {options.scrollbar && (
        <div
          ref={gutterRef}
          className={cx(
            'ssg-scroll-hint-scrollbar',
            dragging && 'ssg-scroll-hint-scrollbar--dragging',
          )}
          style={{
            top: headerHeight,
            height: trackHeight,
            width: SCROLL_HINT_GUTTER_WIDTH_PX,
          }}
          onPointerDown={handleGutterPointerDown}
          onPointerMove={handleGutterPointerMove}
          onPointerUp={handleGutterPointerUp}
          onPointerEnter={handleGutterPointerEnter}
          onPointerLeave={handleGutterPointerLeave}
        >
          <div
            className="ssg-scroll-hint-scrollbar-thumb"
            style={{ top: track.thumbTop, height: track.thumbHeight }}
          />
        </div>
      )}
    </div>
  );
}