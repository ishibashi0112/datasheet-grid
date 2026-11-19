// スクロール位置インジケーター(scrollHint prop。行番号のバブル / カスタムスクロールバー / ルーラー。機能
//   features/scrollHint の部品)。React 版の view/GridScrollHint.tsx と同じ DOM と class。.ssg-shell の直下へ絶対配置し、
//   バブル / ルーラー / ジャンプの線は pointer-events: none の飾り。カスタムスクロールバー(options.scrollbar)のガターだけが
//   ドラッグ / クリックで飛ぶ / ホイールを受けます(中身のスクロールはネイティブのまま。ガターは scrollTop を写すだけ)。
//   位置・行番号はシェルの scrollTop / 縦のジオメトリから求め、「スクロール中か」などの一時的な状態だけをこの部品が持ちます。
import { For, Show, createMemo, createSignal, createEffect } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { RowMetrics } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import { physicalToLogicalScrollTop } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import { resolveDataRowNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
import {
  computeScrollHintRulerTicks,
  computeScrollHintTrack,
  computeScrollHintTrackPointerScrollTop,
  resolveScrollHintDetail,
  type ResolvedScrollHintOptions,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollHint';
import type { RowModel } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { DEFAULT_SCROLL_HINT_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import type { GridResolvedSlot, SolidGridTypes } from '../model/gridTypes';
import { useFeatureLocaleText } from '../context/localeText';
import { px } from '../primitives/style';

// スクロールが止まってから消えるまでの猶予(ms。trigger が 'scroll' / 'hover' のとき)。
const SCROLL_HINT_LINGER_MS = 1000;
// バブルとスクロールバー(ガターかネイティブのバー)の間の右の余白(px)。
const SCROLL_HINT_BUBBLE_GAP_PX = 8;
// カスタムスクロールバーのガターの幅(px)。
export const SCROLL_HINT_GUTTER_WIDTH_PX = 14;
// ネイティブのバーのとき、トラックの上(ジャンプの線を出す帯)とみなす幅(px。バーの幅 + 右端の余白)。
const SCROLL_HINT_TRACK_ZONE_PX = 18;
// ネイティブの縦のバーの幅が 0(macOS のオーバーレイのバー)のときの帯の幅(px)。
const SCROLL_HINT_OVERLAY_TRACK_ZONE_PX = 8;
// ジャンプの線のラベルが上端に近いとき、線の下へ回すしきい値(px)。
const SCROLL_HINT_JUMP_LABEL_FLIP_PX = 28;

export type GridScrollHintProps<T> = {
  options: ResolvedScrollHintOptions<T, SolidGridTypes>;
  // スクロールする箱(.ssg-scroll-container)。スクロール中かのリスナー / バーの幅の計測 / ガターの scrollTop の書き込みに使う。
  scrollContainerRef: { current: HTMLDivElement | null };
  // 物理の scrollTop / 見える高さ(clientHeight)。
  scrollTop: number;
  viewportHeight: number;
  headerHeight: number;
  // 物理の本体の高さ(倍率を掛けた後)。中身の高さ = headerHeight + これ。
  physicalBodyHeight: number;
  // 物理の scrollTop → 論理の scrollTop の倍率(倍率なしなら 1)。
  verticalScaleFactor: number;
  rowMetrics: RowMetrics;
  rowModel: RowModel<T>;
  slot?: GridResolvedSlot | undefined;
  // ラベル行の表示の index(昇順)。あれば行番号 / 総行数をラベル行を飛ばして数える(行見出しの番号・バーの件数とそろえる)。
  labelViewIndexes?: ArrayLike<number> | null | undefined;
};

export function GridScrollHint<T>(props: GridScrollHintProps<T>) {
  const texts = useFeatureLocaleText<typeof DEFAULT_SCROLL_HINT_LOCALE_TEXT>();
  // スクロール中か(最後のスクロールから LINGER ms で消える)。
  const [scrollActive, setScrollActive] = createSignal(false);
  // 箱 / ガターの上にポインタがあるか(trigger が 'hover' のとき)。
  const [hovered, setHovered] = createSignal(false);
  // ネイティブの縦のバーの実際の幅(px。macOS のオーバーレイのバーでは 0)。
  const [scrollbarWidth, setScrollbarWidth] = createSignal(0);
  // トラックの上にあるポインタの y(トラックの上端から)。トラックの外では null。
  const [trackPointerY, setTrackPointerY] = createSignal<number | null>(null);
  // カスタムスクロールバーのドラッグ中か。
  const [dragging, setDragging] = createSignal(false);
  let lingerTimer: number | null = null;
  // ドラッグ中の「つまみの上端から掴んだ位置」。null = ドラッグしていない。
  let dragGrab: number | null = null;
  let gutter: HTMLDivElement | undefined;

  const scrollbar = createMemo(() => props.options.scrollbar);
  // トラックの座標: カスタムスクロールバーは見出しの下からのガター、ネイティブのバーは箱の全体。
  const trackTop = () => (scrollbar() ? props.headerHeight : 0);
  const trackHeight = () => Math.max(scrollbar() ? props.viewportHeight - props.headerHeight : props.viewportHeight, 0);
  // スクロールできない(全行が見える)ときは何も描かない。
  const track = createMemo(() =>
    computeScrollHintTrack({
      scrollTop: props.scrollTop,
      contentHeight: props.headerHeight + props.physicalBodyHeight,
      viewportHeight: props.viewportHeight,
      trackHeight: trackHeight(),
    }),
  );
  const shown = createMemo(() => track() !== null && props.rowMetrics.rowCount > 0);

  // 箱のリスナー(スクロール中か / ホバー / ネイティブのバーの帯の上のポインタ / バーの幅)。カスタムスクロールバーの
  //   有無が変わったら付け直す(ガターがあるときは帯のポインタはガターが受ける)。
  createEffect(scrollbar, (customScrollbar) => {
    const element = props.scrollContainerRef.current;
    if (!element) {
      return undefined;
    }
    const handleScroll = () => {
      setScrollActive(true);
      if (lingerTimer !== null) {
        window.clearTimeout(lingerTimer);
      }
      lingerTimer = window.setTimeout(() => {
        lingerTimer = null;
        setScrollActive(false);
      }, SCROLL_HINT_LINGER_MS);
    };
    const handlePointerEnter = () => setHovered(true);
    const handlePointerLeave = () => {
      setHovered(false);
      setTrackPointerY(null);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const nativeBarWidth = Math.max(element.offsetWidth - element.clientWidth, 0);
      const zoneStart =
        element.offsetWidth -
        (nativeBarWidth > 0 ? nativeBarWidth + SCROLL_HINT_TRACK_ZONE_PX : SCROLL_HINT_OVERLAY_TRACK_ZONE_PX);
      setTrackPointerY(x >= zoneStart ? event.clientY - rect.top : null);
    };
    // ResizeObserver は observe の直後にも 1 回呼ばれるので、バーの幅の最初の計測も兼ねる。
    const resizeObserver = new ResizeObserver(() => {
      setScrollbarWidth(Math.max(element.offsetWidth - element.clientWidth, 0));
    });
    element.addEventListener('scroll', handleScroll, { passive: true });
    element.addEventListener('pointerenter', handlePointerEnter);
    element.addEventListener('pointerleave', handlePointerLeave);
    if (!customScrollbar) {
      element.addEventListener('pointermove', handlePointerMove, { passive: true });
    }
    resizeObserver.observe(element);
    return () => {
      element.removeEventListener('scroll', handleScroll);
      element.removeEventListener('pointerenter', handlePointerEnter);
      element.removeEventListener('pointerleave', handlePointerLeave);
      element.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      if (lingerTimer !== null) {
        window.clearTimeout(lingerTimer);
        lingerTimer = null;
      }
    };
  });

  // ガターの上のホイールを中身のスクロールへ回す(ガターは箱の兄弟なので、そのままでは何も起きない)。preventDefault が
  //   要るので passive でないリスナーで付ける。
  createEffect(
    () => scrollbar() && shown(),
    (on) => {
      const element = props.scrollContainerRef.current;
      const target = gutter;
      if (!on || !target || !element) {
        return undefined;
      }
      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        element.scrollTop += event.deltaY;
      };
      target.addEventListener('wheel', handleWheel, { passive: false });
      return () => target.removeEventListener('wheel', handleWheel);
    },
  );

  // ルーラーの目盛り(スクロールでは変わらない。行数と見える高さが変わったときだけ求め直す)。
  const rulerHeight = () => Math.max(props.viewportHeight - props.headerHeight, 0);
  // 行番号 / 総行数はラベル行を飛ばして数える(行見出しの番号・バーの件数とそろえる)。
  const labelCount = () => props.labelViewIndexes?.length ?? 0;
  const dataRowCount = createMemo(() => Math.max(props.rowMetrics.rowCount - labelCount(), 0));
  const rowNumberOf = (viewIndex: number): number => {
    const labels = props.labelViewIndexes;
    return labels && labels.length > 0 ? resolveDataRowNumber(labels, viewIndex) : viewIndex + 1;
  };
  const rulerTicks = createMemo(() =>
    props.options.ruler
      ? computeScrollHintRulerTicks({
          rowCount: dataRowCount(),
          rulerHeight: rulerHeight(),
          tenThousands: texts().scrollHintTenThousands,
        })
      : [],
  );

  const visible = () =>
    props.options.trigger === 'always' || scrollActive() || (props.options.trigger === 'hover' && hovered());
  // ルーラーはトラックの上にポインタがあるときも出す(飛ぶ先を狙うときこそ目盛りが要る)。
  const rulerVisible = () => visible() || trackPointerY() !== null;
  // バブル / ルーラーの右端の余白(カスタムスクロールバーはガターの幅、ネイティブのバーは測った幅)。
  const rightInset = () => (scrollbar() ? SCROLL_HINT_GUTTER_WIDTH_PX : scrollbarWidth());

  // 物理の scrollTop → 論理の scrollTop → 見えている先頭の行(縦のジオメトリの firstVisible と同じ式)。
  const topRowIndex = createMemo(() => {
    const current = track();
    if (current === null) {
      return 0;
    }
    const logical = physicalToLogicalScrollTop(
      Math.min(Math.max(props.scrollTop, 0), current.maxScroll),
      props.verticalScaleFactor,
    );
    return props.rowMetrics.rowAtContentY(logical);
  });
  // 行の補足(hintColumn / renderHint)。先頭の行が変わったときだけ求める(SSRM の読み込み前の行 / グループ行は undefined)。
  const detailOf = (rowIndex: number): JSX.Element | string | null =>
    resolveScrollHintDetail<T, SolidGridTypes>(props.options, {
      rowIndex,
      rowData: props.rowModel.getRow(rowIndex) as T | undefined,
    });
  const detail = createMemo(() => detailOf(topRowIndex()));

  // ジャンプの線(ruler があり、トラックの上にポインタがあるときだけ。ドラッグ中はバブルが答えるので出さない)。
  //   スクロールバーのクリック / ドラッグと同じ「つまみの中心」の写し方で「ここへ飛ぶと何行目」を求める。
  const jumpPreview = createMemo(() => {
    const pointerY = trackPointerY();
    const current = track();
    if (!props.options.ruler || pointerY === null || dragging() || current === null) {
      return null;
    }
    const jumpScrollTop = computeScrollHintTrackPointerScrollTop(pointerY, current, trackHeight());
    const rowIndex = props.rowMetrics.rowAtContentY(physicalToLogicalScrollTop(jumpScrollTop, props.verticalScaleFactor));
    return {
      lineY: Math.min(Math.max(trackTop() + pointerY, props.headerHeight), props.viewportHeight),
      rowIndex,
      detail: detailOf(rowIndex),
    };
  });

  // ── カスタムスクロールバー(ガター)のポインタ操作 ──
  //   中身はいつもネイティブのスクロールのまま、ガターは scrollTop を書くだけ(書いた結果の scroll でつまみが追従する)。
  const gutterTrackY = (event: PointerEvent): number =>
    gutter === undefined ? 0 : event.clientY - gutter.getBoundingClientRect().top;
  const applyGutterScroll = (y: number, grab: number) => {
    const element = props.scrollContainerRef.current;
    const current = track();
    if (element === null || current === null) {
      return;
    }
    const range = trackHeight() - current.thumbHeight;
    if (range <= 0) {
      return;
    }
    const fraction = Math.min(Math.max((y - grab) / range, 0), 1);
    element.scrollTop = fraction * current.maxScroll;
  };
  const handleGutterPointerDown = (event: PointerEvent) => {
    const current = track();
    if (current === null) {
      return;
    }
    event.preventDefault();
    const y = gutterTrackY(event);
    // つまみの上なら掴んだ位置を保ち、トラックの上ならつまみの中心を掴んでその場へ飛ぶ(ジャンプの線と同じ)。
    const grab = y >= current.thumbTop && y <= current.thumbTop + current.thumbHeight ? y - current.thumbTop : current.thumbHeight / 2;
    dragGrab = grab;
    setDragging(true);
    setTrackPointerY(null);
    gutter?.setPointerCapture(event.pointerId);
    applyGutterScroll(y, grab);
  };
  const handleGutterPointerMove = (event: PointerEvent) => {
    const y = gutterTrackY(event);
    if (dragGrab !== null) {
      applyGutterScroll(y, dragGrab);
      return;
    }
    setTrackPointerY(y);
  };
  // ドラッグの終わり(pointerup / pointercancel / キャプチャが外れたとき。React 版と同じ)。
  const endGutterDrag = () => {
    dragGrab = null;
    setDragging(false);
  };
  const handleGutterPointerUp = (event: PointerEvent) => {
    endGutterDrag();
    try {
      gutter?.releasePointerCapture(event.pointerId);
    } catch {
      /* キャプチャが既に外れていても害は無い */
    }
  };
  const handleGutterPointerLeave = () => {
    setHovered(false);
    if (dragGrab === null) {
      setTrackPointerY(null);
    }
  };

  return (
    <Show when={shown()}>
      <div class={['ssg-scroll-hint', props.slot?.className]} style={props.slot?.style} aria-hidden="true">
        <Show when={props.options.ruler && rulerTicks().length > 0}>
          <div
            class={['ssg-scroll-hint-ruler', { 'ssg-scroll-hint-ruler--visible': rulerVisible() }]}
            style={{ top: px(props.headerHeight), right: px(rightInset()) }}
          >
            <For each={rulerTicks()} keyed={(tick) => tick.row}>
              {(tick) => (
                <div
                  class="ssg-scroll-hint-ruler-tick"
                  style={{ top: px(Math.min(Math.max(tick().y, 6), Math.max(rulerHeight() - 6, 6))) }}
                >
                  <span class="ssg-scroll-hint-ruler-label">{tick().label}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={jumpPreview()}>
          {(preview) => (
            <div class="ssg-scroll-hint-jumpline" style={{ top: px(preview().lineY), right: px(rightInset()) }}>
              <span
                class={[
                  'ssg-scroll-hint-jumpline-label',
                  {
                    'ssg-scroll-hint-jumpline-label--below':
                      preview().lineY < props.headerHeight + SCROLL_HINT_JUMP_LABEL_FLIP_PX,
                  },
                ]}
              >
                {formatLocaleText(texts().scrollHintJump, { row: rowNumberOf(preview().rowIndex).toLocaleString() })}
                <Show when={preview().detail !== null}>
                  <span class="ssg-scroll-hint-jumpline-detail">
                    {` ${texts().scrollHintJumpSeparator} `}
                    {preview().detail}
                  </span>
                </Show>
              </span>
            </div>
          )}
        </Show>
        <Show when={props.options.bubble}>
          <div
            class={['ssg-scroll-hint-bubble', { 'ssg-scroll-hint-bubble--visible': visible() }]}
            style={{
              top: px(trackTop() + (track()?.centerY ?? 0)),
              right: px(rightInset() + SCROLL_HINT_BUBBLE_GAP_PX),
            }}
          >
            <span class="ssg-scroll-hint-bubble-main">
              {formatLocaleText(texts().scrollHintRow, { row: rowNumberOf(topRowIndex()).toLocaleString() })}
              <span class="ssg-scroll-hint-bubble-total">
                {' '}/ {dataRowCount().toLocaleString()}
              </span>
            </span>
            <Show when={detail() !== null}>
              <span class="ssg-scroll-hint-bubble-detail">{detail()}</span>
            </Show>
          </div>
        </Show>
        <Show when={scrollbar()}>
          <div
            ref={(element) => {
              gutter = element;
            }}
            class={['ssg-scroll-hint-scrollbar', { 'ssg-scroll-hint-scrollbar--dragging': dragging() }]}
            style={{
              top: px(props.headerHeight),
              height: px(trackHeight()),
              width: px(SCROLL_HINT_GUTTER_WIDTH_PX),
            }}
            onPointerDown={handleGutterPointerDown}
            onPointerMove={handleGutterPointerMove}
            onPointerUp={handleGutterPointerUp}
            onPointerCancel={endGutterDrag}
            onLostPointerCapture={endGutterDrag}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={handleGutterPointerLeave}
          >
            <div
              class="ssg-scroll-hint-scrollbar-thumb"
              style={{ top: px(track()?.thumbTop ?? 0), height: px(track()?.thumbHeight ?? 0) }}
            />
          </div>
        </Show>
      </div>
    </Show>
  );
}