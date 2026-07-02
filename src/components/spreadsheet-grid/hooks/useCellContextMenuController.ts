import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {
  GridContextMenuItem,
  GridContextMenuParams,
} from '../model/gridTypes';

// 追加(バッチ②/コンテキストメニュー): body 直下 portal popover の配置情報(position: fixed)です。
export type CellContextMenuLayout = {
  top: number;
  left: number;
  width: number;
};

// 追加(バッチ②): 開いているメニューの内部状態です。params(対象/座標)と items(表示項目)を保持します。
//   items は open 時に getContextMenuItems から得た確定スナップショットで、開いている間は再評価しません。
type CellContextMenuState<T> = {
  params: GridContextMenuParams<T>;
  items: GridContextMenuItem[];
};

type UseCellContextMenuControllerArgs = {
  gridRootRef: RefObject<HTMLDivElement | null>;
};

const MENU_WIDTH = 220;
const VIEWPORT_MARGIN = 8;
// フリップ判定用の 1 項目あたり見積り高さ(action/custom 概算)+ パネル padding。
//   items が可変のため列メニューのような固定見積りではなく、件数から高さを見積もります。
const ESTIMATED_ITEM_HEIGHT = 34;
const PANEL_VPAD = 16;

// 追加(バッチ②): ボディのセル/行に対する汎用コンテキストメニュー(完全カスタム)の
//   state / anchor / layout / outside click / Escape / scroll close をまとめて管理します。
// 設計メモ: useColumnMenuController の「point-anchor(右クリック座標)モード」だけを写経しています。
//   - 配置は常に右クリック座標基準の fixed。ボタン anchor は持ちません。
//   - スクロールすると座標とセルがズレるため close します(列メニュー point モードと同じ振る舞い)。
//   - 対象解決(DOM 逆引き)と params 構築、getContextMenuItems 呼び出しは SpreadsheetGrid 側が行い、
//     ここへは確定した params と items を openContextMenu で渡します(controller は T の行モデルに非依存)。
export const useCellContextMenuController = <T,>({
  gridRootRef,
}: UseCellContextMenuControllerArgs) => {
  const [contextMenuState, setContextMenuState] =
    useState<CellContextMenuState<T> | null>(null);
  const [contextMenuLayout, setContextMenuLayout] =
    useState<CellContextMenuLayout | null>(null);

  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  // 右クリック座標(fixed 配置の anchor)です。
  const anchorPointRef = useRef<{ x: number; y: number } | null>(null);
  // フリップ用に開いている項目数を保持します(layout 再計算時の高さ見積り)。
  const itemCountRef = useRef(0);

  const isContextMenuOpen = contextMenuState !== null;

  // 追加(バッチ②): 右クリック座標から fixed 座標を計算します(viewport はみ出しでクランプ / 上フリップ)。
  const updateContextMenuLayout = useCallback(() => {
    const anchor = anchorPointRef.current;
    if (!anchor) {
      setContextMenuLayout(null);
      return;
    }
    const estimatedHeight =
      itemCountRef.current * ESTIMATED_ITEM_HEIGHT + PANEL_VPAD;

    let left = anchor.x;
    let top = anchor.y;
    const flipTop = anchor.y - estimatedHeight;

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);

    if (top + estimatedHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = flipTop;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    setContextMenuLayout((current) => {
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
  }, []);

  // 追加(バッチ②): メニューを閉じ、grid root にフォーカスを戻します(列メニューの close と同じ作法)。
  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
    setContextMenuLayout(null);
    anchorPointRef.current = null;
    itemCountRef.current = 0;
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // 追加(バッチ②): 確定 params + items でメニューを開きます(座標は params.clientX/Y)。
  const openContextMenu = useCallback(
    (params: GridContextMenuParams<T>, items: GridContextMenuItem[]) => {
      // grid root に残っているフォーカスを明示的に外します。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      gridRootRef.current?.blur();

      anchorPointRef.current = { x: params.clientX, y: params.clientY };
      itemCountRef.current = items.length;
      setContextMenuState({ params, items });
      // state が同値(同一 params 参照)でも effect が走らないケースに備え、ここでも直接再計算します(冪等)。
      updateContextMenuLayout();
    },
    [gridRootRef, updateContextMenuLayout],
  );

  // 追加(バッチ②): open 時の初期配置 + resize 追従。スクロールは座標がズレるため close します。
  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }

    updateContextMenuLayout();

    const handleResize = () => {
      updateContextMenuLayout();
    };
    const handleScroll = () => {
      closeContextMenu();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isContextMenuOpen, updateContextMenuLayout, closeContextMenu]);

  // 追加(バッチ②): 表示中は outside click で閉じます(列メニューと同じ作法)。
  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (contextMenuRef.current?.contains(targetNode)) {
        return;
      }
      closeContextMenu();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [isContextMenuOpen, closeContextMenu]);

  // 追加(バッチ②): 表示中は Escape で閉じます(メニュー内に入力要素が無いため window で拾います)。
  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isContextMenuOpen, closeContextMenu]);

  return {
    contextMenuState,
    contextMenuLayout,
    contextMenuRef,
    isContextMenuOpen,
    openContextMenu,
    closeContextMenu,
  };
};

export default useCellContextMenuController;