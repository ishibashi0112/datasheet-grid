// 変更(非依存化 ③-1): 本体は controllers/tooltipController.ts(React 非依存)へ移設し、本 hook は
//   ライフサイクルとスロット反映を接続する薄いアダプタになりました。SpreadsheetGrid 本体から 1 回
//   呼びます。複数グリッド同居時はコントローラ側の refCount で共有要素を管理します。
import { useEffect, useRef } from 'react';
import {
  acquireTooltipController,
  type TooltipController,
} from '../controllers/tooltipController';
import type { GridResolvedSlot } from '../model/gridTypes';

export function useGridTooltip(slot?: GridResolvedSlot) {
  const controllerRef = useRef<TooltipController | null>(null);

  // マウントで参照を 1 つ取得し、アンマウントで返します(StrictMode の二重実行でも対称)。
  useEffect(() => {
    const controller = acquireTooltipController();
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // スロット変更の反映(マウント直後も上の effect の後に走ります)。
  useEffect(() => {
    controllerRef.current?.setSlot(slot);
  }, [slot]);
}