import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent,
  type RefObject,
} from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
// 変更(MS-2): Shift+click ソートで colIndex(論理 index) → columnKey 解決に列配列を
//            使うため GridColumn を追加 import します。
import type {
  CellCoord,
  GridColumn,
  GridUiState,
} from '../model/gridTypes';
// 追加(MS-2): ソートエントリ配列の次状態を求める純関数です(列メニューと共有)。
import { nextSortEntries } from '../logic/sorting';
// 変更(10-E): グローバル座標(columnMeasurements)前提の当たり判定から、
//             ペイン別座標系の当たり判定へ切り替えます。
// 変更理由: 10-B〜10-D で DOM を 3 ペインに物理分離し、UI state の col は
//           「論理列 index（orderedColumns 空間＝左→中→右の視覚順）」になりました。
//           ところがドラッグ選択の実体は grid root の onPointerMoveCapture →
//           updateSelectionFromPointer であり、ここがグローバル座標 +
//           columnMeasurements(visibleColumns 順) のままだと、pinned 列を入れた
//           瞬間に「ドラッグ中の選択列がズレる」ため、ペイン別ヒットテストへ移行します。
import {
  clamp,
  findLogicalIndexFromPaneOffset,
  type GridPaneLayout,
} from '../logic/geometry';
// 追加(scroll-space 仮想化): clientY→row の物理→論理換算(scaleFactor=1 で従来式と一致)。
import { clientYToRowIndex } from '../logic/verticalGeometry';
import type { RowMetrics } from '../logic/verticalGeometry';
// 追加(scroll-fix): 端 auto-scroll の判定純関数と共通定数です(armed ガード /
//   コンテンツ領域基準の端帯判定 / [0, max] clamp)。詳細は autoScrollGeometry 冒頭コメント参照。
import {
  AUTO_SCROLL_ACTIVATION_DISTANCE,
  AUTO_SCROLL_EDGE_THRESHOLD,
  AUTO_SCROLL_STEP,
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from '../logic/autoScrollGeometry';

type UseGridPointerInteractionsArgs<T> = {
  gridRootRef: RefObject<HTMLDivElement | null>;
  // 中央ペイン要素です。ヒットテストの基準矩形に使います。
  // 変更(10-G): 中央ペインはネイティブスクロールしなくなり（scrollTop/Left は常に 0）、
  //             その getBoundingClientRect() がスクロール量を反映して移動するため、
  //             当たり判定の式は従来のまま正しく機能します。
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  // 追加(10-G): 縦横ともにスクロールする「外側の共有スクロールコンテナ」です。
  //             ドラッグ選択中の自動スクロールはこの要素を動かします。
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // 追加(10-E): 左／右固定ペインのスクロール要素 ref です。clientX のペイン判定に使います。
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  pointerClientRef: RefObject<{ x: number; y: number } | null>;
  autoScrollFrameRef: RefObject<number | null>;
  uiState: GridUiState;
  dispatch: Dispatch<GridUiAction>;
  enableRangeSelection: boolean;
  // 追加(MS-2): ヘッダー Shift+click ソート(発火口 a)の有効化フラグです。
  //             enableSorting=false のときは Shift+click でも並べ替えしません。
  enableSorting: boolean;
  // 追加(MS-2): colIndex(= entry.logicalIndex / orderedColumns 空間)から
  //             columnKey を引くための列配列です。selection/activeCell と同じ
  //             論理 index 空間なので、orderedColumns[colIndex] で一意に解決できます。
  orderedColumns: GridColumn<T>[];
  filteredRowsLength: number;
  visibleColumnsLength: number;
  // 追加(10-E): 3 ペインの geometry です。当たり判定はこのペインローカル座標で行います。
  paneLayout: GridPaneLayout<T>;
  // 追加(10-E): 各ペインで列の前に確保する先頭幅です。
  //             左固定あり: left=rowHeaderWidth / center=0 / right=0
  //             左固定なし: center=rowHeaderWidth（従来と完全一致）
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  headerHeight: number;
  // 変更(auto-height シーム): ヒットテストの行解決は RowMetrics 経由(uniform で従来の floor(y/rowHeight) と一致)。
  rowMetrics: RowMetrics;
  // 追加(scroll-space 仮想化): clientY→row の物理→論理換算倍率(scaleFactor=1 で従来式)。
  verticalScaleFactor: number;
  // 追加(UI hover): 行ホバーの設定/クリア用 setter です。セル/行ヘッダー enter で行 index を
  //   設定し、列ヘッダー enter ではクリアします(grid から出たときの clear は呼び出し側で行います)。
  setHoveredRowIndex: (value: number | null) => void;
  // 追加(UI hover): 列ヘッダーホバーの設定用 setter です(列ヘッダー enter で colIndex を設定)。
  setHoveredColumnIndex: (value: number | null) => void;
  // 追加(UI hover): 行ホバー(既定 true)/列ヘッダーホバー(既定 true)の有効化フラグです。
  enableRowHover: boolean;
  enableColumnHeaderHover: boolean;
  // 追加(行選択): チェックボックス行選択の有効化と、ガター操作のコールバックです。
  //   true のときガター(行NO)の pointerdown/drag は行選択へ委譲します(Excel 風の
  //   ガター起点セル範囲選択は off)。callback は component 側(rowModel を持つ)で
  //   view index→key を解決してコミットします(参照は安定 = memo 維持)。
  enableRowSelection: boolean;
  onGutterRowSelect: (
    viewIndex: number,
    opts: { shiftKey: boolean },
  ) => void;
  onGutterRowSelectDrag: (viewIndex: number) => void;
};

// 追加: pointer 系 interaction（cell/row/col selection + drag auto-scroll + window pointer sync）をまとめます。
export const useGridPointerInteractions = <T,>({
  gridRootRef,
  bodyScrollRef,
  scrollContainerRef,
  leftPaneScrollRef,
  rightPaneScrollRef,
  pointerClientRef,
  autoScrollFrameRef,
  uiState,
  dispatch,
  enableRangeSelection,
  // 追加(MS-2): Shift+click ソート用。
  enableSorting,
  orderedColumns,
  filteredRowsLength,
  visibleColumnsLength,
  paneLayout,
  leftLeadingWidth,
  centerLeadingWidth,
  rightLeadingWidth,
  headerHeight,
  rowMetrics,
  verticalScaleFactor,
  setHoveredRowIndex,
  setHoveredColumnIndex,
  enableRowHover,
  enableColumnHeaderHover,
  enableRowSelection,
  onGutterRowSelect,
  onGutterRowSelectDrag,
}: UseGridPointerInteractionsArgs<T>) => {
  // 追加(11-A2): dragState の最新値を ref で保持します(latest-ref パターン)。
  // 変更理由: enter 系ハンドラ(handleCellPointerEnter 等)が uiState.dragState を
  //           useCallback の依存に持つと、ドラッグ開始/終了のたびにハンドラの参照が
  //           変わり、props として受け取る GridBodyRow(memo) が全行で再レンダー
  //           されていました(クリック 1 回 = dragState が 2 回遷移 = 全行 ×2)。
  //           ハンドラは ref 経由で最新の dragState を読むことで、参照を恒久的に
  //           安定させます。render 中の代入は「最新値の読み出し専用 ref」という
  //           標準的な latest-ref 用法であり、レンダー結果には影響しません。
  const dragStateRef = useRef(uiState.dragState);
  dragStateRef.current = uiState.dragState;

  // ガター行選択ドラッグ中かどうかのフラグです(window pointerup でクリア)。
  //   注記: enableRowSelection / onGutterRowSelect(Drag) は component 側で参照安定
  //   (useCallback)なため、latest-ref を挟まず該当ハンドラの deps へ直接入れます
  //   (安定値なのでハンドラ参照は変わらず memo を保てます。render 時の ref 代入も増やしません)。
  const rowSelectionDraggingRef = useRef(false);

  // 追加(RS-AS): ガター行選択ドラッグ用の端 auto-scroll rAF ハンドルです。ガター経路は
  //   dragState を使わない ref フラグ運用(再レンダーなし)のため、既存の
  //   dragType === 'selection' ゲートの effect ループ(autoScrollFrameRef)では起動できません。
  //   pointerdown から命令的に起動し、tick 冒頭の自己停止ガード(13-B3-7 と同型)で終了します。
  const gutterAutoScrollFrameRef = useRef<number | null>(null);

  // 追加(scroll-fix): 端 auto-scroll の armed 管理です。pointerdown の座標を起点として
  //   記録し、そこから AUTO_SCROLL_ACTIVATION_DISTANCE 以上ポインタが動くまで
  //   auto-scroll を発動しません。従来は「startSelection → rAF 起動 → ポインタが端帯内」
  //   だけで発動したため、端付近のセルを押しただけ(1px も動かさない)で毎フレーム
  //   スクロールし続けていました。一度 armed になったらドラッグ終了まで維持します
  //   (途中で起点付近へ戻っても解除しません)。書き込みはイベントハンドラ/rAF 内のみです。
  const autoScrollOriginRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollArmedRef = useRef(false);

  // 追加(MS-2): handleColumnHeaderPointerDown の Shift 分岐で「最新の」ソート状態 /
  //   列配列 / 有効化フラグを読むための latest-ref 群です(dragStateRef と同じ用法)。
  // 変更理由: これらを useCallback の依存に入れると、ソートや列順が変わるたびに
  //   handleColumnHeaderPointerDown の参照が変わり、これを props に持つ memo 済み
  //   GridHeaderRow(3 ペイン)を破ってしまいます。ref 経由で読むことで、本ハンドラの
  //   依存を [dispatch, gridRootRef] のまま恒久安定に保ちます。
  const sortRef = useRef(uiState.sort);
  sortRef.current = uiState.sort;
  const orderedColumnsRef = useRef(orderedColumns);
  orderedColumnsRef.current = orderedColumns;
  const enableSortingRef = useRef(enableSorting);
  enableSortingRef.current = enableSorting;

  // 追加(11-B2): effect 依存用のプリミティブです。
  // 変更理由: window pointer effect と自動スクロール effect が uiState.dragState
  //           オブジェクトを依存に持つと、参照が変わるたびに listener 解除/再登録や
  //           rAF ループの張り直しが発生します。両 effect が実際に分岐に使うのは
  //           type のみのため、依存を文字列プリミティブへ縮小します。
  //           11-B2 で update 系 action が dragState を再生成しなくなったため
  //           ドラッグ中の参照は既に安定していますが、依存をプリミティブにする
  //           ことで「dragState の内部構造変更」と「effect の貼り直し条件」を
  //           恒久的に切り離します(start/end の 1 遷移ごとに 1 回だけ再実行)。
  const dragType = uiState.dragState?.type ?? null;

  // 変更(10-E): client 座標から rowIndex / 論理 colIndex を推定します（ペイン別）。
  // 動作:
  //   - 縦(row)は中央ペイン基準。中央ペインの矩形はスクロール量ぶん移動し、scrollTop は 0 のため、
  //     scrollTop + clientY - rect.top - headerHeight がそのまま正しいコンテンツ内 y になります。
  //   - 横(col)は clientX がどのペイン領域に入るかで判定し、各ペインのローカル x から
  //     findLogicalIndexFromPaneOffset() で論理列 index を引きます。
  //   - 返す col は orderedColumns 空間の論理 index です（UI state と一致）。
  const getCellCoordFromClientPoint = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const centerEl = bodyScrollRef.current;
      if (
        !centerEl ||
        filteredRowsLength === 0 ||
        visibleColumnsLength === 0
      ) {
        return null;
      }

      // 縦方向（中央ペイン基準）。
      const centerRect = centerEl.getBoundingClientRect();
      const y = centerEl.scrollTop + clientY - centerRect.top - headerHeight;
      // 変更(scroll-space 仮想化): y は moving rect 経由で物理スクロール量を含むため、
      //   論理行へは clientYToRowIndex(y, 実 scrollTop, scaleFactor, rowMetrics) で換算します
      //   (scaleFactor=1 のとき従来の floor(y / rowHeight) と一致)。rowMetrics.rowCount で clamp。
      const row = clientYToRowIndex(
        y,
        scrollContainerRef.current?.scrollTop ?? 0,
        verticalScaleFactor,
        rowMetrics,
      );

      // 横方向（ペイン判定）。
      let col: number | null = null;

      // 左固定ペイン: 右端より左にあれば左ペイン扱い。
      //   行ヘッダー上（localX < 0）は findLogicalIndexFromPaneOffset が先頭列へクランプします。
      const leftEl = leftPaneScrollRef.current;
      if (col === null && leftEl && paneLayout.left.entries.length > 0) {
        const leftRect = leftEl.getBoundingClientRect();
        if (clientX < leftRect.right) {
          const localX = clientX - leftRect.left - leftLeadingWidth;
          col = findLogicalIndexFromPaneOffset(paneLayout.left, localX);
        }
      }

      // 右固定ペイン: 左端以降にあれば右ペイン扱い。
      const rightEl = rightPaneScrollRef.current;
      if (col === null && rightEl && paneLayout.right.entries.length > 0) {
        const rightRect = rightEl.getBoundingClientRect();
        if (clientX >= rightRect.left) {
          const localX = clientX - rightRect.left - rightLeadingWidth;
          col = findLogicalIndexFromPaneOffset(paneLayout.right, localX);
        }
      }

      // それ以外は中央ペイン。中央ペインは横スクロールしなくなった（scrollLeft===0）ため、
      // 移動する rect.left を使うことで水平スクロール量が自動的に反映されます。
      if (col === null && paneLayout.center.entries.length > 0) {
        const localX =
          centerEl.scrollLeft + clientX - centerRect.left - centerLeadingWidth;
        col = findLogicalIndexFromPaneOffset(
          paneLayout.center,
          Math.max(localX, 0),
        );
      }

      if (col === null) {
        return null;
      }

      return {
        row,
        col: clamp(col, 0, visibleColumnsLength - 1),
      };
    },
    [
      bodyScrollRef,
      leftPaneScrollRef,
      rightPaneScrollRef,
      scrollContainerRef,
      filteredRowsLength,
      visibleColumnsLength,
      paneLayout,
      leftLeadingWidth,
      centerLeadingWidth,
      rightLeadingWidth,
      headerHeight,
      rowMetrics,
      verticalScaleFactor,
    ],
  );

  // 追加(RS-AS): ガター auto-scroll の rAF tick から最新の座標解決を読むための ref です。
  //   getCellCoordFromClientPoint は paneLayout / rowMetrics 等に依存して参照が変わるため、
  //   起動側 useCallback の deps へ直接入れると handleRowHeaderPointerDown の参照安定が
  //   崩れます(memo 破り)。render 時代入(eslint baseline 対象)を増やさないよう
  //   effect 内で同期します(レイアウト変化は commit 後に tick へ反映されれば十分です)。
  const getCellCoordFromClientPointRef = useRef(getCellCoordFromClientPoint);
  useEffect(() => {
    getCellCoordFromClientPointRef.current = getCellCoordFromClientPoint;
  }, [getCellCoordFromClientPoint]);

  // 追加: 現在の dragState に応じて selection を更新します。
  // 変更(11-A2): dragState は ref から読み、useCallback 依存から外します。
  //              これにより本関数の参照が安定し、これを依存に持つ自動スクロール
  //              effect の貼り直しも dragState 遷移時のみで済みます。
  const updateSelectionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.type !== 'selection') {
        return;
      }

      const cell = getCellCoordFromClientPoint(clientX, clientY);
      if (!cell) {
        return;
      }

      if (dragState.selectionKind === 'cell') {
        dispatch(gridActions.updateSelection(cell));
        return;
      }
      if (dragState.selectionKind === 'row') {
        dispatch(gridActions.updateRowSelection(cell.row));
        return;
      }
      if (dragState.selectionKind === 'col') {
        dispatch(gridActions.updateColumnSelection(cell.col));
      }
    },
    [dispatch, getCellCoordFromClientPoint],
  );

  // 追加: selection drag / column resize drag 中の window pointer イベントを処理します。
  // 変更(11-B2): 依存を uiState.dragState オブジェクトから dragType プリミティブへ縮小。
  //              listener の解除/再登録は type 遷移時(ドラッグ開始/終了)のみになります。
  useEffect(() => {
    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      if (dragType === 'columnResize') {
        dispatch(gridActions.updateColumnResize(event.clientX));
      }
    };

    const handleWindowPointerUp = () => {
      // 追加(行選択): ガター行選択ドラッグの終了です(ref のみ・再レンダー不要)。
      rowSelectionDraggingRef.current = false;
      dispatch(gridActions.endSelection());
      dispatch(gridActions.endColumnResize());
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [dispatch, pointerClientRef, dragType]);

  // 追加: 範囲選択中、端に近づいたら自動スクロールします。
  // 変更(10-G): スクロール対象を中央ペインから「共有スクロールコンテナ」へ。
  //             縦横ともにこのコンテナがネイティブスクロールするため、固定ペインも一緒に追従します。
  // 変更(11-B2): 依存を uiState.dragState から dragType へ縮小。rAF ループは
  //              ドラッグ開始時に 1 回だけ起動し、ドラッグ中は張り直されません。
  useEffect(() => {
    if (dragType !== 'selection') {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      return;
    }

    const tick = () => {
      const scrollElement = scrollContainerRef.current;
      const pointer = pointerClientRef.current;
      if (!scrollElement || !pointer) {
        autoScrollFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // 追加(scroll-fix): armed ガード。ドラッグ起点(pointerdown 座標)から
      //   AUTO_SCROLL_ACTIVATION_DISTANCE 以上動くまでは何もしません(「押しただけ」や
      //   クリック時の手ブレでは発動させない)。起点未記録の経路(現状は存在しない)は
      //   従来挙動維持のため即 armed 扱いです。
      if (!autoScrollArmedRef.current) {
        const origin = autoScrollOriginRef.current;
        if (
          origin &&
          !hasPointerLeftActivationRadius(
            origin,
            pointer,
            AUTO_SCROLL_ACTIVATION_DISTANCE,
          )
        ) {
          autoScrollFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        autoScrollArmedRef.current = true;
      }

      // 変更(scroll-fix): 端帯の基準を rect(ボーダー・スクロールバー込みの外形)から
      //   コンテンツ領域へ変更します。旧実装は 24px 帯を外形から測っていたため、右端帯は
      //   その大半(縦スクロールバー ≒15px + ボーダー)がスクロールバー上に乗り、実セル上の
      //   帯は 8px 程度しか残っていませんでした(下端も横スクロールバーで同様)。コンテンツ
      //   基準にすることで、ドラッグ中の端帯が意図どおり実セル上の 24px になります。
      const rect = scrollElement.getBoundingClientRect();
      const contentBox = resolveScrollContentBox({
        rectLeft: rect.left,
        rectTop: rect.top,
        clientLeft: scrollElement.clientLeft,
        clientTop: scrollElement.clientTop,
        clientWidth: scrollElement.clientWidth,
        clientHeight: scrollElement.clientHeight,
      });

      // 自動スクロールの軸ガード(症状2 と その横版):
      //   - 列選択: ポインタが sticky ヘッダー帯(上端)に留まるため、縦の自動スクロールを行わない
      //     (ヘッダー押下中に scrollTop が先頭まで連続で削られる問題を防止)。横は複数列ドラッグの追従のため維持。
      //   - 行選択: ポインタが左の行ヘッダー帯(leadingWidth)に留まるため、横の自動スクロールを行わない
      //     (行ヘッダー押下中に scrollLeft が左端まで連続で削られる問題を防止)。縦は複数行ドラッグの追従のため維持。
      //     行選択は全列が対象なので、横スクロール位置は選択範囲に無関係で、無効化しても影響しません。
      //   - セル選択: 従来どおり縦横とも自動スクロールします。
      const isColumnSelection =
        dragStateRef.current?.type === 'selection' &&
        dragStateRef.current.selectionKind === 'col';
      const isRowSelection =
        dragStateRef.current?.type === 'selection' &&
        dragStateRef.current.selectionKind === 'row';

      const verticalDirection = isColumnSelection
        ? 0
        : resolveAutoScrollAxisDirection(
            pointer.y,
            contentBox.top,
            contentBox.bottom,
            AUTO_SCROLL_EDGE_THRESHOLD,
          );
      const horizontalDirection = isRowSelection
        ? 0
        : resolveAutoScrollAxisDirection(
            pointer.x,
            contentBox.left,
            contentBox.right,
            AUTO_SCROLL_EDGE_THRESHOLD,
          );

      // 変更(scroll-fix): 次位置は [0, max] へ clamp します。従来は正方向の上限が無く、
      //   スクロール端到達後も「next !== current」が真のまま毎フレーム scrollTo + 選択更新
      //   dispatch が走り続けていました(clamp により端到達後は完全に停止します)。
      const nextScrollTop = computeNextScrollPosition(
        scrollElement.scrollTop,
        verticalDirection,
        AUTO_SCROLL_STEP,
        scrollElement.scrollHeight - scrollElement.clientHeight,
      );
      const nextScrollLeft = computeNextScrollPosition(
        scrollElement.scrollLeft,
        horizontalDirection,
        AUTO_SCROLL_STEP,
        scrollElement.scrollWidth - scrollElement.clientWidth,
      );

      if (
        nextScrollTop !== scrollElement.scrollTop ||
        nextScrollLeft !== scrollElement.scrollLeft
      ) {
        scrollElement.scrollTo({
          top: nextScrollTop,
          left: nextScrollLeft,
          behavior: 'auto',
        });
        updateSelectionFromPointer(pointer.x, pointer.y);
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [
    autoScrollFrameRef,
    scrollContainerRef,
    pointerClientRef,
    dragType,
    updateSelectionFromPointer,
  ]);

  // 追加: セルクリック/ドラッグ開始時の処理です。
  // 注記(10-E): cell はペイン内の各セルから entry.logicalIndex がそのまま渡るため、
  //             ここはペイン非依存で正しく動作します（pinned 対応済み）。
  const handleCellPointerDown = useCallback(
    (cell: CellCoord, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      gridRootRef.current?.focus();
      // 追加(scroll-fix): 押下座標で pointer/armed 状態を初期化します。pointerClientRef は
      //   従来 move/enter 系でしか更新されず、押下直後の auto-scroll tick が古い座標を読む
      //   余地がありました。origin は armed ガードの起点です(pointerClientRef は安定参照の
      //   ref のため、deps へ加えてもハンドラ参照は変わらず memo を保てます)。
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      autoScrollOriginRef.current = { x: event.clientX, y: event.clientY };
      autoScrollArmedRef.current = false;
      dispatch(gridActions.activateCell(cell));
      if (enableRangeSelection) {
        dispatch(gridActions.startSelection(cell));
      }
    },
    [dispatch, enableRangeSelection, gridRootRef, pointerClientRef],
  );

  // 追加: selection drag 中にセルへ入ったら範囲更新します。
  // 変更(11-A2): dragState を ref から読み、依存から外して参照を恒久安定化します。
  //              本ハンドラは GridBodyRow(memo) の props のため、参照の安定が
  //              そのまま「全行再レンダーの回避」に直結します。
  const handleCellPointerEnter = useCallback(
    (cell: CellCoord, event: PointerEvent<HTMLDivElement>) => {
      // 追加(UI hover): セルに入ったら行ホバーを設定します(enableRowHover 時のみ / 選択ドラッグの
      //   有無に関わらず)。同一行内のセル移動では同値設定となり React が再描画を省くため、再描画は
      //   行をまたいだときの該当 2 行のみで済みます。
      if (enableRowHover) {
        setHoveredRowIndex(cell.row);
      }
      if (!enableRangeSelection) {
        return;
      }
      const dragState = dragStateRef.current;
      if (
        dragState?.type !== 'selection' ||
        dragState.selectionKind !== 'cell'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateSelection(cell));
    },
    [
      dispatch,
      enableRangeSelection,
      pointerClientRef,
      setHoveredRowIndex,
      enableRowHover,
    ],
  );

  // 追加: ブラウザ標準の drag ghost を抑止します。
  const handleNativeDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  // 追加(RS-AS): ガター行選択ドラッグの端 auto-scroll ループを起動します(縦のみ)。
  //   背景: 既存の auto-scroll は dragType === 'selection' ゲートの effect で起動しますが、
  //   ガター行選択(enableRowSelection)は dragState を使わない ref フラグ経路のため対象外で、
  //   端まで引っ張ってもスクロールしませんでした(ハンドオフ §8-④)。本ループの構造:
  //     - 自己停止ガード: rowSelectionDraggingRef が false になった次フレームで終了します
  //       (window pointerup がフラグを落とす。13-B3-7 の構造ガードと同型で、ゾンビ化しません)。
  //     - armed ガード / コンテンツ領域基準 / [0, max] clamp は autoScrollGeometry の
  //       既存純関数を流用します(scroll-fix と同一挙動)。
  //     - 行選択に横スクロール位置は無関係なため、横は動かしません(既存 rAF ループの
  //       isRowSelection 軸ガードと同理由)。
  //     - スクロール後はポインタ直下の行を解決して onGutterRowSelectDrag へ渡します。
  //       スクロールで要素がポインタ下を流れても pointerenter は発火しないため、
  //       ここで更新しないと選択端がスクロールに追従しません(既存ループの
  //       updateSelectionFromPointer と同役割)。
  //   deps はすべて安定参照(props の ref / 参照安定 callback)のため本 callback も恒久安定で、
  //   handleRowHeaderPointerDown の deps に入れても memo を破りません。
  const startGutterRowSelectionAutoScroll = useCallback(() => {
    // 二重起動防止(既にループ中なら何もしません)。
    if (gutterAutoScrollFrameRef.current !== null) {
      return;
    }
    const tick = () => {
      // 自己停止ガード: ドラッグ終了後の最初のフレームでループを畳みます。
      if (!rowSelectionDraggingRef.current) {
        gutterAutoScrollFrameRef.current = null;
        return;
      }
      const scrollElement = scrollContainerRef.current;
      const pointer = pointerClientRef.current;
      if (!scrollElement || !pointer) {
        gutterAutoScrollFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      // armed ガード(scroll-fix): 押下起点から規定距離動くまで発動しません。
      if (!autoScrollArmedRef.current) {
        const origin = autoScrollOriginRef.current;
        if (
          origin &&
          !hasPointerLeftActivationRadius(
            origin,
            pointer,
            AUTO_SCROLL_ACTIVATION_DISTANCE,
          )
        ) {
          gutterAutoScrollFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        autoScrollArmedRef.current = true;
      }
      const rect = scrollElement.getBoundingClientRect();
      const contentBox = resolveScrollContentBox({
        rectLeft: rect.left,
        rectTop: rect.top,
        clientLeft: scrollElement.clientLeft,
        clientTop: scrollElement.clientTop,
        clientWidth: scrollElement.clientWidth,
        clientHeight: scrollElement.clientHeight,
      });
      const verticalDirection = resolveAutoScrollAxisDirection(
        pointer.y,
        contentBox.top,
        contentBox.bottom,
        AUTO_SCROLL_EDGE_THRESHOLD,
      );
      const nextScrollTop = computeNextScrollPosition(
        scrollElement.scrollTop,
        verticalDirection,
        AUTO_SCROLL_STEP,
        scrollElement.scrollHeight - scrollElement.clientHeight,
      );
      if (nextScrollTop !== scrollElement.scrollTop) {
        scrollElement.scrollTo({
          top: nextScrollTop,
          left: scrollElement.scrollLeft,
          behavior: 'auto',
        });
        // スクロール後のポインタ直下の行で選択範囲を更新します(latest-ref 経由)。
        const cell = getCellCoordFromClientPointRef.current(
          pointer.x,
          pointer.y,
        );
        if (cell) {
          onGutterRowSelectDrag(cell.row);
        }
      }
      gutterAutoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    gutterAutoScrollFrameRef.current = requestAnimationFrame(tick);
  }, [scrollContainerRef, pointerClientRef, onGutterRowSelectDrag]);

  // 追加(RS-AS): ドラッグ中に本フックごと unmount された場合の rAF 取りこぼし防止です
  //   (通常経路は tick 冒頭の自己停止ガードで終了するため、これは保険です)。
  useEffect(
    () => () => {
      if (gutterAutoScrollFrameRef.current !== null) {
        cancelAnimationFrame(gutterAutoScrollFrameRef.current);
        gutterAutoScrollFrameRef.current = null;
      }
    },
    [],
  );

  // 追加: 行ヘッダー選択開始です。
  const handleRowHeaderPointerDown = useCallback(
    (rowIndex: number, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      gridRootRef.current?.focus();
      // 追加(scroll-fix): 押下座標で pointer/armed 状態を初期化します(セル押下と同方針)。
      // 変更(RS-AS): ガター行選択(enableRowSelection)経路も専用ループ(下の分岐内で起動)の
      //   auto-scroll 対象になったため、この初期化(起点 / armed)は両経路の共有になりました。
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      autoScrollOriginRef.current = { x: event.clientX, y: event.clientY };
      autoScrollArmedRef.current = false;
      // 追加(行選択): enableRowSelection 時はガター起点セル範囲選択に代えて行選択を行います。
      if (enableRowSelection) {
        rowSelectionDraggingRef.current = true;
        onGutterRowSelect(rowIndex, { shiftKey: event.shiftKey });
        // 追加(RS-AS): 端 auto-scroll ループを起動します(終了は window pointerup が
        //   rowSelectionDraggingRef を落とした次フレームの自己停止ガードです)。
        startGutterRowSelectionAutoScroll();
        return;
      }
      dispatch(gridActions.startRowSelection(rowIndex));
    },
    [
      dispatch,
      gridRootRef,
      enableRowSelection,
      onGutterRowSelect,
      startGutterRowSelectionAutoScroll,
      pointerClientRef,
    ],
  );

  // 追加: 行ヘッダードラッグ中の更新です。
  // 変更(11-A2): dragState を ref から読み、依存から外します(理由は上と同じ)。
  const handleRowHeaderPointerEnter = useCallback(
    (rowIndex: number, event: PointerEvent<HTMLDivElement>) => {
      // 追加(UI hover): 行ヘッダー(#セル)に入っても行ホバーを設定します(enableRowHover 時のみ)。
      if (enableRowHover) {
        setHoveredRowIndex(rowIndex);
      }
      // 追加(行選択): ガター行選択ドラッグ中なら範囲を更新します(既存のセル範囲選択とは排他)。
      if (rowSelectionDraggingRef.current) {
        pointerClientRef.current = { x: event.clientX, y: event.clientY };
        onGutterRowSelectDrag(rowIndex);
        return;
      }
      const dragState = dragStateRef.current;
      if (
        dragState?.type !== 'selection' ||
        dragState.selectionKind !== 'row'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateRowSelection(rowIndex));
    },
    [
      dispatch,
      pointerClientRef,
      setHoveredRowIndex,
      enableRowHover,
      onGutterRowSelectDrag,
    ],
  );

  // 追加: 列ヘッダー選択開始です。
  // 変更(MS-2): Shift+click(発火口 a)をソートのトグルへ分岐させます。
  //   plain クリックは従来どおり列範囲選択を開始し、Shift とは排他なので衝突しません
  //   (旧実装も shiftKey を参照していなかったため、列の Shift 範囲拡張という既存挙動は
  //    奪いません)。サイクルは none → asc → desc → none。direction の決め方は
  //     未登録(undefined) → 'asc'(末尾に追加)
  //     'asc'            → 'desc'(同位置で方向更新)
  //     'desc'           → 'desc'(nextSortEntries の「同方向トグル」で当該列のみ除去)
  //   ⇒ existingDir ? 'desc' : 'asc' の 1 行に畳めます。最新値はすべて ref 経由で読み、
  //   本ハンドラの依存は [dispatch, gridRootRef, pointerClientRef](すべて安定参照)で、
  //   参照恒久安定 = memo 維持です。
  const handleColumnHeaderPointerDown = useCallback(
    (colIndex: number, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      gridRootRef.current?.focus();
      // 追加(scroll-fix): 押下座標で pointer/armed 状態を初期化します(セル押下と同方針)。
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      autoScrollOriginRef.current = { x: event.clientX, y: event.clientY };
      autoScrollArmedRef.current = false;

      if (event.shiftKey && enableSortingRef.current) {
        const column = orderedColumnsRef.current[colIndex];
        if (column) {
          const current = sortRef.current;
          const existingDir = current.find(
            (entry) => entry.columnKey === column.key,
          )?.direction;
          const direction: 'asc' | 'desc' = existingDir ? 'desc' : 'asc';
          const next = nextSortEntries(current, column.key, direction, true);
          dispatch(
            next.length === 0
              ? gridActions.clearSort()
              : gridActions.setSort(next),
          );
        }
        // Shift+click では列範囲選択を開始しません(ソートと排他)。
        return;
      }

      dispatch(gridActions.startColumnSelection(colIndex));
    },
    [dispatch, gridRootRef, pointerClientRef],
  );

  // 追加: 列ヘッダードラッグ中の更新です。
  // 変更(11-A2): dragState を ref から読み、依存から外します(理由は上と同じ)。
  const handleColumnHeaderPointerEnter = useCallback(
    (colIndex: number, event: PointerEvent<HTMLDivElement>) => {
      // 追加(UI hover): 列ヘッダーへ入ったら行ホバーをクリアします(本体→ヘッダー移動時に直前の
      //   行ハイライトが残らないように)。enableColumnHeaderHover 時は列ヘッダーホバーを設定します
      //   (クリアは列ヘッダー leave 側=handleColumnHeaderPointerLeaveStable が担います)。
      setHoveredRowIndex(null);
      if (enableColumnHeaderHover) {
        setHoveredColumnIndex(colIndex);
      }
      const dragState = dragStateRef.current;
      if (
        dragState?.type !== 'selection' ||
        dragState.selectionKind !== 'col'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateColumnSelection(colIndex));
    },
    [
      dispatch,
      pointerClientRef,
      setHoveredRowIndex,
      setHoveredColumnIndex,
      enableColumnHeaderHover,
    ],
  );

  return {
    updateSelectionFromPointer,
    handleCellPointerDown,
    handleCellPointerEnter,
    handleNativeDragStart,
    handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter,
  };
};

export default useGridPointerInteractions;