import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

// 追加(FM-4): ドラッグ位置のビューポート clamp(パネル共有の純ロジック)です。
import { clampPanelDragPosition } from '../logic/panelDragGeometry';

// 追加(UP-1 / 統合ツールパネル): フィルター管理 / 列の表示 / 並び替えの独立 3 パネル
//   (useFilterManagementController / useColumnChooserController / useSortManagementController)
//   を 1 本へ統合した controller です。パネルは 1 枚(ToolPanel)になり、中身は
//   SegmentedControl のタブ(filter / columns / sort)で切り替えます。
// 設計メモ:
//   - open / close / layout / ドラッグ移動 / outside click / Escape の機構は旧 3 controller
//     と同一です(gridRoot 右上アンカー、ドラッグ後はフローティング + resize 再 clamp)。
//   - 変更(UP-2 / 位置記憶): ドラッグ位置は close しても破棄せず保持します(in-memory /
//     コンポーネント lifetime 内)。再オープン時はビューポートへ clamp した上で前回位置へ
//     復元します(旧 3 パネルの「close で既定位置へリセット」から変更。GridState には
//     保存しません = リマウントで既定位置に戻ります)。
//   - 追加(UP-2 / 既開時フラッシュ): 既に開いている状態での openToolPanel(導線の再クリック /
//     別タブへの切替)では toolPanelFlashTick を increment します。view(ToolPanel)はこれを
//     契機に枠をフラッシュし、「パネルはここに出ている」ことを示します(タブだけ静かに
//     切り替わって気づかれない、を防ぐため)。
//   - フィルター popover との「共存」拡張(alliedRef / suppressEscape / onSuppressedEscape)
//     は旧 FM controller の挙動をパネル全体へ引き継ぎます(どのタブ表示中でも popover 内
//     クリックで閉じず、popover open 中の Escape は popover close へ委譲 = 1 押し 1 階層)。
//   - タブの可用性は機能フラグに紐づきます(filter=enableColumnFilter / columns=enableColumnMenu /
//     sort=enableSorting)。open は不可用タブに対して no-op です。表示中に可用性が変わった
//     場合は「先頭の可用タブへ退避 / 可用タブなしなら閉じる」を派生値(activeToolPanelTab)
//     で解決します(effect の setState を避けるため、requestedTab は state のまま
//     表示タブだけを派生させます)。
//   - 幅は 3 パネル中最大の旧フィルター管理(360)へ統一します(フィルター行の要約文字列が
//     最も幅を要するため。列 / 並び替えタブは従来よりゆとりが出ます)。

// 追加(UP-1): 統合ツールパネルのタブ種別です(表示順も TAB_ORDER に従います)。
export type ToolPanelTab = 'filter' | 'columns' | 'sort';

// 追加(UP-1): body 直下 portal パネルの配置情報です(position: fixed 座標)。
export type ToolPanelLayout = {
  top: number;
  left: number;
  width: number;
};

type UseToolPanelControllerArgs = {
  // タブの可用性です(不可用タブは availableToolPanelTabs から除外され、open も no-op)。
  canUseFilterTab: boolean;
  canUseColumnsTab: boolean;
  canUseSortTab: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
  // 追加(FM-1 由来): 共存要素(フィルター popover)の ref です(outside-close の除外対象)。
  alliedRef?: RefObject<HTMLDivElement | null>;
  // 追加(FM-1 由来): true の間は Escape close を抑止し、onSuppressedEscape へ委譲します。
  suppressEscape?: boolean;
  onSuppressedEscape?: () => void;
};

// 注記: 幅は旧 3 パネル(chooser 280 / sort 320 / filter 360)の最大へ統一します。
const PANEL_WIDTH = 360;
const VIEWPORT_MARGIN = 8;
// gridRoot の右上から内側へのオフセットです(パネルがヘッダーに被る位置)。
const GRID_INSET = 12;

// 追加(UP-1): タブの表示順です(SegmentedControl の並び)。
const TAB_ORDER: ToolPanelTab[] = ['filter', 'columns', 'sort'];

export const useToolPanelController = ({
  canUseFilterTab,
  canUseColumnsTab,
  canUseSortTab,
  gridRootRef,
  alliedRef,
  suppressEscape = false,
  onSuppressedEscape,
}: UseToolPanelControllerArgs) => {
  // 開閉とタブを 1 つの state で持ちます(null = closed)。
  const [requestedTab, setRequestedTab] = useState<ToolPanelTab | null>(null);
  const [toolPanelLayout, setToolPanelLayout] =
    useState<ToolPanelLayout | null>(null);
  // 追加(UP-2): 既開時フラッシュのトリガーです(既に開いている状態での open で increment。
  //   view はこの値の変化を契機に枠をフラッシュします。閉→開では増えません)。
  const [toolPanelFlashTick, setToolPanelFlashTick] = useState(0);

  // パネル本体の ref です(outside click 判定に使います)。
  const toolPanelRef = useRef<HTMLDivElement | null>(null);

  // 追加(FM-4 由来): ヘッダードラッグで移動した位置です(null = 既定の gridRoot 追従)。
  //   ref なのは pointermove の高頻度更新で layout state と二重の再レンダーを起こさない
  //   ためです(layout が表示の真実)。
  //   変更(UP-2 / 位置記憶): close では破棄しません(再オープンは clamp 済みの前回位置)。
  //   破棄されるのはコンポーネントの unmount(= グリッドのリマウント)時だけです。
  const draggedPositionRef = useRef<{ top: number; left: number } | null>(null);

  // 表示順どおりの「可用タブ」一覧です(ToolPanel の SegmentedControl がそのまま描画します)。
  const availableToolPanelTabs = useMemo<ToolPanelTab[]>(() => {
    const flags: Record<ToolPanelTab, boolean> = {
      filter: canUseFilterTab,
      columns: canUseColumnsTab,
      sort: canUseSortTab,
    };
    return TAB_ORDER.filter((tab) => flags[tab]);
  }, [canUseFilterTab, canUseColumnsTab, canUseSortTab]);

  // 表示タブの派生解決です: requestedTab が可用ならそのまま、表示中に不可用化されたら
  // 先頭の可用タブへ退避、可用タブが 1 つもなければ閉扱い(null)。effect での setState を
  // 使わない収束のため、requestedTab 自体は書き換えません(次の open / close で更新されます)。
  const activeToolPanelTab: ToolPanelTab | null =
    requestedTab === null
      ? null
      : availableToolPanelTabs.includes(requestedTab)
        ? requestedTab
        : (availableToolPanelTabs[0] ?? null);

  const isToolPanelOpen = activeToolPanelTab !== null;

  // gridRoot 矩形の右上を基準に fixed 座標を計算します(旧 3 controller と同一機構)。
  const updateToolPanelLayout = useCallback(() => {
    // ドラッグ済みなら gridRoot 追従をやめ、ビューポートへの clamp だけを行います
    // (resize での再 clamp 用。window scroll で gridRoot が動いてもパネルは動かない =
    //  フローティングダイアログ挙動)。
    const dragged = draggedPositionRef.current;
    if (dragged) {
      const clamped = clampPanelDragPosition({
        top: dragged.top,
        left: dragged.left,
        panelWidth: PANEL_WIDTH,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setToolPanelLayout((current) => {
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
      setToolPanelLayout(null);
      return;
    }

    const rect = root.getBoundingClientRect();
    let left = rect.right - PANEL_WIDTH - GRID_INSET;
    let top = rect.top + GRID_INSET;

    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
    top = Math.max(VIEWPORT_MARGIN, top);

    setToolPanelLayout((current) => {
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

  // パネルを指定タブで開きます。既に開いているときはタブ切替のみ(位置は不動)です。
  // 不可用タブに対しては no-op(導線が出ない前提の保険ガード)。
  // 追加(UP-2): 既に開いているときの open(同一タブの再オープン導線を含む)では
  //   toolPanelFlashTick を increment し、view に枠フラッシュを促します。
  //   注記: requestedTab を読むため本関数の参照は open/close のたびに変わります
  //   (参照安定契約があるのは moveToolPanel のみ。利用側は通常の deps 管理で足ります)。
  const openToolPanel = useCallback(
    (tab: ToolPanelTab) => {
      const flags: Record<ToolPanelTab, boolean> = {
        filter: canUseFilterTab,
        columns: canUseColumnsTab,
        sort: canUseSortTab,
      };
      if (!flags[tab]) {
        return;
      }
      if (requestedTab !== null) {
        setToolPanelFlashTick((tick) => tick + 1);
      }
      // grid root に残っているフォーカスを外します(旧 3 controller と同じ作法)。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      gridRootRef.current?.blur();
      setRequestedTab(tab);
    },
    [canUseFilterTab, canUseColumnsTab, canUseSortTab, gridRootRef, requestedTab],
  );

  const closeToolPanel = useCallback(() => {
    // 変更(UP-2 / 位置記憶): ドラッグ位置(draggedPositionRef)は破棄しません。
    //   再オープン時は updateToolPanelLayout がビューポートへ clamp した上で前回位置へ
    //   復元します(close 中に resize されても画面外には出ません)。
    setRequestedTab(null);
    setToolPanelLayout(null);
    // close 後は grid root にフォーカスを戻し、keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // ヘッダードラッグからの移動です(view の usePanelHeaderDrag が pointermove ごとに呼びます)。
  // 位置は clamp して layout へ即時反映し、以後 updateToolPanelLayout は gridRoot 追従を
  // やめてこの位置を保持します(UP-2: close を跨いでも保持。解除は unmount のみ)。
  // 注記: view 側がドラッグ session の closure に閉じ込めて呼ぶため、本関数は参照安定
  // (deps [])であることが契約です。
  const moveToolPanel = useCallback((top: number, left: number) => {
    const clamped = clampPanelDragPosition({
      top,
      left,
      panelWidth: PANEL_WIDTH,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    draggedPositionRef.current = clamped;
    setToolPanelLayout({
      top: clamped.top,
      left: clamped.left,
      width: PANEL_WIDTH,
    });
  }, []);

  // open 時の初期配置 + resize / window scroll への追従です。gridRoot 基準のため、
  // グリッド内部スクロールでは動かしません(capture: true の scroll は内部スクロールでも
  // 発火しますが、gridRoot 矩形は内部スクロールで変わらないため layout は不変です)。
  useEffect(() => {
    if (!isToolPanelOpen) {
      return;
    }

    updateToolPanelLayout();

    const handle = () => {
      updateToolPanelLayout();
    };

    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);

    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isToolPanelOpen, updateToolPanelLayout]);

  // 表示中は outside click で閉じます。
  // 相違(FM-1 由来): alliedRef(フィルター popover)内の pointerdown は「内側」とみなして
  // 閉じません(✎ で popover を開いて編集 → 別の行の ✎ …と、パネルを開いたまま連続編集
  // できるようにします。どのタブ表示中でも同じ扱いです)。
  useEffect(() => {
    if (!isToolPanelOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (toolPanelRef.current?.contains(targetNode)) {
        return;
      }
      if (alliedRef?.current?.contains(targetNode)) {
        return;
      }
      closeToolPanel();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [alliedRef, closeToolPanel, isToolPanelOpen]);

  // 表示中は Escape で閉じます(パネル内入力へフォーカスがあっても効くよう window で
  // 拾います / POP-KEY: capture 登録)。
  // 相違(FM-1 由来): suppressEscape=true(フィルター popover open 中)の間は本パネルを
  // 閉じず、onSuppressedEscape(popover の close)へ委譲します。preventDefault はしません
  // (1 押し目 = popover / 2 押し目 = パネル、の 1 押し 1 階層に揃えるため)。
  useEffect(() => {
    if (!isToolPanelOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (suppressEscape) {
          onSuppressedEscape?.();
          return;
        }
        event.preventDefault();
        closeToolPanel();
      }
    };

    // 変更(POP-KEY 由来): capture 登録(第 3 引数 true)です。パネル root の bubble 相
    // stopPropagation やパネル内要素の stopPropagation に依らず、フォーカス位置に関係なく
    // Escape を受けられます(add / remove の capture 指定は一致必須です)。
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true);
    };
  }, [closeToolPanel, isToolPanelOpen, onSuppressedEscape, suppressEscape]);

  return {
    activeToolPanelTab,
    availableToolPanelTabs,
    toolPanelLayout,
    toolPanelFlashTick,
    toolPanelRef,
    openToolPanel,
    closeToolPanel,
    moveToolPanel,
  };
};

export default useToolPanelController;