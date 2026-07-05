import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

// 追加(FM-4 / パネルドラッグ): 独立パネル(FilterManagement / SortManagement / ColumnChooser)
//   のヘッダーを掴んでパネルを移動するための共有フックです(3 パネルの view が使います。
//   controller のコピー流用と違い、ドラッグは「パネル種別に依らない共通の能力」のため
//   共有フックにします)。
// 設計メモ:
//   - リスナーは window + pointerId フィルタです(本コードベースの学び: 要素付けリスナーは
//     capture 対象の unmount で切れ、lostpointercapture は document 側で発火する。ヘッダーは
//     ドラッグ中に unmount しませんが、house style に合わせ window で追跡します)。
//   - 位置の clamp・保持・リセットは controller 側の責務です(moveXxx を onPanelMove として
//     受け取り、pointermove ごとに「開始位置 + 差分」を素通しで渡します)。onPanelMove は
//     参照安定(deps [])が契約です(ドラッグ session の closure に閉じ込めるため)。
//   - ヘッダー内のインタラクティブ要素(button / input / select / textarea)からは開始しません
//     (× close 等の操作を妨げないため)。主ボタン(button === 0)のみで開始します。
//   - session は closure + ref だけで管理し、ドラッグ自体では re-render を起こしません
//     (再レンダーは controller の layout 更新によるもののみ)。unmount 時は effect の
//     クリーンアップでリスナーを確実に解除します。

type UsePanelHeaderDragArgs = {
  // 現在のパネル位置です(ドラッグ開始時点の基準)。null のときは開始しません。
  layout: { top: number; left: number } | null;
  // controller の moveXxx(top, left)です(clamp して layout へ反映します)。
  onPanelMove: (top: number, left: number) => void;
};

export const usePanelHeaderDrag = ({
  layout,
  onPanelMove,
}: UsePanelHeaderDragArgs) => {
  // 進行中ドラッグの後始末です(unmount 時にも確実にリスナーを解除するため ref に持ちます)。
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // 主ボタン以外(右クリック等)では開始しません。
      if (event.button !== 0) {
        return;
      }
      if (!layout) {
        return;
      }
      // ヘッダー内のインタラクティブ要素(× close 等)からは開始しません。
      const target = event.target as Element | null;
      if (target?.closest('button, input, select, textarea')) {
        return;
      }
      // 既にドラッグ中(多点タッチの 2 本目など)は無視します。
      if (cleanupRef.current) {
        return;
      }
      // テキスト選択の開始を抑止します(タイトルは user-select: none ですが保険です)。
      event.preventDefault();

      const session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTop: layout.top,
        startLeft: layout.left,
      };

      // 関数宣言(hoisting)で相互参照(end → cleanup → move/end)の順序問題を避けます。
      function handleWindowPointerMove(e: globalThis.PointerEvent) {
        if (e.pointerId !== session.pointerId) {
          return;
        }
        onPanelMove(
          session.startTop + (e.clientY - session.startY),
          session.startLeft + (e.clientX - session.startX),
        );
      }

      function handleWindowPointerEnd(e: globalThis.PointerEvent) {
        if (e.pointerId !== session.pointerId) {
          return;
        }
        cleanup();
      }

      function cleanup() {
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handleWindowPointerEnd);
        window.removeEventListener('pointercancel', handleWindowPointerEnd);
        cleanupRef.current = null;
      }

      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerEnd);
      window.addEventListener('pointercancel', handleWindowPointerEnd);
      cleanupRef.current = cleanup;
    },
    [layout, onPanelMove],
  );

  return { handleHeaderPointerDown };
};

export default usePanelHeaderDrag;