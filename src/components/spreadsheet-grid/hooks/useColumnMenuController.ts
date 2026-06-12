import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { GridColumn } from '../model/gridTypes';

// 追加(13-A): 列メニュー popover の内部状態です。
//             どの列のメニューを開いているかだけを持ちます。
type ColumnMenuState = {
  columnKey: string;
};

// 追加(13-A): body 直下 portal popover の配置情報です(position: fixed 座標)。
export type ColumnMenuLayout = {
  top: number;
  left: number;
  width: number;
};

type UseColumnMenuControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  enableColumnMenu: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
};

const MENU_WIDTH = 200;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 6;
// 追加(13-A): 上下フリップ判定用の見積もり高さです
//             (タイトル + セクション見出し + 3 項目 + padding)。
const ESTIMATED_MENU_HEIGHT = 190;

// 追加(13-A): 列メニュー(「⋮」ボタン / ヘッダー右クリック)の
//             state / anchor / layout / outside click / Escape をまとめて管理します。
// 設計メモ: useFilterPopoverController と同型ですが、anchor が
//   - 'button' モード: 「⋮」ボタン要素(getBoundingClientRect で追従配置)
//   - 'point'  モード: 右クリック時のポインタ座標(固定配置)
//   の 2 種類ある点が異なります。button モードは scroll/resize で再配置し、
//   point モードは scroll 中に座標とヘッダーがズレるため scroll で閉じます
//   (AG Grid のコンテキストメニューと同じ振る舞いです)。
export const useColumnMenuController = <T,>({
  visibleColumns,
  enableColumnMenu,
  gridRootRef,
}: UseColumnMenuControllerArgs<T>) => {
  const [columnMenuState, setColumnMenuState] =
    useState<ColumnMenuState | null>(null);
  const [columnMenuLayout, setColumnMenuLayout] =
    useState<ColumnMenuLayout | null>(null);

  // 追加(13-A): popover 本体 / anchor(ボタン or 座標)の ref 群です。
  //             anchor は「どちらか一方だけ」が non-null になります。
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const menuAnchorButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuAnchorPointRef = useRef<{ x: number; y: number } | null>(null);

  // 追加(13-A): 開閉トグル判定用の latest-ref です。
  // 注記: setState の updater 内で anchor ref を書き換えると StrictMode の
  //       updater 二重実行で開閉が反転するため、判定・ref 更新はハンドラ本体
  //       (1 回だけ実行される側)で行います。
  const columnMenuStateRef = useRef(columnMenuState);
  columnMenuStateRef.current = columnMenuState;

  const isColumnMenuOpen = columnMenuState !== null;
  const openedMenuColumnKey = columnMenuState?.columnKey ?? null;

  const openedMenuColumn = useMemo(
    () =>
      openedMenuColumnKey
        ? visibleColumns.find(
            (column) => column.key === openedMenuColumnKey,
          ) ?? null
        : null,
    [openedMenuColumnKey, visibleColumns],
  );

  // 追加(13-A): anchor(ボタン矩形 or 右クリック座標)から fixed 座標を計算します。
  const updateColumnMenuLayout = useCallback(() => {
    if (!openedMenuColumnKey) {
      setColumnMenuLayout(null);
      return;
    }

    let top: number;
    let left: number;
    let flipTop: number;

    const anchorButton = menuAnchorButtonRef.current;
    const anchorPoint = menuAnchorPointRef.current;

    if (anchorButton) {
      // 追加(13-A): 横スクロールで列が仮想化範囲外になると anchor ボタンが unmount され、
      //             getBoundingClientRect が 0 を返して左上へ飛ぶため、その場合は閉じます。
      if (!anchorButton.isConnected) {
        setColumnMenuLayout(null);
        setColumnMenuState(null);
        menuAnchorButtonRef.current = null;
        return;
      }
      const anchorRect = anchorButton.getBoundingClientRect();
      left = anchorRect.right - MENU_WIDTH;
      top = anchorRect.bottom + OFFSET_Y;
      flipTop = anchorRect.top - ESTIMATED_MENU_HEIGHT - OFFSET_Y;
    } else if (anchorPoint) {
      // 追加(13-A): 右クリック位置の右下へ出します(ブラウザ標準メニューと同じ向き)。
      left = anchorPoint.x;
      top = anchorPoint.y;
      flipTop = anchorPoint.y - ESTIMATED_MENU_HEIGHT;
    } else {
      setColumnMenuLayout(null);
      return;
    }

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);

    if (top + ESTIMATED_MENU_HEIGHT > window.innerHeight - VIEWPORT_MARGIN) {
      top = flipTop;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    setColumnMenuLayout((current) => {
      if (
        current &&
        current.top === top &&
        current.left === left &&
        current.width === MENU_WIDTH
      ) {
        return current;
      }
      return { top, left, width: MENU_WIDTH };
    });
  }, [openedMenuColumnKey]);

  // 追加(13-A): メニューを閉じます(filter popover の close と同じ作法です)。
  const closeColumnMenu = useCallback(() => {
    setColumnMenuState(null);
    setColumnMenuLayout(null);
    menuAnchorButtonRef.current = null;
    menuAnchorPointRef.current = null;

    // 追加: close 後は grid root にフォーカスを戻し、keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // 追加(13-A): 「⋮」ボタンからメニューを開きます(同じボタン再押下でトグル close)。
  // 注記: anchor ref の更新は setState より「前」に行います。outside click 用の
  //       window pointerdown リスナーは React ハンドラの後(window バブル到達時)に
  //       走るため、別列のボタンを押した場合でも「新 anchor contains target」で
  //       閉じ漏れ/誤閉じが起きません(useFilterPopoverController と同じ仕組みです)。
  const openColumnMenuFromButton = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!enableColumnMenu || event.button !== 0) {
        return;
      }

      const anchorElement = event.currentTarget;

      // 追加: 同じボタンの再押下はトグルで閉じます。
      const current = columnMenuStateRef.current;
      if (
        current?.columnKey === column.key &&
        menuAnchorButtonRef.current === anchorElement
      ) {
        closeColumnMenu();
        return;
      }

      // 追加: grid root に残っているフォーカスを明示的に外します。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      gridRootRef.current?.blur();

      menuAnchorButtonRef.current = anchorElement;
      menuAnchorPointRef.current = null;
      setColumnMenuState({ columnKey: column.key });
    },
    [closeColumnMenu, enableColumnMenu, gridRootRef],
  );

  // 追加(13-A): 列ヘッダー右クリック(contextmenu)からメニューを開きます。
  // 注記: enableColumnMenu=false のときは preventDefault しないため、
  //       ブラウザ標準のコンテキストメニューがそのまま出ます。
  const openColumnMenuFromContextMenu = useCallback(
    (column: GridColumn<T>, event: MouseEvent<HTMLDivElement>) => {
      if (!enableColumnMenu) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      gridRootRef.current?.blur();

      menuAnchorButtonRef.current = null;
      menuAnchorPointRef.current = { x: event.clientX, y: event.clientY };
      setColumnMenuState({ columnKey: column.key });

      // 追加: 同一列で「開いたまま別位置を右クリック」した場合も座標を追従させます。
      //       state が同値(同一 columnKey)だと effect が走らないため、ここで直接
      //       再計算します(初回 open 時は下の effect 側でも計算され、冪等です)。
      updateColumnMenuLayout();
    },
    [enableColumnMenu, gridRootRef, updateColumnMenuLayout],
  );

  // 追加(13-A): open 時の初期配置 + resize / scroll への追従です。
  //             button anchor は再配置、point anchor は scroll で閉じます。
  useEffect(() => {
    if (!openedMenuColumnKey) {
      return;
    }

    updateColumnMenuLayout();

    const handleResize = () => {
      updateColumnMenuLayout();
    };

    const handleScroll = () => {
      if (menuAnchorPointRef.current) {
        // 追加: 座標 anchor はスクロールでヘッダーとズレるため閉じます。
        closeColumnMenu();
        return;
      }
      updateColumnMenuLayout();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openedMenuColumnKey, updateColumnMenuLayout, closeColumnMenu]);

  // 追加(13-A): 表示中は outside click で閉じます(filter popover と同じ作法です)。
  useEffect(() => {
    if (!isColumnMenuOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }

      if (columnMenuRef.current?.contains(targetNode)) {
        return;
      }

      // 追加: anchor ボタン押下はボタン側のトグル処理に委ねます。
      if (menuAnchorButtonRef.current?.contains(targetNode)) {
        return;
      }

      closeColumnMenu();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [closeColumnMenu, isColumnMenuOpen]);

  // 追加(13-A): 表示中は Escape で閉じます。
  //             メニューには入力要素が無く popover 内にフォーカスが入らないため、
  //             popover 側の onKeyDown ではなく window で拾います。
  useEffect(() => {
    if (!isColumnMenuOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeColumnMenu();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [closeColumnMenu, isColumnMenuOpen]);

  return {
    columnMenuLayout,
    columnMenuRef,
    isColumnMenuOpen,
    openedMenuColumnKey,
    openedMenuColumn,
    openColumnMenuFromButton,
    openColumnMenuFromContextMenu,
    closeColumnMenu,
  };
};

export default useColumnMenuController;
