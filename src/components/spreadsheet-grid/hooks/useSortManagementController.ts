import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// 追加(FM-4): ドラッグ位置のビューポート clamp(3 パネル共有の純ロジック)です。
import { clampPanelDragPosition } from '../logic/panelDragGeometry';

// 追加(MS-3-1 / 並び替え管理パネル): 並び替え管理パネル(SortManagementPanel)の
//                 open / close / layout / outside click / Escape を管理するコントローラです。
// 設計メモ:
//   - useColumnChooserController と同型です(「同型だが別物」を許容する本コードベースの
//     作法に倣い、共通化はせずコピー流用します。将来の共通化余地はこの注記で残します)。
//   - anchor は gridRoot 矩形の右上に固定します。並び替え管理パネルは列メニューの項目
//     「並び替えを管理…」から開くため、開いた時点でメニュー(と anchor ボタン)は閉じています。
//     gridRoot 基準にすることで anchor ボタンの unmount(横スクロール仮想化)に依存せず、
//     グリッド内部スクロールではパネルが動かず、window scroll/resize でのみ再配置されます。
//   - パネルには <select> 等のフォーカス可能要素があるため、Escape は入力にフォーカスが
//     あっても効くよう window で拾います(列メニュー / 列の表示パネルと同じ作法)。

// 追加(MS-3-1): body 直下 portal パネルの配置情報です(position: fixed 座標)。
export type SortManagementLayout = {
  top: number;
  left: number;
  width: number;
};

type UseSortManagementControllerArgs = {
  // 注記: 並び替え管理は enableSorting に紐づきます(開く導線は enableSorting=true の
  //       ときだけ出る列メニュー項目です)。保険として open 側でも本フラグでガードします。
  enableSorting: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
};

// 注記: ソートレベル行は「優先度 + 列セレクト + 方向 + 削除」を 1 行に収めるため、
//       列の表示パネル(280)より少し広めにします。
const PANEL_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
// 追加(MS-3-1): gridRoot の右上から内側へのオフセットです(パネルがヘッダーに被る位置)。
const GRID_INSET = 12;

export const useSortManagementController = ({
  enableSorting,
  gridRootRef,
}: UseSortManagementControllerArgs) => {
  const [isSortManagerOpen, setIsSortManagerOpen] = useState(false);
  const [sortManagerLayout, setSortManagerLayout] =
    useState<SortManagementLayout | null>(null);

  // 追加(MS-3-1): パネル本体の ref です(outside click 判定に使います)。
  const sortManagerRef = useRef<HTMLDivElement | null>(null);

  // 追加(FM-4): ヘッダードラッグで移動した位置です(null = 既定の gridRoot 追従)。
  //   close で null へ戻します(再オープンは既定位置)。ref なのは pointermove の高頻度
  //   更新で layout state と二重の再レンダーを起こさないためです(layout が表示の真実)。
  const draggedPositionRef = useRef<{ top: number; left: number } | null>(null);

  // 追加(MS-3-1): gridRoot 矩形の右上を基準に fixed 座標を計算します。
  const updateSortManagerLayout = useCallback(() => {
    // 追加(FM-4): ドラッグ済みなら gridRoot 追従をやめ、ビューポートへの clamp だけを行います
    //   (resize での再 clamp 用。window scroll で gridRoot が動いてもパネルは動かない =
    //    フローティングダイアログ挙動)。
    const dragged = draggedPositionRef.current;
    if (dragged) {
      const clamped = clampPanelDragPosition({
        top: dragged.top,
        left: dragged.left,
        panelWidth: PANEL_WIDTH,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setSortManagerLayout((current) => {
        if (
          current &&
          current.top === clamped.top &&
          current.left === clamped.left &&
          current.width === PANEL_WIDTH
        ) {
          return current;
        }
        return { top: clamped.top, left: clamped.left, width: PANEL_WIDTH };
      });
      return;
    }
    const root = gridRootRef.current;
    if (!root) {
      setSortManagerLayout(null);
      return;
    }

    const rect = root.getBoundingClientRect();
    let left = rect.right - PANEL_WIDTH - GRID_INSET;
    let top = rect.top + GRID_INSET;

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
    top = Math.max(VIEWPORT_MARGIN, top);

    setSortManagerLayout((current) => {
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

  const openSortManager = useCallback(() => {
    if (!enableSorting) {
      return;
    }
    // 追加: grid root に残っているフォーカスを外します(列メニューと同じ作法)。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    gridRootRef.current?.blur();
    setIsSortManagerOpen(true);
  }, [enableSorting, gridRootRef]);

  const closeSortManager = useCallback(() => {
    // 追加(FM-4): ドラッグ位置を破棄します(再オープンは既定の gridRoot アンカー位置)。
    draggedPositionRef.current = null;
    setIsSortManagerOpen(false);
    setSortManagerLayout(null);
    // 追加: close 後は grid root にフォーカスを戻し、keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // 追加(FM-4): ヘッダードラッグからの移動です(view の usePanelHeaderDrag が pointermove
  //   ごとに呼びます)。位置は clamp して layout へ即時反映し、以後 updateSortManagerLayout は
  //   gridRoot 追従をやめてこの位置を保持します(closeSortManager で解除 = 再オープンは既定位置)。
  //   注記: view 側がドラッグ session の closure に閉じ込めて呼ぶため、本関数は参照安定
  //   (deps [])であることが契約です。
  const moveSortManager = useCallback((top: number, left: number) => {
    const clamped = clampPanelDragPosition({
      top,
      left,
      panelWidth: PANEL_WIDTH,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    draggedPositionRef.current = clamped;
    setSortManagerLayout({ top: clamped.top, left: clamped.left, width: PANEL_WIDTH });
  }, []);

  // 追加(MS-3-1): open 時の初期配置 + resize / window scroll への追従です。
  //               gridRoot 基準のため、グリッド内部スクロールでは動かしません。
  useEffect(() => {
    if (!isSortManagerOpen) {
      return;
    }

    updateSortManagerLayout();

    const handle = () => {
      updateSortManagerLayout();
    };

    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);

    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isSortManagerOpen, updateSortManagerLayout]);

  // 追加(MS-3-1): 表示中は outside click で閉じます(列メニューと同じ作法)。
  useEffect(() => {
    if (!isSortManagerOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (sortManagerRef.current?.contains(targetNode)) {
        return;
      }
      closeSortManager();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [closeSortManager, isSortManagerOpen]);

  // 追加(MS-3-1): 表示中は Escape で閉じます(フォーカス位置に依らず効くよう window で拾います)。
  useEffect(() => {
    if (!isSortManagerOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSortManager();
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
  }, [closeSortManager, isSortManagerOpen]);

  return {
    isSortManagerOpen,
    sortManagerLayout,
    sortManagerRef,
    openSortManager,
    closeSortManager,
    moveSortManager,
  };
};

export default useSortManagementController;