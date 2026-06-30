import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { GridColumn, GridColumnPinned } from '../model/gridTypes';
import {
  findPaneDropSlot,
  paneDropSlotBoundaryX,
  getColumnPane,
  type ColumnPane,
  type GridPaneLayout,
} from '../logic/geometry';

// 追加(13-B3-2): ヘッダーのバッジ(Excel 列名)を grip にした列の D&D 並べ替え controller です。
// 設計メモ:
//   - ドラッグ中は React state を更新しません。ドロップインジケータ(縦線)は各 pane に常設した
//     div を ref 経由で imperative に表示/移動します(SpreadsheetGrid は再レンダーせず、
//     GridHeaderRow の memo を完全維持。観点⑦)。
//   - pointerdown(バッジ) → setPointerCapture → captured 要素へ pointermove/up/cancel を直付け
//     (ephemeral listener。常駐 effect を増やしません)。
//   - ヒットテストは useGridPointerInteractions.getCellCoordFromClientPoint と同じ pane 判定式
//     (left.right より左=左 / right.left 以降=右 / それ以外=中央。中央は移動する rect.left で
//      横スクロール量を吸収。観点⑧)。slot は findPaneDropSlot(pane-local midpoint)で算出。
//   - up で computeHeaderReorderedKeys(全列の permutation を生成。非表示列も保全)→
//     applyColumnOrderAndPin(keys, pinOverride)。ドロップ先 pane → 'left'|undefined|'right'。
//   - 公開ハンドラは latest-ref で恒久安定化(GridHeaderRow memo 維持)。
//   - 範囲: center 内 / center↔left / center↔right が本命ですが、pane 判定が幾何的に一様な
//     ため left 内 / right 内 / left↔right も同一経路で成立します(13-B3-2b を実質吸収)。

type ApplyColumnOrderAndPin = (
  orderedKeys: string[],
  pinOverride?: Map<string, GridColumnPinned | undefined>,
) => void;

// 追加(13-B3-2): ドラッグ列を target pane の「表示列内 slot」へ移動した全列キー順を返します。
//   - 非表示列も含む columns 全体を pane ごとにキー配列へ分割 → ドラッグ列を source から除去 →
//     target pane の「表示列(visible)」基準の slot 位置へ挿入 → left+center+right を連結。
//   - same-pane では除去で後方が詰まるため slot を 1 補正し、同一 slot は no-op として null。
//   - slot は paneLayout.entries(表示列のみ)基準で来るため、ここでも visible 列でアンカーします。
//   - 返す配列は length === columns.length の permutation です(1 列のみ移動するため)。
//   ※ computeSectionReorderedKeys(ColumnChooserPanel)のクロスペイン版に相当します。
function computeHeaderReorderedKeys<T>(
  columns: GridColumn<T>[],
  draggedKey: string,
  targetPane: ColumnPane,
  slotInTargetVisible: number,
): string[] | null {
  const dragged = columns.find((column) => column.key === draggedKey);
  if (!dragged) return null;
  const sourcePane = getColumnPane(dragged);

  const groups: Record<ColumnPane, string[]> = { left: [], center: [], right: [] };
  const visibleByKey = new Map<string, boolean>();
  for (const column of columns) {
    groups[getColumnPane(column)].push(column.key);
    visibleByKey.set(column.key, column.visible !== false);
  }

  // ドラッグ前の「target pane 表示列内 index」(same-pane 補正 / no-op 判定用。cross-pane は -1)。
  const targetVisibleBefore = groups[targetPane].filter((key) =>
    visibleByKey.get(key),
  );
  const fromVisibleIndex = targetVisibleBefore.indexOf(draggedKey);

  // source から除去。
  const sourceIndex = groups[sourcePane].indexOf(draggedKey);
  if (sourceIndex < 0) return null;
  groups[sourcePane].splice(sourceIndex, 1);

  // slot 補正(same-pane で除去により後方が詰まる)。
  let slot = slotInTargetVisible;
  if (
    sourcePane === targetPane &&
    fromVisibleIndex >= 0 &&
    slot > fromVisibleIndex
  ) {
    slot -= 1;
  }

  // 除去後の target pane 表示列を基準に slot をクランプ。
  const targetVisibleAfter = groups[targetPane].filter((key) =>
    visibleByKey.get(key),
  );
  slot = Math.max(0, Math.min(slot, targetVisibleAfter.length));

  // same-pane・同一 slot は no-op(配列を動かさない)。
  if (
    sourcePane === targetPane &&
    fromVisibleIndex >= 0 &&
    slot === fromVisibleIndex
  ) {
    return null;
  }

  // 挿入位置(groups[targetPane] 実配列 index)を決定。
  let insertAt: number;
  if (slot >= targetVisibleAfter.length) {
    insertAt = groups[targetPane].length; // 末尾(後続の非表示列の後ろ)
  } else {
    insertAt = groups[targetPane].indexOf(targetVisibleAfter[slot]); // アンカー表示列の手前
  }
  groups[targetPane].splice(insertAt, 0, draggedKey);

  return [...groups.left, ...groups.center, ...groups.right];
}

type UseColumnHeaderDragControllerArgs<T> = {
  // controlled columns(onColumnsChange あり)のときだけ true。false ならドラッグ開始しません。
  enabled: boolean;
  // 全列(非表示含む)。permutation 生成と pane grouping に使います。
  columns: GridColumn<T>[];
  // 3 ペイン geometry。当たり判定 / slot / インジケータ位置の基準です。
  paneLayout: GridPaneLayout<T>;
  // 各ペイン要素 ref。clientX のペイン判定 + ローカル座標換算に使います。
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  // 端 autoscroll で動かす共有スクロールコンテナです。
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // 各ペインで列の前に確保する先頭幅(left=rowHeaderWidth / center=0 or rowHeaderWidth / right=0)。
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  // 並べ替え + 任意 pin 変更の共通 commit。
  applyColumnOrderAndPin: ApplyColumnOrderAndPin;
};

const EDGE_THRESHOLD = 24;
const SCROLL_STEP = 18;

// 追加(13-B3-3): 空の固定ペイン(pinned 列 0 本)への「最初の 1 列」を作るためのドロップ帯です。
//   空ペインは幅 0・非レンダーで物理的に狙える場所が無いため、ドラッグ中だけビューポート端の
//   EMPTY_PANE_DROP_BAND px を pin 用ホット帯として有効化します(帯は通常時は無効＝行ヘッダ操作に非干渉)。
//   方針: autoscroll 帯(EDGE_THRESHOLD=24)⊂ ドロップ帯(32)。端でスクロールしつつ、指を離した
//   瞬間の判定で pin 確定する「共存」方式です。
const EMPTY_PANE_DROP_BAND = 32;
// 追加(13-B3-3): 空ペインのインジケータをビューポート端の数 px 内側へ寄せる量です(端ぴったりだと
//   2px 線が overflow:auto でクリップされ視認しづらいため)。左は +inset、右は -inset(wrapper 原点が
//   width:0・sticky で左:ビューポート左端 / 右:ビューポート右端のため符号が反転します)。
const EMPTY_PANE_INDICATOR_INSET = 2;

// 追加(13-B3-5): ドラッグゴースト(ポインタ追従のピル)関連の定数です。
//   ゴーストは body 直下に imperative 生成する fixed 要素で、pointermove / autoscroll の
//   毎フレームに transform: translate で追従します(React state は触らず、再レンダーゼロを維持)。
//   位置はポインタからわずかに右下へオフセットして、指/カーソルにピルが隠れないようにします。
const GHOST_OFFSET_X = 14;
const GHOST_OFFSET_Y = 12;
// popover(createPortal の fixed 要素)より前面に出します。ドラッグ中だけ DOM に存在します。
const GHOST_Z_INDEX = 9999;
// アイコンの一辺(px)。ピル内のアイコンスロットと SVG の width/height を揃えます。
const GHOST_ICON_SIZE = 14;

// 追加(13-B3-5): ゴーストのアイコン(軽量 inline SVG)。computeHit の pane で出し分けます。
//   - move(四方向矢印): center へ移動。
//   - pin(ピン): left / right へ固定(空ペイン帯を含む)。
//   - out(スラッシュ円): 枠外(hit=null)。13-B3-4 の「離しても何もしない(キャンセル)」を表す
//     無効サインです(将来 AG Grid 風の「枠外=非表示」を採るなら別アイコンへ差し替え)。
//   いずれも stroke="currentColor" のため、ピル側の color を継承して着色されます。
const GHOST_ICON_MOVE =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>' +
  '<polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>' +
  '<line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
const GHOST_ICON_PIN =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<line x1="12" y1="17" x2="12" y2="22"/>' +
  '<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';
const GHOST_ICON_OUT =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>';

// 追加(13-B3-5): ゴーストのピル配色。通常(move/pin)は青系、枠外(out)はミュートの赤系で
//   「ここで離しても無効」を視覚化します(13-B3-4 のキャンセル挙動と一致)。
const GHOST_PALETTE = {
  normal: { border: '#2563eb', background: '#eff6ff', color: '#1d4ed8' },
  out: { border: '#ef4444', background: '#fef2f2', color: '#dc2626' },
} as const;

// 追加(案A): 列の並べ替え確定時に「新しい位置へスライド」させる settle アニメの定数/ヘルパです。
//   ドロップ commit 後、各列セルへ FLIP(transform)を 1 回だけ当てます(ドラッグ中は無関与)。
//   対象は「画面に見えているセル」だけ(行・列とも仮想化)で、transform は GPU 合成のため軽量です。
const SETTLE_MS = 200;
const SETTLE_EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

// prefers-reduced-motion ではアニメせずスナップします(アクセシビリティ)。
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 現在の各列の screen-x(getBoundingClientRect().left)を列キーで記録します(FLIP の before)。
//   同じ列のヘッダー/本体セルは同じ x のため、列キーごとに最初の 1 セルだけ測れば十分です。
const captureColumnLefts = (
  container: HTMLElement | null,
): Map<string, number> | null => {
  if (!container) return null;
  const map = new Map<string, number>();
  container
    .querySelectorAll<HTMLElement>('[data-ssg-col-key]')
    .forEach((cell) => {
      const key = cell.dataset.ssgColKey;
      if (key && !map.has(key)) {
        map.set(key, cell.getBoundingClientRect().left);
      }
    });
  return map;
};

export const useColumnHeaderDragController = <T,>(
  args: UseColumnHeaderDragControllerArgs<T>,
) => {
  // latest-ref: 公開ハンドラを恒久安定化するため、変化する引数はここから読みます。
  const latestRef = useRef(args);
  latestRef.current = args;

  const leftIndicatorRef = useRef<HTMLDivElement | null>(null);
  const centerIndicatorRef = useRef<HTMLDivElement | null>(null);
  const rightIndicatorRef = useRef<HTMLDivElement | null>(null);

  // ドラッグセッション state(すべて ref。ドラッグ中の再レンダーを発生させません)。
  const draggingKeyRef = useRef<string | null>(null);
  const dropTargetRef = useRef<{ pane: ColumnPane; slot: number } | null>(null);
  // 追加(案A): 並べ替え確定時の FLIP 用に、commit 直前の各列 screen-x を保持します。
  //   same-pane(ピン変更なし)の並べ替えのときだけセットし、列レイアウト確定後の
  //   applyReorderSettle で消費します(cross-pane / reduced-motion は null＝スナップ)。
  const settlePendingRef = useRef<Map<string, number> | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // 追加(13-B3-5): ドラッグゴースト(ポインタ追従ピル)の ref 群です。すべて imperative に
  //   操作し、ドラッグ中の再レンダーは発生させません。ゴーストはドラッグ中だけ DOM に存在します。
  const ghostElRef = useRef<HTMLDivElement | null>(null); // ピル本体(body 直下 fixed)。
  const ghostIconElRef = useRef<HTMLSpanElement | null>(null); // アイコンスロット(innerHTML 差替)。
  // 直近のアイコン/配色状態。同状態のフレームでは innerHTML / style 差替をスキップします。
  const ghostStateRef = useRef<ColumnPane | 'out' | null>(null);

  const hideAllIndicators = useCallback(() => {
    for (const ref of [
      leftIndicatorRef,
      centerIndicatorRef,
      rightIndicatorRef,
    ]) {
      if (ref.current) ref.current.style.display = 'none';
    }
  }, []);

  // 追加(13-B3-5): ドラッグ開始時にゴースト(ピル)を body 直下へ生成します(冪等)。
  //   - fixed + translate で追従。pointer-events:none で当たり判定(getBoundingClientRect ベース)に
  //     も将来の elementFromPoint にも非干渉。user-select:none でテキスト選択を抑止します。
  //   - ラベルはドラッグ開始時の列名(title || key)で確定します(renderHeader のカスタム JSX は
  //     imperative 描画が複雑なため、ゴーストではプレーン文字列にフォールバックします)。
  //   - アイコンは初回 updateGhost で必ずセットされるよう、state を null にしておきます。
  const createGhost = useCallback((label: string) => {
    if (ghostElRef.current) return;
    const el = document.createElement('div');
    el.setAttribute('data-grid-drag-ghost', '');
    el.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'padding:4px 10px 4px 8px',
      'border-radius:9999px',
      'border:1px solid ' + GHOST_PALETTE.normal.border,
      'background:' + GHOST_PALETTE.normal.background,
      'color:' + GHOST_PALETTE.normal.color,
      'font-size:12px',
      'font-weight:600',
      'line-height:1',
      'white-space:nowrap',
      'box-shadow:0 4px 12px rgba(15,23,42,0.18)',
      'pointer-events:none',
      'user-select:none',
      'z-index:' + GHOST_Z_INDEX,
      'will-change:transform',
      // 初期は画面外へ逃がし、最初の updateGhost でポインタ位置へ正規化します
      // (生成直後の 1 フレーム、原点(0,0)にちらつかせないため)。
      'transform:translate(-9999px,-9999px)',
    ].join(';');

    const icon = document.createElement('span');
    icon.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;width:' +
      GHOST_ICON_SIZE +
      'px;height:' +
      GHOST_ICON_SIZE +
      'px;flex:none';

    const text = document.createElement('span');
    text.textContent = label;

    el.appendChild(icon);
    el.appendChild(text);
    document.body.appendChild(el);

    ghostElRef.current = el;
    ghostIconElRef.current = icon;
    ghostStateRef.current = null;
  }, []);

  // 追加(13-B3-5): ゴーストの位置(常にポインタ基準)とアイコン/配色(pane で出し分け)を更新します。
  //   - 位置は hit の有無に関わらずポインタへ追従します(枠外でも追従。capture 中のため枠外でも
  //     pointermove は届きます)。
  //   - center=move / left・right(空ペイン帯含む)=pin / null=out(無効サイン)。
  //   - 同状態のフレームは innerHTML / style の差替をスキップします(無駄な DOM 触りを抑制)。
  const updateGhost = useCallback((pane: ColumnPane | null) => {
    const el = ghostElRef.current;
    if (!el) return;
    const { x, y } = pointerRef.current;
    el.style.transform =
      'translate(' + (x + GHOST_OFFSET_X) + 'px,' + (y + GHOST_OFFSET_Y) + 'px)';

    const state: ColumnPane | 'out' = pane ?? 'out';
    if (ghostStateRef.current === state) return;
    ghostStateRef.current = state;

    const icon = ghostIconElRef.current;
    if (state === 'out') {
      el.style.borderColor = GHOST_PALETTE.out.border;
      el.style.background = GHOST_PALETTE.out.background;
      el.style.color = GHOST_PALETTE.out.color;
      if (icon) icon.innerHTML = GHOST_ICON_OUT;
    } else {
      el.style.borderColor = GHOST_PALETTE.normal.border;
      el.style.background = GHOST_PALETTE.normal.background;
      el.style.color = GHOST_PALETTE.normal.color;
      if (icon) icon.innerHTML = state === 'center' ? GHOST_ICON_MOVE : GHOST_ICON_PIN;
    }
  }, []);

  // 追加(13-B3-5): ゴーストを DOM から除去します(冪等)。endDrag / unmount で呼びます。
  const destroyGhost = useCallback(() => {
    const el = ghostElRef.current;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    ghostElRef.current = null;
    ghostIconElRef.current = null;
    ghostStateRef.current = null;
  }, []);

  // clientX/clientY → { pane, slot, leftPx(ペインローカル境界 x + leadingWidth) }。
  // 変更(13-B3-4): 枠外判定のため clientY も受け取ります。
  const computeHit = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { pane: ColumnPane; slot: number; leftPx: number } | null => {
      const {
        paneLayout,
        leftPaneScrollRef,
        rightPaneScrollRef,
        bodyScrollRef,
        scrollContainerRef,
        leftLeadingWidth,
        centerLeadingWidth,
        rightLeadingWidth,
      } = latestRef.current;

      // 追加(13-B3-4): 表の枠(共有スクロールコンテナ)の外へポインタが出たら hit なし(null)。
      //   → updateIndicator がインジケータを消し、endDrag は dropTarget=null で commit しません
      //     (= 枠外ドロップはキャンセル/no-op)。
      //   注意: この判定は空ペイン帯より「前」に置きます。右空ペイン帯は clientX に上限が無く、
      //   枠の右外でもマッチしてしまうため、先に枠外を弾く必要があります。autoscroll は枠の
      //   「内側」EDGE_THRESHOLD で発火し、空ペイン帯も端の内側のため、いずれもこのガードと非干渉です。
      const containerEl = scrollContainerRef.current;
      if (containerEl) {
        const r = containerEl.getBoundingClientRect();
        if (
          clientX < r.left ||
          clientX > r.right ||
          clientY < r.top ||
          clientY > r.bottom
        ) {
          return null;
        }
      }

      const leftEl = leftPaneScrollRef.current;
      const rightEl = rightPaneScrollRef.current;

      // 追加(13-B3-3): 空の左固定ペインへのドロップ帯(最初の左固定列を作る)。
      //   left wrapper は sticky;left:0 なので rect.left === ビューポート左端。
      //   そこから EMPTY_PANE_DROP_BAND 以内なら slot 0 で left へ pin します。
      //   ※ 左ペインが空のとき行ヘッダーは中央が持つため、この帯は行ヘッダ左端 32px と重なります
      //     (列ドラッグ中のみ有効。中央 slot 0 は帯の右側＝最初の列上で従来どおり狙えます)。
      if (leftEl && paneLayout.left.entries.length === 0) {
        const rect = leftEl.getBoundingClientRect();
        if (clientX <= rect.left + EMPTY_PANE_DROP_BAND) {
          return { pane: 'left', slot: 0, leftPx: EMPTY_PANE_INDICATOR_INSET };
        }
      }

      // 左固定ペイン(非空)。右端より左。
      if (leftEl && paneLayout.left.entries.length > 0) {
        const rect = leftEl.getBoundingClientRect();
        if (clientX < rect.right) {
          const localX = clientX - rect.left - leftLeadingWidth;
          const slot = findPaneDropSlot(paneLayout.left, localX);
          return {
            pane: 'left',
            slot,
            leftPx: leftLeadingWidth + paneDropSlotBoundaryX(paneLayout.left, slot),
          };
        }
      }

      // 追加(13-B3-3): 空の右固定ペインへのドロップ帯(最初の右固定列を作る)。
      //   right wrapper は sticky;right:0・width:0 なので rect.left === ビューポート右端。
      //   そこから EMPTY_PANE_DROP_BAND 以内なら slot 0 で right へ pin します。
      //   インジケータは原点(ビューポート右端)から負方向へ inset して端の内側に見せます。
      if (rightEl && paneLayout.right.entries.length === 0) {
        const rect = rightEl.getBoundingClientRect();
        if (clientX >= rect.left - EMPTY_PANE_DROP_BAND) {
          return {
            pane: 'right',
            slot: 0,
            leftPx: -EMPTY_PANE_INDICATOR_INSET,
          };
        }
      }

      // 右固定ペイン(非空)。左端以降。
      if (rightEl && paneLayout.right.entries.length > 0) {
        const rect = rightEl.getBoundingClientRect();
        if (clientX >= rect.left) {
          const localX = clientX - rect.left - rightLeadingWidth;
          const slot = findPaneDropSlot(paneLayout.right, localX);
          return {
            pane: 'right',
            slot,
            leftPx:
              rightLeadingWidth + paneDropSlotBoundaryX(paneLayout.right, slot),
          };
        }
      }

      // それ以外は中央ペイン。中央は scrollLeft===0、移動する rect.left が横スクロールを吸収します。
      const centerEl = bodyScrollRef.current;
      if (centerEl && paneLayout.center.entries.length > 0) {
        const rect = centerEl.getBoundingClientRect();
        const localX =
          centerEl.scrollLeft + clientX - rect.left - centerLeadingWidth;
        const slot = findPaneDropSlot(paneLayout.center, Math.max(localX, 0));
        return {
          pane: 'center',
          slot,
          leftPx:
            centerLeadingWidth + paneDropSlotBoundaryX(paneLayout.center, slot),
        };
      }

      return null;
    },
    [],
  );

  const updateIndicator = useCallback(() => {
    const hit = computeHit(pointerRef.current.x, pointerRef.current.y);
    // 追加(13-B3-5): ゴーストは hit の有無に関わらずポインタへ追従し、アイコン/配色を pane で
    //   出し分けます(枠外=null は 'out' 表現)。インジケータ(縦線)の表示判定は従来どおり hit 基準。
    updateGhost(hit ? hit.pane : null);
    if (!hit) {
      dropTargetRef.current = null;
      hideAllIndicators();
      return;
    }
    dropTargetRef.current = { pane: hit.pane, slot: hit.slot };
    const indicatorByPane: Record<ColumnPane, HTMLDivElement | null> = {
      left: leftIndicatorRef.current,
      center: centerIndicatorRef.current,
      right: rightIndicatorRef.current,
    };
    for (const pane of ['left', 'center', 'right'] as ColumnPane[]) {
      const el = indicatorByPane[pane];
      if (!el) continue;
      if (pane === hit.pane) {
        el.style.left = `${hit.leftPx}px`;
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    }
  }, [computeHit, hideAllIndicators, updateGhost]);

  // rAF 端 autoscroll(共有スクロールコンテナ)。自己再帰のため ref 経由で参照します。
  const autoScrollTickRef = useRef<() => void>(() => {});
  const autoScrollTick = useCallback(() => {
    const el = latestRef.current.scrollContainerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const pointer = pointerRef.current;
      let nextLeft = el.scrollLeft;
      // 修正(13-B3-6): 水平方向のみ autoscroll します。列の並べ替え先(pane/slot)は clientX で
      //   決まり縦スクロールは不要なうえ、グリップは position:sticky のヘッダー＝スクロール
      //   コンテナ最上部にあり、縦の上端バンド(rect.top + EDGE_THRESHOLD)へ常時侵入して
      //   「掴んだだけ/水平ドラッグ中」に上方向 autoscroll を自己発火させていました(縦の
      //   pointer.y / nextTop 分岐を撤去)。水平は画面外の列を手繰るため有用なので維持します。
      if (pointer.x < rect.left + EDGE_THRESHOLD) {
        nextLeft = Math.max(el.scrollLeft - SCROLL_STEP, 0);
      } else if (pointer.x > rect.right - EDGE_THRESHOLD) {
        nextLeft = el.scrollLeft + SCROLL_STEP;
      }
      if (nextLeft !== el.scrollLeft) {
        el.scrollTo({ left: nextLeft, behavior: 'auto' });
      }
    }
    // 端スクロールで rect が動くため、停止中の指でも毎フレーム slot を再計算します。
    updateIndicator();
    rafRef.current = requestAnimationFrame(autoScrollTickRef.current);
  }, [updateIndicator]);
  autoScrollTickRef.current = autoScrollTick;

  const endDrag = useCallback(
    (commit: boolean) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = '';
      hideAllIndicators();
      // 追加(13-B3-5): ゴーストを除去します(commit/cancel いずれの経路でも必ず)。
      destroyGhost();

      const draggedKey = draggingKeyRef.current;
      const target = dropTargetRef.current;
      draggingKeyRef.current = null;
      dropTargetRef.current = null;

      if (!commit || !draggedKey || !target) return;

      const { columns, applyColumnOrderAndPin, scrollContainerRef } =
        latestRef.current;
      const keys = computeHeaderReorderedKeys(
        columns,
        draggedKey,
        target.pane,
        target.slot,
      );
      if (!keys) return; // no-op ドラッグ(同一 pane・同一 slot)

      // 追加(案A): same-pane(ピン変更なし)の並べ替えのみ settle アニメを準備します。
      //   cross-pane(ドラッグでのピン留め)はペインの幅/位置が変わりクリップが生じ得るため、
      //   従来どおりスナップさせます(アニメ対象外)。reduced-motion でもスナップします。
      //   capture は commit 前に行う必要があるため、ここで各列の現在 x を記録します。
      const draggedColumn = columns.find((column) => column.key === draggedKey);
      const sourcePane = draggedColumn ? getColumnPane(draggedColumn) : null;
      const samePaneReorder = sourcePane !== null && sourcePane === target.pane;
      settlePendingRef.current =
        samePaneReorder && !prefersReducedMotion()
          ? captureColumnLefts(scrollContainerRef.current)
          : null;

      const pinOverride = new Map<string, GridColumnPinned | undefined>([
        [draggedKey, target.pane === 'center' ? undefined : target.pane],
      ]);
      applyColumnOrderAndPin(keys, pinOverride);
    },
    [hideAllIndicators, destroyGhost],
  );

  // 追加(案A): 並べ替え確定後(commit 済みの DOM)に呼ばれ、各列セルへ FLIP を 1 回当てて
  //   「新しい位置へスライド」させます。settlePendingRef(commit 前の各列 x)が無ければ即 return。
  //   SpreadsheetGrid が列レイアウト確定後の useLayoutEffect から呼びます(paint 前のため瞬間移動は不可視)。
  const applyReorderSettle = useCallback(() => {
    const before = settlePendingRef.current;
    settlePendingRef.current = null;
    if (!before) return;
    const container = latestRef.current.scrollContainerRef.current;
    if (!container) return;

    // commit 後の現在セルを列キーで集約し、新しい screen-x を測ります。
    const cellsByKey = new Map<string, HTMLElement[]>();
    const newLeftByKey = new Map<string, number>();
    container
      .querySelectorAll<HTMLElement>('[data-ssg-col-key]')
      .forEach((cell) => {
        const key = cell.dataset.ssgColKey;
        if (!key || !before.has(key)) return;
        const arr = cellsByKey.get(key);
        if (arr) {
          arr.push(cell);
        } else {
          cellsByKey.set(key, [cell]);
          newLeftByKey.set(key, cell.getBoundingClientRect().left);
        }
      });

    // FLIP: 各列 delta = oldX - newX。動いた列だけ「逆 transform」で一旦元位置へ見せます。
    const animatedCells: HTMLElement[] = [];
    cellsByKey.forEach((cells, key) => {
      const oldX = before.get(key);
      const newX = newLeftByKey.get(key);
      if (oldX === undefined || newX === undefined) return;
      const delta = oldX - newX;
      if (Math.abs(delta) < 0.5) return;
      for (const cell of cells) {
        cell.style.transition = 'none';
        cell.style.transform = `translateX(${delta}px)`;
        cell.style.willChange = 'transform';
        animatedCells.push(cell);
      }
    });
    if (animatedCells.length === 0) return;

    // 初期(逆 transform)を確定させるため 1 回だけ強制リフロー。
    void container.getBoundingClientRect();

    // トランジションを付けて transform を 0 へ＝新しい位置へスライド。
    for (const cell of animatedCells) {
      cell.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      cell.style.transform = 'translateX(0)';
    }

    // 後始末: インライン style を消します(次のドラッグ/再レンダーと競合させない)。
    window.setTimeout(() => {
      for (const cell of animatedCells) {
        cell.style.transition = '';
        cell.style.transform = '';
        cell.style.willChange = '';
      }
    }, SETTLE_MS + 80);
  }, []);

  const onColumnDragHandlePointerDown = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLElement>) => {
      if (!latestRef.current.enabled) return;
      if (event.button !== 0) return;
      // 重要: ヘッダー本体の列範囲選択(onColumnHeaderPointerDown)へ伝播させない(掴み手方式)。
      event.stopPropagation();
      event.preventDefault();

      draggingKeyRef.current = column.key;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      document.body.style.cursor = 'grabbing';
      // 追加(13-B3-5): ドラッグゴースト(ピル)を生成します。ラベルは列名(title || key)で確定。
      //   直後の updateIndicator → updateGhost でポインタ位置・アイコンが正規化されます。
      createGhost(column.title || column.key);

      const target = event.currentTarget;
      const pointerId = event.pointerId;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* capture 不可環境は無視 */
      }

      const handleMove = (nativeEvent: globalThis.PointerEvent) => {
        pointerRef.current = { x: nativeEvent.clientX, y: nativeEvent.clientY };
        updateIndicator();
      };
      function handleUp() {
        cleanup();
        endDrag(true);
      }
      function handleCancel() {
        cleanup();
        endDrag(false);
      }
      const cleanup = () => {
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleCancel);
        // 追加(13-B3-3): capture 喪失ネットも解除します。releasePointerCapture より「前」に
        //   外すことで、release が誘発する lostpointercapture では handleCancel が走らず
        //   (= 正常 up と二重発火しない)。なお endDrag は draggingKeyRef を null 化するため
        //   仮に二重で呼ばれても安全(冪等)です。
        target.removeEventListener('lostpointercapture', handleCancel);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          /* noop */
        }
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleCancel);
      // 追加(13-B3-3): ブラウザが capture を奪う等で pointerup/cancel が来ない経路の保険。
      //   capture 喪失を cancel 扱いにして rAF・body cursor を確実に後始末します。
      target.addEventListener('lostpointercapture', handleCancel);

      updateIndicator();
      rafRef.current = requestAnimationFrame(autoScrollTickRef.current);
    },
    [updateIndicator, endDrag, createGhost],
  );

  // 追加(13-B3-3): アンマウント時の最終後始末ネット。ドラッグ中(grip 掴み中)に grid 側が
  //   再マウントする等で grip 要素が unmount すると pointerup/cancel が来ず、autoscroll の rAF が
  //   回りっぱなし・body cursor が 'grabbing' のまま残り得ます。これを確実に解放します。
  //   (再レンダーゼロ設計のため実際に踏む確率は低いものの、堅牢性の保険です。)
  // 変更(13-B3-5): ゴースト(body 直下 fixed)も同じ最終後始末ネットで確実に除去します
  //   (依存を増やさないよう、destroyGhost を介さず ghostElRef から直接外します)。
  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = '';
      const ghost = ghostElRef.current;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghostElRef.current = null;
      ghostIconElRef.current = null;
      ghostStateRef.current = null;
    },
    [],
  );

  return {
    onColumnDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    // 追加(案A): 並べ替え確定後に呼ぶ settle アニメ発火関数(armed 時のみ動作)。
    applyReorderSettle,
  };
};

export default useColumnHeaderDragController;