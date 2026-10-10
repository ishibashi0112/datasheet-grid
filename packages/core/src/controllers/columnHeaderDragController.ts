// 追加(非依存化 ③-18): ヘッダーのバッジを grip にした列の D&D 並べ替えコントローラです
//   (React 非依存。旧 hooks/useColumnHeaderDragController の本体を移設。設計メモは以下)。
//   - ドラッグ中はフレームワークの state を更新しません。ドロップインジケータ(縦線)は各 pane に常設した
//     要素(args の indicator ref 経由)を imperative に表示 / 移動します(ヘッダー行の memo を完全維持)。
//   - pointerdown(バッジ) → setPointerCapture → window へ pointermove / up / cancel を登録(このドラッグの
//     pointerId のみ処理)。仮想化で grip が unmount しても window 登録ならイベントを受けられます(13-B3-7)。
//   - ヒットテストは pointerInteractionsController.getCellCoordFromClientPoint と同じ pane 判定式
//     (left.right より左=左 / right.left 以降=右 / それ以外=中央。中央は移動する rect.left で横スクロール量を
//      吸収)。slot は findPaneDropSlot(pane-local midpoint)で算出。
//   - up で computeHeaderReorderedKeys(全列の permutation。非表示列も保全)→ applyColumnOrderAndPin(keys, pinOverride)。
//   - dispose はドラッグ中でも window リスナー / rAF / body cursor / ゴーストを確実に後始末します。
//   - 追加(motion-9 / M-12): 表示方式 motion='live'(columnDragMotion)。同じペイン内では縦線 / ゴーストを出さず、掴んだ列
//     (ヘッダー + 描画中の本体セル)がポインタ(+ 横 autoscroll ぶん)に追従し、通る先の列が掴んだ列の幅ぶん左右へ退避
//     します(rowDragController の live 方式の横版。スロット解決は共通)。
//   - 変更(M-12 D): live 方式で別ペインへ移す(ピン留めの変更)とき。ペインは overflow: clip のため本物のセルはペインの外へ
//     出せません。そこで掴んだ列(描画中のヘッダー + 本体セル)の複製を、シェル(スクロールコンテナの親)直下のクリップ層
//     (= 浮かぶ列)に置いてポインタへ追従させ、元のペインは列が抜けた分を詰め、移動先は縦線で示します。浮かぶ列の見出しには
//     ゴーストと同じアイコン(固定ペインへはピン / 中央へは移動の矢印)を付けます。離すと浮かぶ列が新しい位置へ滑り込み
//     (確定後の applyReorderSettle)、キャンセルでは元の位置へ戻ります。シェルが無い環境では従来どおり縦線 + ゴーストです。
//     浮かぶ列は表の枠の内側に収め(端ではポインタに付いていかず止まる。見出しのアイコンと列名を隠さないため)、縦線は浮かぶ列の
//     上へ写します(本物の縦線はペインの中にあり、前面の浮かぶ列に隠れるため)。
import type { GridColumn, GridColumnPinned, GridResolvedSlot } from '../model/gridTypes.unbound';
import {
  findPaneDropSlot,
  paneDropSlotBoundaryX,
  getColumnPane,
  type ColumnPane,
  type GridPaneLayout,
  type PaneGeometry,
} from '../logic/geometry';
import {
  AUTO_SCROLL_ACTIVATION_DISTANCE,
  AUTO_SCROLL_EDGE_THRESHOLD,
  AUTO_SCROLL_STEP,
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from '../logic/autoScrollGeometry';
import { isInsideDetailCardOf, isSyntheticColumnKey } from '../logic/detailRow';
import { applySlotToElement } from '../logic/slotDom';

type ApplyColumnOrderAndPin = (
  orderedKeys: string[],
  pinOverride?: Map<string, GridColumnPinned | undefined>,
) => void;

// 全列 permutation を返します(非表示列も保全)。並び替え不要(同 pane・同 slot)なら null。
//   - dragged を source pane から除去 → target pane の「表示列(visible)」基準の slot 位置へ挿入 →
//     left+center+right を連結。
//   - same-pane では除去で後方が詰まるため slot を 1 補正し、同一 slot は no-op として null。
//   - slot は paneLayout.entries(表示列のみ)基準で来るため、ここでも visible 列でアンカーします。
//   ※ computeSectionReorderedKeys(ColumnChooserPanel)のクロスペイン版に相当します。
export function computeHeaderReorderedKeys<T>(
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
  const targetVisibleBefore = groups[targetPane].filter((key) => visibleByKey.get(key));
  const fromVisibleIndex = targetVisibleBefore.indexOf(draggedKey);

  const sourceIndex = groups[sourcePane].indexOf(draggedKey);
  if (sourceIndex < 0) return null;
  groups[sourcePane].splice(sourceIndex, 1);

  let slot = slotInTargetVisible;
  if (sourcePane === targetPane && fromVisibleIndex >= 0 && slot > fromVisibleIndex) {
    slot -= 1;
  }

  const targetVisibleAfter = groups[targetPane].filter((key) => visibleByKey.get(key));
  slot = Math.max(0, Math.min(slot, targetVisibleAfter.length));

  if (sourcePane === targetPane && fromVisibleIndex >= 0 && slot === fromVisibleIndex) {
    return null;
  }

  let insertAt: number;
  if (slot >= targetVisibleAfter.length) {
    insertAt = groups[targetPane].length; // 末尾(後続の非表示列の後ろ)
  } else {
    insertAt = groups[targetPane].indexOf(targetVisibleAfter[slot]); // アンカー表示列の手前
  }
  groups[targetPane].splice(insertAt, 0, draggedKey);

  return [...groups.left, ...groups.center, ...groups.right];
}

// 修正(M-12 fix): ペイン geometry のスロット(合成列を含む表示エントリの index)を、computeHeaderReorderedKeys が受け取る
//   「consumer の columns 上の target pane 表示列 index」へ換算します。合成列(行ドラッグハンドル / 展開行トグル / 自動グループ
//   列)は consumer の columns に無く、行グルーピング中のグループ元列は columns では表示扱いでも画面には出ないため、index を
//   そのまま渡すと 1 列ずれていました(左固定列が無いときに合成列が中央ペインの先頭に入り、grip を押して離すだけで右隣と
//   入れ替わる)。スロット位置以降で最初の非合成エントリ(= その手前に挿入するアンカー列)をキーで引き当てて換算します。
export function resolveConsumerDropSlot<T>(
  columns: GridColumn<T>[],
  paneGeometry: PaneGeometry<T>,
  pane: ColumnPane,
  slot: number,
): number {
  const visibleKeys = columns
    .filter((column) => getColumnPane(column) === pane && column.visible !== false)
    .map((column) => column.key);
  const { entries } = paneGeometry;
  for (let i = Math.max(slot, 0); i < entries.length; i += 1) {
    const key = entries[i].column.key;
    if (isSyntheticColumnKey(key)) continue;
    const index = visibleKeys.indexOf(key);
    return index < 0 ? visibleKeys.length : index;
  }
  return visibleKeys.length;
}

// 修正(M-12 fix): ペイン先頭の合成列の本数。合成列より前へは置けないため、スロットの下限にします(縦線 / live の退避も
//   実際の挿入位置と一致させる)。
const countLeadingSyntheticEntries = <T,>(paneGeometry: PaneGeometry<T>): number => {
  let count = 0;
  while (count < paneGeometry.entries.length && isSyntheticColumnKey(paneGeometry.entries[count].column.key)) {
    count += 1;
  }
  return count;
};

type ReadonlyRef<V> = { readonly current: V };

export type ColumnHeaderDragArgs<T> = {
  // controlled columns(onColumnsChange あり)のときだけ true。false ならドラッグ開始しません。
  enabled: boolean;
  // 全列(非表示含む)。permutation 生成と pane grouping に使います。
  columns: GridColumn<T>[];
  // 3 ペイン geometry。当たり判定 / slot / インジケータ位置の基準です。
  paneLayout: GridPaneLayout<T>;
  // 各ペイン要素 ref。clientX のペイン判定 + ローカル座標換算に使います。
  leftPaneScrollRef: ReadonlyRef<HTMLElement | null>;
  rightPaneScrollRef: ReadonlyRef<HTMLElement | null>;
  bodyScrollRef: ReadonlyRef<HTMLElement | null>;
  // 端 autoscroll で動かす共有スクロールコンテナです。
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  // 各ペインに常設するドロップインジケータ(縦線)要素です。
  leftIndicatorRef: ReadonlyRef<HTMLElement | null>;
  centerIndicatorRef: ReadonlyRef<HTMLElement | null>;
  rightIndicatorRef: ReadonlyRef<HTMLElement | null>;
  // 各ペインで列の前に確保する先頭幅(left=rowHeaderWidth / center=0 or rowHeaderWidth / right=0)。
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  // 並べ替え + 任意 pin 変更の共通 commit。
  applyColumnOrderAndPin: ApplyColumnOrderAndPin;
  // classNames.dragGhost の解決済みスロット(ゴースト要素へ className / style)。
  ghostSlot?: GridResolvedSlot;
  // 追加(motion-9 / M-12): 表示方式。'ghost'(既定 = 従来: ゴースト + 縦線、ドロップ後にスライド)/ 'live'(同じペイン内では
  //   掴んだ列がポインタに追従し、通る先の列がその場で左右へ退避する。別ペインへ移すときは 'ghost' と同じ表示)。
  motion?: 'ghost' | 'live';
};

// grip の pointerdown イベント(構造的型。React の合成 PointerEvent をそのまま渡せます)。
export type ColumnDragHandlePointerEvent = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: {
    setPointerCapture: (pointerId: number) => void;
    releasePointerCapture: (pointerId: number) => void;
  };
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type ColumnHeaderDragController<T> = {
  update: (args: ColumnHeaderDragArgs<T>) => void;
  onColumnDragHandlePointerDown: (column: GridColumn<T>, event: ColumnDragHandlePointerEvent) => void;
  // 並べ替え確定後(commit 済みの DOM、paint 前)に呼ぶ settle アニメ発火関数(armed 時のみ動作)。
  applyReorderSettle: () => void;
  dispose: () => void;
};

// 空の固定ペイン(pinned 列 0 本)への「最初の 1 列」を作るためのドロップ帯(13-B3-3)。空ペインは幅 0・非レンダーで
//   物理的に狙える場所が無いため、ドラッグ中だけビューポート端の EMPTY_PANE_DROP_BAND px を pin 用ホット帯にします。
//   autoscroll 帯(AUTO_SCROLL_EDGE_THRESHOLD=24)⊂ ドロップ帯(32)。端でスクロールしつつ、離した瞬間の判定で pin 確定。
const EMPTY_PANE_DROP_BAND = 32;
// 空ペインのインジケータをビューポート端の数 px 内側へ寄せる量(端ぴったりだと 2px 線が overflow:auto でクリップ
//   される)。左は +inset、右は -inset(右 wrapper は width:0・sticky で原点がビューポート右端のため符号が反転)。
const EMPTY_PANE_INDICATOR_INSET = 2;

// ドラッグゴースト(ポインタ追従のピル。13-B3-5)。body 直下に imperative 生成する fixed 要素で、pointermove /
//   autoscroll の毎フレームに transform: translate で追従します。ポインタからわずかに右下へオフセット。
const GHOST_OFFSET_X = 14;
const GHOST_OFFSET_Y = 12;
// popover(createPortal の fixed 要素)より前面に出します。ドラッグ中だけ DOM に存在します。
const GHOST_Z_INDEX = 9999;
const GHOST_ICON_SIZE = 14;

// ゴーストのアイコン(軽量 inline SVG)。computeHit の pane で出し分けます。
//   move(四方向矢印)= center へ移動 / pin = left・right へ固定(空ペイン帯を含む)/ out(スラッシュ円)= 枠外(無効)。
//   いずれも stroke="currentColor" のため、ピル側の color を継承して着色されます。
// 変更(M-12 D): move / pin は浮かぶ列の見出しのアイコンにも使うため、サイズを引数に取る関数にしました。
const moveIconSvg = (size: number) =>
  '<svg viewBox="0 0 24 24" width="' +
  size +
  '" height="' +
  size +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>' +
  '<polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>' +
  '<line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
const pinIconSvg = (size: number) =>
  '<svg viewBox="0 0 24 24" width="' +
  size +
  '" height="' +
  size +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<line x1="12" y1="17" x2="12" y2="22"/>' +
  '<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';
const GHOST_ICON_MOVE = moveIconSvg(GHOST_ICON_SIZE);
const GHOST_ICON_PIN = pinIconSvg(GHOST_ICON_SIZE);
const GHOST_ICON_OUT =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>';

// ゴーストは「チャコール無地の角丸チップ」。状態は色ではなく「アイコン + 濃度」で出し分けます。色はデザイントークン
//   参照(ゴースト root(data-grid-drag-ghost)は styles.css のトークン定義セレクタリストに含まれる)。
const GHOST_INK_BACKGROUND = 'var(--ssg-ghost-bg)';
const GHOST_INK_COLOR = 'var(--ssg-ghost-text)';
const GHOST_INK_BORDER = 'var(--ssg-ghost-border)';
const GHOST_INK_SHADOW = 'var(--ssg-ghost-shadow)';
// 枠外(無効)時の濃度。色は変えず opacity だけ落として「ここで離しても無効」を示します。
const GHOST_OUT_OPACITY = '0.5';

// 列の並べ替え確定時に「新しい位置へスライド」させる settle アニメ(案A)。ドロップ commit 後、各列セルへ FLIP
//   (transform)を 1 回だけ当てます。対象は「画面に見えているセル」だけ(行・列とも仮想化)。
const SETTLE_MS = 200;
const SETTLE_EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

// prefers-reduced-motion ではアニメせずスナップします(アクセシビリティ)。
// 変更(motion-3): 抑制の判定を OS 設定の直接参照から motion prop の実効値(root の .ssg-motion-off)へ。
const isMotionOff = (el: HTMLElement | null): boolean => el?.closest('.ssg-motion-off') != null;

// 追加(motion-9 / M-12): live 方式で周りの列が退避するときの transition(行の live 方式と同じ 160ms)。
const LIVE_SHIFT_MS = 160;
const LIVE_SHIFT_TRANSITION = `transform ${LIVE_SHIFT_MS}ms ${SETTLE_EASING}`;
// live 方式で掴んだ列のセル(ヘッダー + 本体)へ付ける属性です(CSS 側で浮いた見た目)。フレームワークが管理しない属性
//   なので、hover 等の再レンダーで className が上書きされても消えません。
const DRAGGING_COLUMN_ATTRIBUTE = 'data-ssg-col-dragging';
// 掴んだ列を同じ行の他のセルより前面に出す z-index(行番号「#」セル(z 5)よりは下 = 先頭側では行番号の下へ潜る)。
//   グループ行のセルは inline の zIndex:1 を持つため、CSS ではなく inline で上書きし、終了時に元の値へ戻します。
const LIVE_DRAGGING_Z_INDEX = '4';

// 追加(M-12 D): 浮かぶ列(live 方式で別ペインへ移すときの列の複製)。シェル直下に置くクリップ層(スクロールコンテナの
//   表示領域と同じ矩形)の中で、列の複製を transform でポインタへ追従させます。z-index は固定ペイン(2)/ ヘッダー行(6)/
//   シェル直下のオーバーレイ(5〜8)より前、検索バー(20)より後ろです。
const FLOAT_Z_INDEX = '9';
const FLOAT_LAYER_CLASS = 'ssg-col-drag-float';
// 浮かぶ列の見出しに付けるアイコン(styles.css の .ssg-col-drag-pin)。
const FLOAT_PIN_CLASS = 'ssg-col-drag-pin';
const FLOAT_PIN_ICON_SIZE = 12;
// 浮かぶ列の上へ写す縦線(本物と同じクラスで同じ見た目)。
const DROP_INDICATOR_CLASS = 'ssg-col-drop-indicator';
// 見出しセル / その中の操作群(grip / 列メニュー)のクラス。複製では操作群を外し、アイコンを先頭に入れます。
const HEADER_CELL_CLASS = 'ssg-header-cell';
const HEADER_ACTIONS_CLASS = 'ssg-header-actions';
// 複製から外す属性(列キーで引くクエリ / ツールチップ / フォーカス移動の対象にしない)。
const FLOAT_STRIP_ATTRIBUTES = ['data-ssg-col-key', 'data-ssg-tooltip', 'data-autoheight-cell', 'id', 'tabindex'];
// 確定後に新しい位置へ滑り込む時間。
const FLOAT_LAND_MS = 180;
// 確定後に applyReorderSettle が来ない(利用側が columns を差し替えなかった等)ときに浮かぶ列を片付けるまでの猶予。
const FLOAT_LAND_FALLBACK_MS = 400;

// 列セル(ヘッダー / 本体 / グループ行。展開行カード内のネストしたグリッドは除外)を列挙します。
const collectColumnCells = (container: HTMLElement): HTMLElement[] => {
  const result: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>('[data-ssg-col-key]').forEach((cell) => {
    if (isInsideDetailCardOf(container, cell)) return;
    result.push(cell);
  });
  return result;
};

// 現在の各列の screen-x(getBoundingClientRect().left)を列キーで記録します(FLIP の before)。
//   同じ列のヘッダー / 本体セルは同じ x のため、列キーごとに最初の 1 セルだけ測れば十分です。
const captureColumnLefts = (container: HTMLElement | null): Map<string, number> | null => {
  if (!container) return null;
  const map = new Map<string, number>();
  container.querySelectorAll<HTMLElement>('[data-ssg-col-key]').forEach((cell) => {
    // 展開行カード内にネストしたグリッドのセルは測りません(detail ④)。
    if (isInsideDetailCardOf(container, cell)) return;
    const key = cell.dataset.ssgColKey;
    if (key && !map.has(key)) {
      map.set(key, cell.getBoundingClientRect().left);
    }
  });
  return map;
};

type DropHit = { pane: ColumnPane; slot: number; leftPx: number };

// live 方式で触ったセルの元の inline style(終了時に戻す)。
type LiveCellOriginal = { zIndex: string; visibility: string };
// live 方式のセル配置。follow = 同じペインで追従 / rest = 基準位置(ゴースト表示中)/ lift-out = 別ペインへ持ち出し中
//   (掴んだ列は隠し、元のペインは列が抜けた分を詰める。列の見た目は浮かぶ列が担う)。
type LivePlacement = 'follow' | 'rest' | 'lift-out';

// 追加(M-12 D): 浮かぶ列の DOM。layer = クリップ層(シェル直下)/ column = 列の複製を束ねて transform で動かす箱 /
//   guide = 浮かぶ列の上へ写す縦線 / badge = 見出しのアイコン(見出しが描画されていなければ null)。
//   layerWidth / columnWidth は枠の内側に収める計算用、scrollTop / cellCount は複製を作り直す判定(縦スクロール / セル数)。
type FloatColumn = {
  layer: HTMLDivElement;
  column: HTMLDivElement;
  guide: HTMLDivElement;
  badge: HTMLSpanElement | null;
  badgeKind: 'pin' | 'move' | null;
  layerWidth: number;
  columnWidth: number;
  scrollTop: number;
  cellCount: number;
};
// 離したあとの浮かぶ列。key = 確定時は新しい位置の列キー(applyReorderSettle で引く)/ キャンセル時は null。
//   hiddenCells = 滑り込むあいだ隠している本物のセル(元の visibility)。
type FloatLanding = {
  float: FloatColumn;
  key: string | null;
  timer: number | null;
  hiddenCells: Array<[HTMLElement, string]>;
};

export const createColumnHeaderDragController = <T,>(): ColumnHeaderDragController<T> => {
  let args: ColumnHeaderDragArgs<T> | null = null;

  // ドラッグセッション state。
  let draggingKey: string | null = null;
  let dropTarget: { pane: ColumnPane; slot: number } | null = null;
  // 並べ替え確定時の FLIP 用に、commit 直前の各列 screen-x を保持します(same-pane のときだけセット、
  //   applyReorderSettle で消費。cross-pane / reduced-motion は null = スナップ)。
  let settlePending: Map<string, number> | null = null;
  let pointer = { x: 0, y: 0 };
  // 端 autoscroll の armed 管理。掴んだ座標を起点に AUTO_SCROLL_ACTIVATION_DISTANCE 以上動くまで発動しません。
  let dragOrigin: { x: number; y: number } | null = null;
  let autoScrollArmed = false;
  // 進行中ドラッグの window リスナー解除関数(pointerdown 内で登録。dispose の最終後始末ネットからも呼ぶ)。
  let activeDragDispose: (() => void) | null = null;
  let rafId: number | null = null;

  // ゴースト(ピル本体 / アイコンスロット / 直近の状態。同状態のフレームは DOM 差替をスキップ)。
  let ghostEl: HTMLDivElement | null = null;
  let ghostIconEl: HTMLSpanElement | null = null;
  let ghostState: ColumnPane | 'out' | null = null;

  // 追加(motion-9 / M-12): live 方式のドラッグ状態。掴んだ列のペイン / 開始時の横 scrollLeft / 触ったセル(終了時に
  //   inline style を戻すため、元の inline z-index を値に持つ)。
  let liveSourcePane: ColumnPane | null = null;
  let liveStartScrollLeft = 0;
  let liveCells: Map<HTMLElement, LiveCellOriginal> | null = null;
  // キャンセルで基準位置へ戻している最中のセル(transition 後に inline style を戻す)。戻り切る前に次のドラッグが同じセルを
  //   触ったときは、こちらに控えた元の inline style を引き継ぎ、後始末の対象から外します。
  let restoringCells: Map<HTMLElement, LiveCellOriginal> | null = null;
  // ゴーストのラベル(live 方式は別ペインへ移すときだけゴーストを出すため、開始時に控えます)。
  let ghostLabel = '';

  // 追加(M-12 D): 浮かぶ列。float = 表示中の浮かぶ列(ドラッグ中だけ)/ grabOffsetX = 掴んだ点の列左端からの距離(浮かぶ列を
  //   ポインタ基準で置くため。同じペインで追従する本物のセルと同じ位置になる)/ landing = 離したあと新しい位置(確定)か
  //   元の位置(キャンセル)へ滑り込んでいる浮かぶ列。
  let float: FloatColumn | null = null;
  let grabOffsetX = 0;
  let landing: FloatLanding | null = null;

  const isLive = () => args?.motion === 'live';

  const indicatorElements = (): Record<ColumnPane, HTMLElement | null> => ({
    left: args?.leftIndicatorRef.current ?? null,
    center: args?.centerIndicatorRef.current ?? null,
    right: args?.rightIndicatorRef.current ?? null,
  });

  const hideAllIndicators = () => {
    for (const el of Object.values(indicatorElements())) {
      if (el) el.style.display = 'none';
    }
  };

  // ドラッグ開始時にゴースト(ピル)を body 直下へ生成します(冪等)。ラベルは列名(title || key)。
  const createGhost = (label: string) => {
    if (ghostEl) return;
    const el = document.createElement('div');
    el.setAttribute('data-grid-drag-ghost', '');
    // グリッド root のダークテーマ修飾子をゴーストへ引き継ぎます(ドラッグ開始時点のテーマで固定)。
    if (args?.scrollContainerRef.current?.closest('.ssg-theme-dark') != null) {
      el.classList.add('ssg-theme-dark');
    }
    // 追加(motion-0): モーション停止の修飾子もテーマと同じく祖先から引き継ぎます。
    if (args?.scrollContainerRef.current?.closest('.ssg-motion-off') != null) {
      el.classList.add('ssg-motion-off');
    }
    el.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'display:inline-flex',
      'align-items:center',
      'gap:7px',
      'padding:7px 12px 7px 10px',
      'border-radius:9px',
      'border:1px solid ' + GHOST_INK_BORDER,
      'background:' + GHOST_INK_BACKGROUND,
      'color:' + GHOST_INK_COLOR,
      'font-size:12px',
      'font-weight:600',
      'line-height:1',
      'white-space:nowrap',
      'box-shadow:' + GHOST_INK_SHADOW,
      'pointer-events:none',
      'user-select:none',
      'z-index:' + GHOST_Z_INDEX,
      'will-change:transform',
      // 初期は画面外へ逃がし、最初の updateGhost でポインタ位置へ正規化します。
      'transform:translate(-9999px,-9999px)',
    ].join(';');
    // classNames.dragGhost を反映します(style は上記の既定インラインより後勝ち。座標は transform で毎フレーム上書き)。
    applySlotToElement(el, args?.ghostSlot);

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

    ghostEl = el;
    ghostIconEl = icon;
    ghostState = null;
  };

  // ゴーストの位置(常にポインタ基準)とアイコン / 濃度(pane で出し分け)を更新します。
  const updateGhost = (pane: ColumnPane | null) => {
    const el = ghostEl;
    if (!el) return;
    el.style.transform =
      'translate(' + (pointer.x + GHOST_OFFSET_X) + 'px,' + (pointer.y + GHOST_OFFSET_Y) + 'px)';
    const state: ColumnPane | 'out' = pane ?? 'out';
    if (ghostState === state) return;
    ghostState = state;
    const icon = ghostIconEl;
    if (state === 'out') {
      el.style.opacity = GHOST_OUT_OPACITY;
      if (icon) icon.innerHTML = GHOST_ICON_OUT;
    } else {
      el.style.opacity = '1';
      if (icon) {
        icon.innerHTML = state === 'center' ? GHOST_ICON_MOVE : GHOST_ICON_PIN;
      }
    }
  };

  const destroyGhost = () => {
    if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
    ghostEl = null;
    ghostIconEl = null;
    ghostState = null;
  };

  // clientX/clientY → { pane, slot, leftPx(ペインローカル境界 x + leadingWidth) }。枠外は null。
  const computeHit = (clientX: number, clientY: number): DropHit | null => {
    if (args === null) return null;
    const {
      paneLayout,
      leftPaneScrollRef,
      rightPaneScrollRef,
      bodyScrollRef,
      scrollContainerRef,
      leftLeadingWidth,
      centerLeadingWidth,
      rightLeadingWidth,
    } = args;

    // 表の枠(共有スクロールコンテナ)の外へポインタが出たら hit なし(= 枠外ドロップはキャンセル / no-op)。
    //   この判定は空ペイン帯より「前」に置きます(右空ペイン帯は clientX に上限が無く枠の右外でもマッチするため)。
    const containerEl = scrollContainerRef.current;
    if (containerEl) {
      const r = containerEl.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
        return null;
      }
    }

    const leftEl = leftPaneScrollRef.current;
    const rightEl = rightPaneScrollRef.current;

    // 空の左固定ペインへのドロップ帯(left wrapper は sticky;left:0 なので rect.left === ビューポート左端)。
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
        const slot = Math.max(findPaneDropSlot(paneLayout.left, localX), countLeadingSyntheticEntries(paneLayout.left));
        return {
          pane: 'left',
          slot,
          leftPx: leftLeadingWidth + paneDropSlotBoundaryX(paneLayout.left, slot),
        };
      }
    }
    // 空の右固定ペインへのドロップ帯(right wrapper は sticky;right:0・width:0 なので rect.left === ビューポート右端)。
    if (rightEl && paneLayout.right.entries.length === 0) {
      const rect = rightEl.getBoundingClientRect();
      if (clientX >= rect.left - EMPTY_PANE_DROP_BAND) {
        return { pane: 'right', slot: 0, leftPx: -EMPTY_PANE_INDICATOR_INSET };
      }
    }
    // 右固定ペイン(非空)。左端以降。
    if (rightEl && paneLayout.right.entries.length > 0) {
      const rect = rightEl.getBoundingClientRect();
      if (clientX >= rect.left) {
        const localX = clientX - rect.left - rightLeadingWidth;
        const slot = Math.max(findPaneDropSlot(paneLayout.right, localX), countLeadingSyntheticEntries(paneLayout.right));
        return {
          pane: 'right',
          slot,
          leftPx: rightLeadingWidth + paneDropSlotBoundaryX(paneLayout.right, slot),
        };
      }
    }
    // それ以外は中央ペイン。中央は scrollLeft===0、移動する rect.left が横スクロールを吸収します。
    const centerEl = bodyScrollRef.current;
    if (centerEl && paneLayout.center.entries.length > 0) {
      const rect = centerEl.getBoundingClientRect();
      const localX = centerEl.scrollLeft + clientX - rect.left - centerLeadingWidth;
      const slot = Math.max(
        findPaneDropSlot(paneLayout.center, Math.max(localX, 0)),
        countLeadingSyntheticEntries(paneLayout.center),
      );
      return {
        pane: 'center',
        slot,
        leftPx: centerLeadingWidth + paneDropSlotBoundaryX(paneLayout.center, slot),
      };
    }
    return null;
  };

  const showIndicator = (hit: DropHit) => {
    const elements = indicatorElements();
    for (const pane of ['left', 'center', 'right'] as ColumnPane[]) {
      const el = elements[pane];
      if (!el) continue;
      if (pane === hit.pane) {
        el.style.left = `${hit.leftPx}px`;
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    }
  };

  // live 方式で初めて触るセルの元の inline style を控えます(戻している最中のセルはそちらの値を引き継ぐ)。
  const touch = (touched: Map<HTMLElement, LiveCellOriginal>, cell: HTMLElement) => {
    const restoring = restoringCells?.get(cell);
    if (restoring !== undefined) restoringCells?.delete(cell);
    touched.set(cell, restoring ?? { zIndex: cell.style.zIndex, visibility: cell.style.visibility });
  };

  // 追加(motion-9 / M-12): live 方式の位置更新。follow(同じペイン内)では掴んだ列がポインタ(+ 中央ペインは横
  //   autoscroll ぶん)に追従し、from → target の間の列が掴んだ列の幅ぶん左右へ退避します(transition 付き)。
  //   rest(ゴースト表示 / slot なし)では掴んだ列も退避も基準位置へ戻します。
  //   変更(M-12 D): lift-out(別ペインへ持ち出し中)では掴んだ列を隠し、元のペインで後ろの列を掴んだ列の幅ぶん左へ詰めます。
  //   描画中のセルを毎回走査するため、仮想化で後から描画されたセル(縦スクロール / 横 autoscroll)も取り込みます。
  //   戻り値は描画中の掴んだ列のセル(浮かぶ列の複製元)です。
  const applyLivePositions = (slot: number | null, placement: LivePlacement): HTMLElement[] => {
    const draggedCells: HTMLElement[] = [];
    const touched = liveCells;
    const key = draggingKey;
    const pane = liveSourcePane;
    if (!touched || key === null || pane === null || args === null) return draggedCells;
    const container = args.scrollContainerRef.current;
    if (!container) return draggedCells;

    const entries = args.paneLayout[pane].entries;
    const from = entries.findIndex((entry) => entry.column.key === key);
    if (from < 0) return draggedCells;
    const width = entries[from].paneLocalSize;
    // lift-out は「末尾へ移した」のと同じ退避(from より後ろの列がすべて左へ詰まる)です。
    const target =
      placement === 'lift-out'
        ? entries.length - 1
        : placement === 'rest' || slot === null
          ? from
          : slot > from
            ? slot - 1
            : slot;
    const shiftByKey = new Map<string, number>();
    for (let i = Math.min(from, target); i <= Math.max(from, target); i += 1) {
      if (i === from) continue;
      shiftByKey.set(entries[i].column.key, i > from ? -width : width);
    }
    const scrollDelta = pane === 'center' ? container.scrollLeft - liveStartScrollLeft : 0;
    const dragDelta = (dragOrigin ? pointer.x - dragOrigin.x : 0) + scrollDelta;

    for (const cell of collectColumnCells(container)) {
      const cellKey = cell.dataset.ssgColKey;
      if (cellKey === undefined) continue;
      if (cellKey === key) {
        draggedCells.push(cell);
        if (!touched.has(cell)) {
          touch(touched, cell);
          cell.style.zIndex = LIVE_DRAGGING_Z_INDEX;
          cell.style.willChange = 'transform';
        }
        const original = touched.get(cell);
        if (placement === 'follow') {
          cell.style.visibility = original?.visibility ?? '';
          cell.setAttribute(DRAGGING_COLUMN_ATTRIBUTE, 'live');
          cell.style.transition = 'none';
          cell.style.transform = `translateX(${dragDelta}px)`;
        } else if (placement === 'lift-out') {
          // 見た目は浮かぶ列が担うため、本物は基準位置で隠します(同じペインへ戻ると follow で再表示)。
          cell.style.visibility = 'hidden';
          cell.removeAttribute(DRAGGING_COLUMN_ATTRIBUTE);
          cell.style.transition = 'none';
          cell.style.transform = 'translateX(0px)';
        } else {
          cell.style.visibility = original?.visibility ?? '';
          cell.removeAttribute(DRAGGING_COLUMN_ATTRIBUTE);
          cell.style.transition = LIVE_SHIFT_TRANSITION;
          cell.style.transform = 'translateX(0px)';
        }
        continue;
      }
      const shift = shiftByKey.get(cellKey) ?? 0;
      // 一度も退避していないセルは触りません(全セルへ transform を付けない)。
      if (shift === 0 && !touched.has(cell)) continue;
      if (!touched.has(cell)) touch(touched, cell);
      const next = `translateX(${shift}px)`;
      if (cell.style.transform === next) continue;
      cell.style.transition = LIVE_SHIFT_TRANSITION;
      cell.style.transform = next;
    }
    return draggedCells;
  };

  // live 方式で触ったセルの inline style / 属性を元へ戻します。
  const resetLiveCells = (cells: Map<HTMLElement, LiveCellOriginal>) => {
    cells.forEach((original, cell) => {
      cell.style.transition = '';
      cell.style.transform = '';
      cell.style.willChange = '';
      cell.style.zIndex = original.zIndex;
      cell.style.visibility = original.visibility;
      cell.removeAttribute(DRAGGING_COLUMN_ATTRIBUTE);
    });
  };

  // ── 追加(M-12 D): 浮かぶ列 ──────────────────────────────

  // 複製をクエリ / ツールチップ / フォーカスの対象から外し、見出しの操作群(grip / 列メニュー)を取り除きます。
  const sanitizeClone = (clone: HTMLElement) => {
    const strip = (el: Element) => {
      for (const name of FLOAT_STRIP_ATTRIBUTES) el.removeAttribute(name);
    };
    strip(clone);
    clone.querySelectorAll('*').forEach(strip);
    clone.querySelectorAll('.' + HEADER_ACTIONS_CLASS).forEach((el) => el.remove());
  };

  // 浮かぶ列の複製を (作り直して) 置きます。クリップ層はスクロールコンテナの表示領域(スクロールバーを除く)と同じ矩形で、
  //   シェル(position: relative)の座標で置きます。複製は描画中のセルの縦位置をそのまま写します(横位置は positionFloat)。
  const buildFloat = (container: HTMLElement, host: HTMLElement, cells: HTMLElement[]): FloatColumn => {
    let current = float;
    if (current === null) {
      const layer = document.createElement('div');
      layer.className = FLOAT_LAYER_CLASS;
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('inert', '');
      const column = document.createElement('div');
      column.style.cssText = 'position:absolute;top:0;left:0;height:100%;will-change:transform';
      const guide = document.createElement('div');
      guide.className = DROP_INDICATOR_CLASS;
      guide.style.cssText = 'position:absolute;display:none';
      layer.append(column, guide);
      host.appendChild(layer);
      current = {
        layer,
        column,
        guide,
        badge: null,
        badgeKind: null,
        layerWidth: 0,
        columnWidth: 0,
        scrollTop: 0,
        cellCount: 0,
      };
      float = current;
    }
    const hostRect = host.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const layerLeft = containerRect.left + container.clientLeft;
    const layerTop = containerRect.top + container.clientTop;
    current.layer.style.cssText = [
      'position:absolute',
      `left:${layerLeft - hostRect.left - host.clientLeft + host.scrollLeft}px`,
      `top:${layerTop - hostRect.top - host.clientTop + host.scrollTop}px`,
      `width:${container.clientWidth}px`,
      `height:${container.clientHeight}px`,
      'overflow:hidden',
      'pointer-events:none',
      `z-index:${FLOAT_Z_INDEX}`,
    ].join(';');

    const bodyClones: HTMLElement[] = [];
    const headerClones: HTMLElement[] = [];
    let width = 0;
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      const clone = cell.cloneNode(true) as HTMLElement;
      sanitizeClone(clone);
      clone.setAttribute(DRAGGING_COLUMN_ATTRIBUTE, 'live');
      const style = clone.style;
      style.position = 'absolute';
      style.left = '0px';
      style.top = `${rect.top - layerTop}px`;
      style.width = `${rect.width}px`;
      style.minWidth = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.transform = '';
      style.transition = '';
      style.visibility = '';
      style.willChange = '';
      style.zIndex = '';
      width = Math.max(width, rect.width);
      (clone.classList.contains(HEADER_CELL_CLASS) ? headerClones : bodyClones).push(clone);
    }
    // 見出しは本体セルより前面(スクロールでヘッダーの下へ潜っている行を覆う。本物のヘッダー行と同じ重なり)。
    let badge: HTMLSpanElement | null = null;
    for (const header of headerClones) {
      header.style.zIndex = '1';
      if (badge === null) {
        badge = document.createElement('span');
        badge.className = FLOAT_PIN_CLASS;
        header.insertBefore(badge, header.firstChild);
      }
    }
    current.column.replaceChildren(...bodyClones, ...headerClones);
    current.column.style.width = `${width}px`;
    current.badge = badge;
    current.badgeKind = null;
    current.layerWidth = container.clientWidth;
    current.columnWidth = width;
    current.scrollTop = container.scrollTop;
    current.cellCount = cells.length;
    return current;
  };

  // 浮かぶ列を用意します(縦スクロール / 描画中のセル数が変わったら複製し直す)。置けない(シェルが無い / 複製元が無い)
  //   ときは null。
  const ensureFloat = (cells: HTMLElement[]): FloatColumn | null => {
    const container = args?.scrollContainerRef.current ?? null;
    const host = container?.parentElement ?? null;
    if (!container || !host) return null;
    // 複製元が描画されていない(横の仮想化で外れた等)ときは直前の複製を使い続けます。
    if (cells.length === 0) return float;
    if (float !== null && float.scrollTop === container.scrollTop && float.cellCount === cells.length) return float;
    return buildFloat(container, host, cells);
  };

  // 中央ペインの x(screen)が固定ペインの下に潜っているか(本物の縦線は固定ペインに隠れて見えない位置)。
  const isUnderPinnedPane = (x: number): boolean => {
    if (args === null) return false;
    const leftEl = args.leftPaneScrollRef.current;
    if (leftEl && args.paneLayout.left.entries.length > 0 && x < leftEl.getBoundingClientRect().right - 0.5) return true;
    const rightEl = args.rightPaneScrollRef.current;
    if (rightEl && args.paneLayout.right.entries.length > 0 && x > rightEl.getBoundingClientRect().left + 0.5) return true;
    return false;
  };

  // 移動先の縦線を浮かぶ列の上へ写します(位置は本物の縦線の矩形そのまま。本物が出ていない / 中央の縦線が固定ペインの
  //   下に潜っているときは写さない)。
  const syncFloatGuide = (current: FloatColumn, pane: ColumnPane, layerRect: DOMRect) => {
    const guide = current.guide;
    const source = indicatorElements()[pane];
    if (!source || source.style.display !== 'block') {
      guide.style.display = 'none';
      return;
    }
    const rect = source.getBoundingClientRect();
    if (pane === 'center' && isUnderPinnedPane(rect.left + rect.width / 2)) {
      guide.style.display = 'none';
      return;
    }
    guide.style.left = `${rect.left - layerRect.left}px`;
    guide.style.top = `${rect.top - layerRect.top}px`;
    guide.style.height = `${rect.height}px`;
    guide.style.display = 'block';
  };

  // 浮かぶ列をポインタ基準で置き(表の枠の内側に収める)、見出しのアイコンを移動先のペインで出し分け(ゴーストと同じ:
  //   固定ペインへはピン、中央へは移動の矢印)、縦線を浮かぶ列の上へ写します。
  const positionFloat = (current: FloatColumn, pane: ColumnPane) => {
    const layerRect = current.layer.getBoundingClientRect();
    const maxLeft = Math.max(current.layerWidth - current.columnWidth, 0);
    const left = Math.min(Math.max(pointer.x - grabOffsetX - layerRect.left, 0), maxLeft);
    current.column.style.transition = 'none';
    current.column.style.transform = `translateX(${left}px)`;
    const kind = pane === 'center' ? 'move' : 'pin';
    if (current.badge !== null && current.badgeKind !== kind) {
      current.badgeKind = kind;
      current.badge.innerHTML = kind === 'move' ? moveIconSvg(FLOAT_PIN_ICON_SIZE) : pinIconSvg(FLOAT_PIN_ICON_SIZE);
    }
    syncFloatGuide(current, pane, layerRect);
  };

  const destroyFloat = () => {
    float?.layer.remove();
    float = null;
  };

  // 離したあとの浮かぶ列を、screen-x(列の左端)へ滑らせます。
  const slideFloatTo = (current: FloatColumn, screenLeft: number, durationMs: number) => {
    const layerRect = current.layer.getBoundingClientRect();
    current.column.style.transition = `transform ${durationMs}ms ${SETTLE_EASING}`;
    current.column.style.transform = `translateX(${screenLeft - layerRect.left}px)`;
    current.badge?.remove();
    current.guide.style.display = 'none';
  };

  // 滑り込みを終えます(浮かぶ列を外し、隠していた本物のセルを戻す)。次のドラッグ開始 / dispose では途中でも即終了します。
  const finishLanding = () => {
    const current = landing;
    landing = null;
    if (current === null) return;
    if (current.timer !== null) window.clearTimeout(current.timer);
    for (const [cell, visibility] of current.hiddenCells) cell.style.visibility = visibility;
    current.float.layer.remove();
  };

  // 確定後(commit 済みの DOM)に、浮かぶ列を新しい位置の列へ滑り込ませます(applyReorderSettle から呼ぶ)。
  //   列が描画されていない(横の仮想化で画面外)ときは滑らせずに片付けます。
  const landFloatOnCommittedColumn = () => {
    const current = landing;
    if (current === null || current.key === null) return;
    const key = current.key;
    current.key = null;
    const container = args?.scrollContainerRef.current ?? null;
    const cells = container ? collectColumnCells(container).filter((cell) => cell.dataset.ssgColKey === key) : [];
    if (cells.length === 0) {
      finishLanding();
      return;
    }
    const screenLeft = cells[0].getBoundingClientRect().left;
    for (const cell of cells) {
      current.hiddenCells.push([cell, cell.style.visibility]);
      cell.style.visibility = 'hidden';
    }
    slideFloatTo(current.float, screenLeft, FLOAT_LAND_MS);
    if (current.timer !== null) window.clearTimeout(current.timer);
    current.timer = window.setTimeout(finishLanding, FLOAT_LAND_MS + 40);
  };

  const updateIndicator = () => {
    const hit = computeHit(pointer.x, pointer.y);
    // 追加(motion-9 / M-12): live 方式。枠外(hit なし)では直前のドロップ先を保ちます(離しても確定。行の live 方式と
    //   同じ)。同じペイン内は列そのものを動かし、別ペインへ移すときだけ縦線 + ゴーストを出します。
    if (isLive()) {
      if (hit) dropTarget = { pane: hit.pane, slot: hit.slot };
      const target = dropTarget;
      if (target !== null && target.pane !== liveSourcePane) {
        if (hit) showIndicator(hit);
        // 変更(M-12 D): 別ペインへ移すときは浮かぶ列がポインタに付いてきて、元のペインは詰まり、移動先は縦線で示します。
        const container = args?.scrollContainerRef.current ?? null;
        if (container?.parentElement != null) {
          const current = ensureFloat(applyLivePositions(null, 'lift-out'));
          if (current !== null) {
            destroyGhost();
            positionFloat(current, target.pane);
            return;
          }
        }
        // 浮かぶ列を置けないときは従来どおり、列を基準位置へ戻してゴーストを出します。
        destroyFloat();
        createGhost(ghostLabel);
        updateGhost(target.pane);
        applyLivePositions(null, 'rest');
        return;
      }
      destroyFloat();
      destroyGhost();
      hideAllIndicators();
      applyLivePositions(target === null ? null : target.slot, 'follow');
      return;
    }
    // ゴーストは hit の有無に関わらずポインタへ追従(枠外=null は 'out' 表現)。縦線の表示判定は hit 基準。
    updateGhost(hit ? hit.pane : null);
    if (!hit) {
      dropTarget = null;
      hideAllIndicators();
      return;
    }
    dropTarget = { pane: hit.pane, slot: hit.slot };
    showIndicator(hit);
  };

  // rAF 端 autoscroll(共有スクロールコンテナ。水平方向のみ。13-B3-6)。
  const autoScrollTick = () => {
    // ゾンビ化防止の自己停止ガード。ドラッグ終了済みなら次フレームを予約せず終了します(13-B3-7)。
    if (draggingKey === null) {
      rafId = null;
      return;
    }
    const el = args?.scrollContainerRef.current ?? null;
    if (el) {
      if (!autoScrollArmed) {
        if (!dragOrigin || hasPointerLeftActivationRadius(dragOrigin, pointer, AUTO_SCROLL_ACTIVATION_DISTANCE)) {
          autoScrollArmed = true;
        }
      }
      if (autoScrollArmed) {
        const rect = el.getBoundingClientRect();
        const contentBox = resolveScrollContentBox({
          rectLeft: rect.left,
          rectTop: rect.top,
          clientLeft: el.clientLeft,
          clientTop: el.clientTop,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
        });
        const direction = resolveAutoScrollAxisDirection(
          pointer.x,
          contentBox.left,
          contentBox.right,
          AUTO_SCROLL_EDGE_THRESHOLD,
        );
        const nextLeft = computeNextScrollPosition(
          el.scrollLeft,
          direction,
          AUTO_SCROLL_STEP,
          el.scrollWidth - el.clientWidth,
        );
        if (nextLeft !== el.scrollLeft) {
          el.scrollTo({ left: nextLeft, behavior: 'auto' });
        }
      }
    }
    // 端スクロールで rect が動くため、停止中の指でも毎フレーム slot を再計算します。
    updateIndicator();
    rafId = requestAnimationFrame(autoScrollTick);
  };

  const endDrag = (commit: boolean) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    document.body.style.cursor = '';
    hideAllIndicators();
    destroyGhost();

    const draggedKey = draggingKey;
    const target = dropTarget;
    draggingKey = null;
    dropTarget = null;
    dragOrigin = null;
    const touched = liveCells;
    liveCells = null;
    liveSourcePane = null;

    // 修正(M-12 fix): 同じペインで掴んだ列の直前 / 直後のスロットは、画面上の位置が変わらないので何もしません(表示されない
    //   列 = 行グルーピング中のグループ元列を挟むと、columns の配列順だけが変わって onColumnsChange が呼ばれていた)。
    const unchangedSlot =
      draggedKey !== null && target !== null && args !== null
        ? args.paneLayout[target.pane].entries.findIndex((entry) => entry.column.key === draggedKey)
        : -1;
    const isNoOpDrop = target !== null && unchangedSlot >= 0 && (target.slot === unchangedSlot || target.slot === unchangedSlot + 1);
    const keys =
      commit && draggedKey && target && args !== null && !isNoOpDrop
        ? computeHeaderReorderedKeys(
            args.columns,
            draggedKey,
            target.pane,
            resolveConsumerDropSlot(args.columns, args.paneLayout[target.pane], target.pane, target.slot),
          )
        : null;

    // 追加(M-12 D): 浮かぶ列はドラッグ状態から外し、離したあとの滑り込み(landing)へ引き継ぎます。
    const lifted = float;
    float = null;

    // 追加(motion-9 / M-12): live 方式の後始末。確定しないとき(キャンセル / no-op)は基準位置へ戻します(transition 付き)。
    if (touched && !keys) {
      touched.forEach((_, cell) => {
        if (!cell.isConnected) return;
        cell.style.transition = LIVE_SHIFT_TRANSITION;
        cell.style.transform = 'translateX(0px)';
      });
      // 変更(M-12 D): 別ペインへ持ち出していたときは、浮かぶ列を元の位置(隠している本物の列の基準位置)へ滑らせ、
      //   戻り切ってから本物を表示します(本物の visibility は resetLiveCells が戻す)。
      let returning: FloatLanding | null = null;
      if (lifted !== null) {
        let originCell: HTMLElement | null = null;
        for (const cell of touched.keys()) {
          if (cell.isConnected && cell.dataset.ssgColKey === draggedKey) {
            originCell = cell;
            break;
          }
        }
        if (originCell !== null) {
          slideFloatTo(lifted, originCell.getBoundingClientRect().left, LIVE_SHIFT_MS);
          returning = { float: lifted, key: null, timer: null, hiddenCells: [] };
          landing = returning;
        } else {
          lifted.layer.remove();
        }
      }
      restoringCells = touched;
      window.setTimeout(() => {
        resetLiveCells(touched);
        if (restoringCells === touched) restoringCells = null;
        if (returning !== null && landing === returning) finishLanding();
      }, LIVE_SHIFT_MS + 40);
    } else if (lifted !== null && !keys) {
      lifted.layer.remove();
    }

    if (!keys || !draggedKey || !target || args === null) return; // no-op ドラッグ(同一 pane・同一 slot)/ キャンセル

    const { columns, applyColumnOrderAndPin, scrollContainerRef } = args;

    // same-pane(ピン変更なし)の並べ替えのみ settle アニメを準備します(cross-pane はペイン幅 / 位置が変わり
    //   クリップが生じ得るためスナップ。reduced-motion もスナップ)。capture は commit 前に行います。
    //   live 方式は追従 / 退避した現在の画面位置を capture してから inline style を外すため、新しい位置へそこから滑ります。
    const draggedColumn = columns.find((column) => column.key === draggedKey);
    const sourcePane = draggedColumn ? getColumnPane(draggedColumn) : null;
    const samePaneReorder = sourcePane !== null && sourcePane === target.pane;
    settlePending =
      samePaneReorder && !isMotionOff(scrollContainerRef.current) ? captureColumnLefts(scrollContainerRef.current) : null;
    if (touched) resetLiveCells(touched);

    // 追加(M-12 D): 別ペインへ確定したときは、浮かぶ列を残して新しい位置へ滑り込ませます(commit 後の applyReorderSettle で
    //   新しい列の位置を測る)。commit が同期的に描画まで進んでも拾えるよう、commit より前に landing を用意します。
    //   applyReorderSettle が来ない(利用側が columns を差し替えなかった等)ときは猶予後に片付けます。
    if (lifted !== null) {
      if (samePaneReorder) {
        lifted.layer.remove();
      } else {
        lifted.badge?.remove();
        lifted.guide.style.display = 'none';
        landing = {
          float: lifted,
          key: draggedKey,
          timer: window.setTimeout(finishLanding, FLOAT_LAND_FALLBACK_MS),
          hiddenCells: [],
        };
      }
    }

    const pinOverride = new Map<string, GridColumnPinned | undefined>([
      [draggedKey, target.pane === 'center' ? undefined : target.pane],
    ]);
    applyColumnOrderAndPin(keys, pinOverride);
  };

  // 並べ替え確定後(commit 済みの DOM)に呼ばれ、各列セルへ FLIP を 1 回当てて「新しい位置へスライド」させます。
  const applyReorderSettle = () => {
    // 追加(M-12 D): 別ペインへ確定した浮かぶ列の滑り込み(armed のときだけ)。
    landFloatOnCommittedColumn();
    const before = settlePending;
    settlePending = null;
    if (!before) return;
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return;

    const cellsByKey = new Map<string, HTMLElement[]>();
    const newLeftByKey = new Map<string, number>();
    container.querySelectorAll<HTMLElement>('[data-ssg-col-key]').forEach((cell) => {
      if (isInsideDetailCardOf(container, cell)) return;
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
    for (const cell of animatedCells) {
      cell.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      cell.style.transform = 'translateX(0)';
    }
    // 後始末: インライン style を消します(次のドラッグ / 再レンダーと競合させない)。
    window.setTimeout(() => {
      for (const cell of animatedCells) {
        cell.style.transition = '';
        cell.style.transform = '';
        cell.style.willChange = '';
      }
    }, SETTLE_MS + 80);
  };

  const onColumnDragHandlePointerDown = (column: GridColumn<T>, event: ColumnDragHandlePointerEvent) => {
    if (args === null || !args.enabled) return;
    if (event.button !== 0) return;
    // ヘッダー本体の列範囲選択(onColumnHeaderPointerDown)へ伝播させない(掴み手方式)。
    event.stopPropagation();
    event.preventDefault();

    // 追加(M-12 D): 前のドラッグの浮かぶ列がまだ滑り込み中なら、ここで終えます。キャンセルで戻している最中の列は
    //   浮かぶ列が戻り切るまで隠しているため、先に表示へ戻します(transform の戻りは従来どおり transition 後に外す)。
    finishLanding();
    destroyFloat();
    restoringCells?.forEach((original, cell) => {
      cell.style.visibility = original.visibility;
    });

    draggingKey = column.key;
    dropTarget = null;
    pointer = { x: event.clientX, y: event.clientY };
    dragOrigin = { x: event.clientX, y: event.clientY };
    autoScrollArmed = false;
    document.body.style.cursor = 'grabbing';
    ghostLabel = column.title || column.key;
    if (isLive()) {
      const container = args.scrollContainerRef.current;
      liveSourcePane = getColumnPane(column);
      liveStartScrollLeft = container?.scrollLeft ?? 0;
      liveCells = new Map();
      // 追加(M-12 D): 掴んだ点が列の左端からどれだけ右か(浮かぶ列をポインタ基準で置くため)。列のセルが見つからなければ
      //   列幅の中央を掴んだものとします。
      const startCell = container
        ? collectColumnCells(container).find((cell) => cell.dataset.ssgColKey === column.key)
        : undefined;
      grabOffsetX = startCell
        ? event.clientX - startCell.getBoundingClientRect().left
        : (args.paneLayout[liveSourcePane].entries.find((entry) => entry.column.key === column.key)?.paneLocalSize ?? 0) / 2;
    } else {
      createGhost(ghostLabel);
    }

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    // capture は「グリップ存命中」の保護(スクロールバー等へのイベント横取り防止)として維持しますが、
    //   リスナーの付け先は window です(13-B3-7。仮想化で grip が unmount しても pointerup を受けられる)。
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* capture 不可環境は無視 */
    }

    const handleMove = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pointerId) return;
      pointer = { x: nativeEvent.clientX, y: nativeEvent.clientY };
      updateIndicator();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('keydown', handleKeyDown);
      activeDragDispose = null;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* noop(グリップが unmount 済みでも無害) */
      }
    };
    function handleUp(nativeEvent: PointerEvent) {
      if (nativeEvent.pointerId !== pointerId) return;
      cleanup();
      endDrag(true);
    }
    function handleCancel(nativeEvent: PointerEvent) {
      if (nativeEvent.pointerId !== pointerId) return;
      cleanup();
      endDrag(false);
    }
    // 追加(motion-9 / M-12): Escape でキャンセル(行ドラッグと同じ。縦線 / ゴーストを消し、live 方式は元の位置へ戻す)。
    function handleKeyDown(nativeEvent: KeyboardEvent) {
      if (nativeEvent.key !== 'Escape') return;
      cleanup();
      endDrag(false);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKeyDown);
    activeDragDispose = cleanup;

    updateIndicator();
    rafId = requestAnimationFrame(autoScrollTick);
  };

  return {
    update: (next) => {
      args = next;
    },
    onColumnDragHandlePointerDown,
    applyReorderSettle,
    // 最終後始末ネット(13-B3-3 / 13-B3-7): ドラッグ中に破棄されても window リスナー / rAF / body cursor /
    //   ゴーストを確実に解放します。
    dispose: () => {
      activeDragDispose?.();
      activeDragDispose = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      draggingKey = null;
      dropTarget = null;
      document.body.style.cursor = '';
      destroyGhost();
      if (liveCells) resetLiveCells(liveCells);
      liveCells = null;
      liveSourcePane = null;
      // 追加(M-12 D): 浮かぶ列(ドラッグ中 / 滑り込み中)も外します。
      destroyFloat();
      finishLanding();
    },
  };
};