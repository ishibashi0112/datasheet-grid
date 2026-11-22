// 追加(Solid 版 段階 1-3): 展開行(Master/Detail)の開閉とフォーカスの順のコントローラです(React に依存しない DOM の処理)。
//   React 版の GridShell.tsx にあった useCallback 群(returnFocusFromDetailCard(s) / toggleDetailRowAt / setDetailRowExpandedAt /
//   toggleDetailRowFromKeyboard / moveFocusPastTable / handleTabPastLastColumn / handleDetailCardKeyDown /
//   handleDetailCardFocusLost / handleTableExitFocus / handleRootKeyDown の Tab の後始末)を移し、Solid 版も同じ判断を使います。
//   - 開閉: セル側のトグルは「そのセルの view index」でキャッシュを seed してから dispatch します(serverSide でも全行走査
//     なしで帯の位置が決まる)。閉じる前にフォーカスがその行のカードの中なら、その行のセル(列はアクティブセルの列、無ければ
//     最初のデータの列)をアクティブセルにしてフォーカスを表へ戻します(段階 2 の確かめ直し。カードと一緒にフォーカスが消えて
//     body へ落ちていた)。
//   - Tab の順(段階 2 C-N2): 最終列の Tab はその行のカードが開いていればカードの最初の要素へ、カードの最後の要素の Tab は表の
//     外へ(別の行のカードを通らない)。Shift+Tab は逆順(カードの最初の要素 → その行の最終列のセル、表の後ろから戻ると
//     アクティブセルの行のカードの最後の要素)。表の外へ出すときは keydown の既定動作の前にフォーカスを表の直後の目印へ移し、
//     既定動作をそこから進めます(controllers/detailTabOrder)。
//   状態はイベントの時点の store から読みます(getUiState)。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { CellCoord, GridRowKey, GridUiState, RowModel } from '../model/gridTypes.unbound';
import {
  isDetailRowExpandable,
  isInsideDetailCardOf,
  resolveFirstDataColIndex,
  seedDetailIndexCache,
  type DetailIndexCacheHolder,
} from '../logic/detailRow';
import { isImeComposingKeyEvent, isTabKeyEvent } from '../logic/domGuards';
import { findDetailCard, focusDetailCardEdge, isTabEdgeOfCard } from './detailTabOrder';
import { getActiveElement } from '../utils/shadowDom';

type ElementRef = { readonly current: HTMLElement | null };

export type DetailRowControllerArgs<T> = {
  rowModel: RowModel<T>;
  // 論理 index の空間の列(ペイン順。セル座標の col と同じ並び)。
  orderedColumns: readonly { key: string }[];
  // 展開行のカードが 1 枚でも描かれているか(detailRow の指定があり、描画窓の中に開いた行がある)。
  hasCards: boolean;
  // 行が多すぎて展開行を描けない間は false(1.0.1 / AP-26。トグルを出さず、キーでも開閉しない)。
  drawable: boolean;
  isExpandable: ((row: T, ctx: { rowKey: GridRowKey; sourceRowIndex: number }) => boolean) | undefined;
  detailIndexCache: DetailIndexCacheHolder;
  getUiState: () => GridUiState;
  dispatch: (action: GridUiAction) => void;
  scrollContainerRef: ElementRef;
  gridRootRef: ElementRef;
  // 表の直後の目印(.ssg-tab-exit)。
  tableExitRef: ElementRef;
  // 戻したセルを見える範囲へ(次のフレームで。見えていれば動かさない)。
  scrollCellIntoView: (cell: CellCoord) => void;
};

export type DetailRowController<T> = {
  update: (args: DetailRowControllerArgs<T>) => void;
  toggleAt: (rowKey: GridRowKey, viewIndex: number) => void;
  setExpandedAt: (rowKey: GridRowKey, viewIndex: number, expanded: boolean) => void;
  // 展開トグル列のセルでの Enter / Space(dogfood DU-04)。開閉したら true(キーの既定の動作を止める)。
  toggleFromKeyboard: (cell: CellCoord) => boolean;
  // ハンドルで閉じる(setDetailRowExpanded(key, false) / collapseAllDetailRows())前(段階 2 の確かめ直し C-N6)。
  returnFocusFromCards: (viewIndexes: readonly number[]) => void;
  moveFocusPastTable: () => void;
  // 最終列の Tab(keyboardController の onTabPastLastColumn)。カードへ入ったら true。
  handleTabPastLastColumn: (viewRowIndex: number) => boolean;
  // カードの中の keydown(グリッド本体へは伝えない)。card はその行のカードの要素。
  handleCardKeyDown: (event: KeyboardEvent, card: HTMLElement, viewRowIndex: number) => void;
  // フォーカスを持ったカードが消えた(1.0.2 / G-13)。
  handleCardFocusLost: () => void;
  // 表の直後の目印にフォーカスが来た(relatedTarget は来る前の要素)。
  handleTableExitFocus: (relatedTarget: EventTarget | null) => void;
  // シェルの keydown をグリッドのキー操作が処理した後(セルや見出しの中の消費側の要素で Tab を押し、表の中にもう止まる
  //   要素が無いときに表の外へ出す。段階 2 の見直し)。
  handleRootKeyDownAfter: (event: KeyboardEvent) => void;
};

// 修飾キーつき / IME の変換中 / 既に処理された Tab は扱いません。key は React の合成イベントと同じく keyCode でも見ます
//   (logic/domGuards の isTabKeyEvent。WebKitGTK の Shift+Tab は key='Unidentified')。
const isPlainTab = (event: KeyboardEvent): boolean =>
  isTabKeyEvent(event) &&
  !event.defaultPrevented &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !isImeComposingKeyEvent(event);

export const createDetailRowController = <T>(): DetailRowController<T> => {
  let args: DetailRowControllerArgs<T> | null = null;
  // 表の外へ出すために目印へフォーカスを移している間(目印の focus を「後ろから戻ってきた」と扱わない)。
  let exitFocusing = false;

  const focusGridRoot = () => {
    args?.gridRootRef.current?.focus({ preventScroll: true });
  };

  const selectCell = (cell: CellCoord) => {
    if (!args) return;
    args.dispatch(gridActions.startSelection(cell));
    args.dispatch(gridActions.endSelection());
  };

  const returnFocusFromCard = (viewIndex: number) => {
    if (!args) return;
    const scroll = args.scrollContainerRef.current;
    const card = scroll ? findDetailCard(scroll, viewIndex) : null;
    if (!card || !card.contains(getActiveElement(card))) {
      return;
    }
    const activeCol = args.getUiState().activeCell?.col;
    const cell = { row: viewIndex, col: activeCol ?? resolveFirstDataColIndex(args.orderedColumns) };
    selectCell(cell);
    focusGridRoot();
    // 段階 2 の確かめ直し C-N7: 戻したセルを見える範囲へ(背の高いカードを読み進めると、行は見出しの裏に隠れている)。
    args.scrollCellIntoView(cell);
  };

  const toggleAt = (rowKey: GridRowKey, viewIndex: number) => {
    if (!args) return;
    seedDetailIndexCache(args.detailIndexCache.current, rowKey, viewIndex);
    if (args.getUiState().expandedDetailRowKeys.has(rowKey)) {
      returnFocusFromCard(viewIndex);
    }
    args.dispatch(gridActions.toggleDetailRow(rowKey));
  };

  const setExpandedAt = (rowKey: GridRowKey, viewIndex: number, expanded: boolean) => {
    if (!args) return;
    seedDetailIndexCache(args.detailIndexCache.current, rowKey, viewIndex);
    if (!expanded) {
      returnFocusFromCard(viewIndex);
    }
    args.dispatch(gridActions.setDetailRowExpanded(rowKey, expanded));
  };

  const toggleFromKeyboard = (cell: CellCoord): boolean => {
    if (!args) return false;
    const { rowModel } = args;
    const row = rowModel.getRow(cell.row);
    if (row === undefined) {
      return false;
    }
    const rowKey = rowModel.getRowKey(cell.row) ?? cell.row;
    if (!isDetailRowExpandable(args.drawable, args.isExpandable, row, rowKey, rowModel.getSourceIndex(cell.row) ?? cell.row)) {
      return false;
    }
    toggleAt(rowKey, cell.row);
    return true;
  };

  const returnFocusFromCards = (viewIndexes: readonly number[]) => {
    for (const viewIndex of viewIndexes) {
      returnFocusFromCard(viewIndex);
    }
  };

  const moveFocusPastTable = () => {
    const exit = args?.tableExitRef.current;
    if (!exit) {
      return;
    }
    // 既定動作(Tab)は今のフォーカスの位置から進むので、表の直後の目印へ移しておくと表の外(または検索バー / エラーバー)へ出ます。
    exitFocusing = true;
    try {
      exit.focus({ preventScroll: true });
    } finally {
      exitFocusing = false;
    }
  };

  const handleTabPastLastColumn = (viewRowIndex: number): boolean => {
    const scroll = args?.scrollContainerRef.current;
    const card = args?.hasCards && scroll ? findDetailCard(scroll, viewRowIndex) : null;
    if (card && focusDetailCardEdge(card, 'first')) {
      return true;
    }
    // 1.0.2 / F-10: 展開行が無い表でも、表の直後の目印から既定の Tab を進めます(ラベル行の render やセルの中に置いた
    //   ボタンへ DOM の順に入り、表の外へ出るのに何回も Tab が要っていた)。
    moveFocusPastTable();
    return false;
  };

  const handleCardKeyDown = (event: KeyboardEvent, card: HTMLElement, viewRowIndex: number) => {
    if (!args || !isPlainTab(event)) {
      return;
    }
    const target = event.target;
    // カードから portal で出した要素(ダイアログ / ポップオーバー)のキーは、フレームワークのイベントではカードへ届きます。
    //   DOM 上でカードの外なので数えません(数えると「カードの最後」と判定し、ダイアログの中の Tab で表の外へ出ていた)。
    if (
      !(target instanceof Element) ||
      !card.contains(target) ||
      !isTabEdgeOfCard(card, target, event.shiftKey ? 'backward' : 'forward')
    ) {
      return;
    }
    if (!event.shiftKey) {
      moveFocusPastTable();
      return;
    }
    // Shift+Tab: カードの最初の要素から、その行の最終列のセルへ戻ります。
    const lastCol = args.orderedColumns.length - 1;
    if (lastCol < 0) {
      return;
    }
    event.preventDefault();
    const cell = { row: viewRowIndex, col: lastCol };
    selectCell(cell);
    args.dispatch(gridActions.activateCell(cell));
    focusGridRoot();
    args.scrollCellIntoView(cell);
  };

  const handleTableExitFocus = (relatedTarget: EventTarget | null) => {
    if (exitFocusing || !args) {
      return;
    }
    // 後ろ(表の外 / 検索バーなど)から Shift+Tab で来たら、アクティブセルの行のカードの最後の要素へ。前(表の中)から来たときと
    //   カードが無いときはシェルへ(見えない目印にフォーカスを残さない)。
    const exit = args.tableExitRef.current;
    const cameBackward =
      !(relatedTarget instanceof Node) ||
      exit === null ||
      (exit.compareDocumentPosition(relatedTarget) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const active = args.getUiState().activeCell;
    const scroll = args.scrollContainerRef.current;
    if (cameBackward && active && scroll) {
      const card = findDetailCard(scroll, active.row);
      if (card && focusDetailCardEdge(card, 'last')) {
        return;
      }
    }
    focusGridRoot();
  };

  const handleRootKeyDownAfter = (event: KeyboardEvent) => {
    if (!args?.hasCards || event.shiftKey || !isPlainTab(event)) {
      return;
    }
    const target = event.target;
    const scroll = args.scrollContainerRef.current;
    if (
      !(target instanceof Element) ||
      !scroll ||
      !scroll.contains(target) ||
      isInsideDetailCardOf(scroll, target) ||
      !isTabEdgeOfCard(scroll, target, 'forward')
    ) {
      return;
    }
    moveFocusPastTable();
  };

  return {
    update: (next) => {
      args = next;
    },
    toggleAt,
    setExpandedAt,
    toggleFromKeyboard,
    returnFocusFromCards,
    moveFocusPastTable,
    handleTabPastLastColumn,
    handleCardKeyDown,
    handleCardFocusLost: focusGridRoot,
    handleTableExitFocus,
    handleRootKeyDownAfter,
  };
};

// 追加(1.0.2 / G-13 を移設): カードが消えるとき(外す直前。DOM はまだある)に呼びます。中にフォーカスがあれば、消えた後で
//   フォーカスがどこにも無い(body)ときだけ onFocusLost を呼びます(消える前にフォーカスを別の場所へ移した操作は邪魔しない)。
export const notifyDetailCardFocusLost = (card: HTMLElement | null, onFocusLost: (() => void) | undefined): void => {
  if (!onFocusLost || !card || !card.contains(getActiveElement(card))) {
    return;
  }
  queueMicrotask(() => {
    const active = getActiveElement(card.ownerDocument);
    if (!card.isConnected && (active === null || active === card.ownerDocument.body)) {
      onFocusLost();
    }
  });
};