import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// 追加(13-B2-1): 列の表示/非表示パネル(AG Grid の Columns Tool Panel 相当)の
//                 open / close / layout / outside click / Escape を管理するコントローラです。
// 設計メモ:
//   - useColumnMenuController と同型ですが、以下が異なります。
//     ① per-column ではなくグローバル(全列を一覧するパネルなので開いている列は持たない)。
//     ② anchor は「列の `⋮` ボタン」ではなく gridRoot 矩形の右上に固定。列メニューの
//        項目「列の表示」から開くため、開いた時点でメニュー(と anchor)は閉じています。
//        gridRoot 基準にすることで anchor ボタンの unmount(横スクロール仮想化)に依存せず、
//        グリッド内部スクロールではパネルが動かず、window scroll/resize でのみ再配置されます。
//   - パネルには検索入力(フォーカス可能要素)があるため、列メニューと違い Escape は
//     入力にフォーカスがあっても効くよう window で拾います(列メニューと同じ作法)。

// 追加(13-B2-1): body 直下 portal パネルの配置情報です(position: fixed 座標)。
export type ColumnChooserLayout = {
  top: number;
  left: number;
  width: number;
};

type UseColumnChooserControllerArgs = {
  enableColumnMenu: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
};

const PANEL_WIDTH = 280;
const VIEWPORT_MARGIN = 8;
// 追加(13-B2-1): gridRoot の右上から内側へのオフセットです(パネルがヘッダーに被る位置)。
const GRID_INSET = 12;

export const useColumnChooserController = ({
  enableColumnMenu,
  gridRootRef,
}: UseColumnChooserControllerArgs) => {
  const [isColumnChooserOpen, setIsColumnChooserOpen] = useState(false);
  const [columnChooserLayout, setColumnChooserLayout] =
    useState<ColumnChooserLayout | null>(null);

  // 追加(13-B2-1): パネル本体の ref です(outside click 判定に使います)。
  const columnChooserRef = useRef<HTMLDivElement | null>(null);

  // 追加(13-B2-1): gridRoot 矩形の右上を基準に fixed 座標を計算します。
  const updateColumnChooserLayout = useCallback(() => {
    const root = gridRootRef.current;
    if (!root) {
      setColumnChooserLayout(null);
      return;
    }

    const rect = root.getBoundingClientRect();
    let left = rect.right - PANEL_WIDTH - GRID_INSET;
    let top = rect.top + GRID_INSET;

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
    top = Math.max(VIEWPORT_MARGIN, top);

    setColumnChooserLayout((current) => {
      if (
        current &&
        current.top === top &&
        current.left === left &&
        current.width === PANEL_WIDTH
      ) {
        return current;
      }
      return { top, left, width: PANEL_WIDTH };
    });
  }, [gridRootRef]);

  const openColumnChooser = useCallback(() => {
    if (!enableColumnMenu) {
      return;
    }
    // 追加: grid root に残っているフォーカスを外します(列メニューと同じ作法)。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    gridRootRef.current?.blur();
    setIsColumnChooserOpen(true);
  }, [enableColumnMenu, gridRootRef]);

  const closeColumnChooser = useCallback(() => {
    setIsColumnChooserOpen(false);
    setColumnChooserLayout(null);
    // 追加: close 後は grid root にフォーカスを戻し、keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // 追加(13-B2-1): open 時の初期配置 + resize / window scroll への追従です。
  //               gridRoot 基準のため、グリッド内部スクロールでは動かしません
  //               (capture: true の scroll は内部スクロールでも発火しますが、
  //                gridRoot 矩形は内部スクロールで変わらないため layout は不変です)。
  useEffect(() => {
    if (!isColumnChooserOpen) {
      return;
    }

    updateColumnChooserLayout();

    const handle = () => {
      updateColumnChooserLayout();
    };

    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);

    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isColumnChooserOpen, updateColumnChooserLayout]);

  // 追加(13-B2-1): 表示中は outside click で閉じます(列メニューと同じ作法)。
  useEffect(() => {
    if (!isColumnChooserOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (columnChooserRef.current?.contains(targetNode)) {
        return;
      }
      closeColumnChooser();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [closeColumnChooser, isColumnChooserOpen]);

  // 追加(13-B2-1): 表示中は Escape で閉じます(検索入力にフォーカスがあっても効くよう
  //               window で拾います)。
  useEffect(() => {
    if (!isColumnChooserOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeColumnChooser();
      }
    };

    // 変更(POP-KEY): capture 登録(第 3 引数 true)へ変更します。
    // 変更理由: パネル root の keydown 遮断(bubble 相 stopPropagation)や内部要素の
    //   stopPropagation はネイティブ伝播を止めるため、bubble 登録の window リスナーには
    //   フォーカスがパネル内にあるとき Escape が届きませんでした。capture は window で
    //   最初に走るため、フォーカス位置に依存せず確実に close を受けられます
    //   (add / remove の capture 指定は一致必須です)。
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true);
    };
  }, [closeColumnChooser, isColumnChooserOpen]);

  return {
    isColumnChooserOpen,
    columnChooserLayout,
    columnChooserRef,
    openColumnChooser,
    closeColumnChooser,
  };
};

export default useColumnChooserController;