// 追加(slot-props / StyleX 併用): classNames prop(および単一スロット)を解決済みスロットへ変換する
//   薄い hook です。deps には署名文字列(JSON)を使います。利用側がレンダー毎に新しいオブジェクト
//   (例: `classNames={{ bodyCell: stylex.props(s.cell) }}` をインラインで書く)を渡しても、内容が
//   同じ限り同一参照を返すため、memo 済みの行 / ヘッダー(GridBodyRow / GridHeaderRow 等)の props が
//   揺れず再レンダーが増えません。解決規則そのものは logic/slotProps.ts(React 非依存)にあります。
import { useMemo, type CSSProperties } from 'react';
import {
  resolveSlotFromSignature,
  resolveSlotMapFromSignature,
  serializeSlotValue,
} from '../logic/slotProps';
import type {
  GridClassNames,
  GridResolvedSlot,
  GridResolvedSlots,
  GridSlotProps,
} from '../model/gridTypes';

export function useResolvedGridSlots(
  classNames: GridClassNames | undefined,
): GridResolvedSlots {
  const signature = serializeSlotValue(classNames);
  return useMemo(
    () =>
      resolveSlotMapFromSignature<keyof GridClassNames, CSSProperties>(
        signature,
      ),
    [signature],
  );
}

export function useResolvedGridSlot(
  slot: GridSlotProps | undefined,
): GridResolvedSlot {
  const signature = serializeSlotValue(slot);
  return useMemo(
    () => resolveSlotFromSignature<CSSProperties>(signature),
    [signature],
  );
}