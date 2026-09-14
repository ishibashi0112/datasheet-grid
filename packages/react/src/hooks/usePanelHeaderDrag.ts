// 追加(FM-4 / パネルドラッグ): 独立パネルのヘッダーを掴んでパネルを移動するための共有フックです
//   (ToolPanel の view が使います)。
// 変更(非依存化 ③-4): 本体は controllers/panelHeaderDragController.ts(React 非依存)へ移設し、本 hook は
//   React の PointerEvent をコントローラへ渡す薄いアダプタです。アンマウント時に進行中のドラッグを
//   中断します(window リスナの後始末)。
import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPanelHeaderDragController } from '@ishibashi0112/spreadsheet-grid-core/controllers/panelHeaderDragController';

type UsePanelHeaderDragArgs = {
  layout: { top: number; left: number } | null;
  onPanelMove: (top: number, left: number) => void;
};

export const usePanelHeaderDrag = ({
  layout,
  onPanelMove,
}: UsePanelHeaderDragArgs) => {
  const [controller] = useState(createPanelHeaderDragController);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const handleHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      controller.startFromPointerDown(event, { layout, onMove: onPanelMove });
    },
    [controller, layout, onPanelMove],
  );

  return { handleHeaderPointerDown };
};

export default usePanelHeaderDrag;