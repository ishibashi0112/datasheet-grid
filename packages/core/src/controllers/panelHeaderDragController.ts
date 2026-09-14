// 追加(非依存化 ③-4): 独立パネル(ツールパネル等)のヘッダーを掴んで移動するドラッグのコントローラです
//   (React 非依存。旧 hooks/usePanelHeaderDrag の本体を移設)。pointerdown で開始判定を行い、
//   window の pointermove / pointerup / pointercancel を pointerId でフィルタして追従します
//   (仮想化 DOM 上のドラッグは window リスナ + pointerId が作法。CLAUDE.md 参照)。
//   位置の clamp・保持はコントローラの外(useToolPanelController の onPanelMove)の責務です。
export type PanelHeaderDragPointerDown = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  preventDefault: () => void;
};

export type PanelHeaderDragStartArgs = {
  // 現在のパネル位置(null = 未配置 → 開始しない)。
  layout: { top: number; left: number } | null;
  onMove: (top: number, left: number) => void;
};

export type PanelHeaderDragController = {
  // pointerdown から開始します(主ボタン以外 / フォーム部品上 / 未配置 / ドラッグ中は無視して false)。
  startFromPointerDown: (
    event: PanelHeaderDragPointerDown,
    args: PanelHeaderDragStartArgs,
  ) => boolean;
  isActive: () => boolean;
  // 進行中のドラッグを中断し window リスナを外します(アンマウント時)。
  dispose: () => void;
};

// ドラッグ開始を抑止する要素(ヘッダー内の操作部品)。
const INTERACTIVE_SELECTOR = 'button, input, select, textarea';

export const createPanelHeaderDragController = (): PanelHeaderDragController => {
  let cleanup: (() => void) | null = null;

  const startFromPointerDown = (
    event: PanelHeaderDragPointerDown,
    { layout, onMove }: PanelHeaderDragStartArgs,
  ): boolean => {
    if (event.button !== 0 || layout === null || cleanup !== null) {
      return false;
    }
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
      return false;
    }
    event.preventDefault();

    const session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: layout.top,
      startLeft: layout.left,
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== session.pointerId) {
        return;
      }
      onMove(
        session.startTop + (e.clientY - session.startY),
        session.startLeft + (e.clientX - session.startX),
      );
    };
    const handleWindowPointerEnd = (e: PointerEvent) => {
      if (e.pointerId !== session.pointerId) {
        return;
      }
      cleanup?.();
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    cleanup = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
      cleanup = null;
    };
    return true;
  };

  return {
    startFromPointerDown,
    isActive: () => cleanup !== null,
    dispose: () => {
      cleanup?.();
    },
  };
};