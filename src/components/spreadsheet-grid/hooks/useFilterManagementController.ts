import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// 追加(FM-4): ドラッグ位置のビューポート clamp(3 パネル共有の純ロジック)です。
import { clampPanelDragPosition } from '../logic/panelDragGeometry';

// 追加(FM-1 / フィルター管理パネル): フィルター管理パネル(FilterManagementPanel)の
//                 open / close / layout / outside click / Escape を管理するコントローラです。
// 設計メモ:
//   - useSortManagementController と同型です(「同型だが別物」を許容する本コードベースの
//     作法に倣い、共通化はせずコピー流用します。将来の共通化余地はこの注記で残します)。
//     相違はフィルター popover と「共存」するための次の 2 点だけです:
//       1) alliedRef: パネルと共存させる要素(フィルター popover)の ref です。その内側での
//          pointerdown では outside-close しません(✎ で popover を開いて編集 → 別の行の ✎ …
//          と、パネルを開いたまま連続編集できるようにします)。
//       2) suppressEscape / onSuppressedEscape: suppressEscape=true(フィルター popover
//          open 中)の間は本パネルの Escape close を抑止し、代わりに onSuppressedEscape
//          (通常は popover の close)へ委譲します。popover の Escape close は検索/入力
//          要素の onKeyDown が担当のため、フォーカスがパネル側にあるときは Escape が
//          どこにも届かず「押しても何も起きない」穴ができます。window capture で受ける
//          本 controller から委譲することで、フォーカス位置に依らず
//          「1 押し目 = popover / 2 押し目 = パネル」の 1 押し 1 階層に揃えます
//          (フォーカスが popover 内なら input 側 onKeyDown も同じ close を呼びますが冪等)。
//   - anchor は gridRoot 矩形の右上に固定します。パネルは列メニューの項目
//     「フィルターを管理…」から開くため、開いた時点でメニュー(と anchor ボタン)は閉じて
//     います。gridRoot 基準にすることで anchor ボタンの unmount(横スクロール仮想化)に
//     依存せず、グリッド内部スクロールではパネルが動かず、window scroll/resize でのみ
//     再配置されます。
//   - パネルには <select> 等のフォーカス可能要素があるため、Escape は入力にフォーカスが
//     あっても効くよう window で拾います(並び替え管理パネルと同じ作法 / capture 登録)。

// 追加(FM-1): body 直下 portal パネルの配置情報です(position: fixed 座標)。
export type FilterManagementLayout = {
  top: number;
  left: number;
  width: number;
};

type UseFilterManagementControllerArgs = {
  // 注記: フィルター管理は enableColumnFilter に紐づきます(開く導線は columnFilterEnabled の
  //       ときだけ出る列メニュー項目です)。保険として open 側でも本フラグでガードします。
  enableColumnFilter: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
  // 追加(FM-1): 共存要素(フィルター popover)の ref です(outside-close の除外対象)。
  alliedRef?: RefObject<HTMLDivElement | null>;
  // 追加(FM-1): true の間は Escape close を抑止し、onSuppressedEscape へ委譲します。
  suppressEscape?: boolean;
  onSuppressedEscape?: () => void;
};

// 注記: 行は「漏斗 + 列名/要約(2 段)+ ✎ + ×」で要約文字列が主役のため、
//       並び替え管理パネル(320)より少し広めにします。
const PANEL_WIDTH = 360;
const VIEWPORT_MARGIN = 8;
// 追加(FM-1): gridRoot の右上から内側へのオフセットです(パネルがヘッダーに被る位置)。
const GRID_INSET = 12;

export const useFilterManagementController = ({
  enableColumnFilter,
  gridRootRef,
  alliedRef,
  suppressEscape = false,
  onSuppressedEscape,
}: UseFilterManagementControllerArgs) => {
  const [isFilterManagerOpen, setIsFilterManagerOpen] = useState(false);
  const [filterManagerLayout, setFilterManagerLayout] =
    useState<FilterManagementLayout | null>(null);

  // 追加(FM-1): パネル本体の ref です(outside click 判定に使います)。
  const filterManagerRef = useRef<HTMLDivElement | null>(null);

  // 追加(FM-4): ヘッダードラッグで移動した位置です(null = 既定の gridRoot 追従)。
  //   close で null へ戻します(再オープンは既定位置)。ref なのは pointermove の高頻度
  //   更新で layout state と二重の再レンダーを起こさないためです(layout が表示の真実)。
  const draggedPositionRef = useRef<{ top: number; left: number } | null>(null);

  // 追加(FM-1): gridRoot 矩形の右上を基準に fixed 座標を計算します。
  const updateFilterManagerLayout = useCallback(() => {
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
      setFilterManagerLayout((current) => {
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
      setFilterManagerLayout(null);
      return;
    }

    const rect = root.getBoundingClientRect();
    let left = rect.right - PANEL_WIDTH - GRID_INSET;
    let top = rect.top + GRID_INSET;

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
    top = Math.max(VIEWPORT_MARGIN, top);

    setFilterManagerLayout((current) => {
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

  const openFilterManager = useCallback(() => {
    if (!enableColumnFilter) {
      return;
    }
    // 追加: grid root に残っているフォーカスを外します(列メニューと同じ作法)。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    gridRootRef.current?.blur();
    setIsFilterManagerOpen(true);
  }, [enableColumnFilter, gridRootRef]);

  const closeFilterManager = useCallback(() => {
    // 追加(FM-4): ドラッグ位置を破棄します(再オープンは既定の gridRoot アンカー位置)。
    draggedPositionRef.current = null;
    setIsFilterManagerOpen(false);
    setFilterManagerLayout(null);
    // 追加: close 後は grid root にフォーカスを戻し、keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // 追加(FM-4): ヘッダードラッグからの移動です(view の usePanelHeaderDrag が pointermove
  //   ごとに呼びます)。位置は clamp して layout へ即時反映し、以後 updateFilterManagerLayout は
  //   gridRoot 追従をやめてこの位置を保持します(closeFilterManager で解除 = 再オープンは既定位置)。
  //   注記: view 側がドラッグ session の closure に閉じ込めて呼ぶため、本関数は参照安定
  //   (deps [])であることが契約です。
  const moveFilterManager = useCallback((top: number, left: number) => {
    const clamped = clampPanelDragPosition({
      top,
      left,
      panelWidth: PANEL_WIDTH,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    draggedPositionRef.current = clamped;
    setFilterManagerLayout({ top: clamped.top, left: clamped.left, width: PANEL_WIDTH });
  }, []);

  // 追加(FM-1): open 時の初期配置 + resize / window scroll への追従です。
  //               gridRoot 基準のため、グリッド内部スクロールでは動かしません。
  useEffect(() => {
    if (!isFilterManagerOpen) {
      return;
    }

    updateFilterManagerLayout();

    const handle = () => {
      updateFilterManagerLayout();
    };

    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);

    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isFilterManagerOpen, updateFilterManagerLayout]);

  // 追加(FM-1): 表示中は outside click で閉じます(列メニューと同じ作法)。
  //   相違: alliedRef(フィルター popover)内の pointerdown は「内側」とみなして閉じません
  //   (✎ 編集で開いた popover の操作中にパネルが消えないようにします)。
  useEffect(() => {
    if (!isFilterManagerOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (filterManagerRef.current?.contains(targetNode)) {
        return;
      }
      if (alliedRef?.current?.contains(targetNode)) {
        return;
      }
      closeFilterManager();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [alliedRef, closeFilterManager, isFilterManagerOpen]);

  // 追加(FM-1): 表示中は Escape で閉じます(フォーカス位置に依らず効くよう window で拾います)。
  //   POP-KEY: capture 登録(第 3 引数 true)。パネル root の bubble 相遮断や内部要素の
  //   stopPropagation に依らず、window で最初に Escape を受けられます。
  //   相違: suppressEscape=true(フィルター popover open 中)の間は本パネルを閉じず、
  //   onSuppressedEscape(popover の close)へ委譲します。preventDefault はしません
  //   (フォーカスが popover 内のときの input 側 onKeyDown の処理を妨げないため。
  //    同じ close が二重に呼ばれても冪等です)。
  useEffect(() => {
    if (!isFilterManagerOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (suppressEscape) {
          onSuppressedEscape?.();
          return;
        }
        event.preventDefault();
        closeFilterManager();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true);
    };
  }, [
    closeFilterManager,
    isFilterManagerOpen,
    onSuppressedEscape,
    suppressEscape,
  ]);

  return {
    isFilterManagerOpen,
    filterManagerLayout,
    filterManagerRef,
    openFilterManager,
    closeFilterManager,
    moveFilterManager,
  };
};

export default useFilterManagementController;