// アクティブセルの枠 / 選択範囲の塗り。React 版の ActiveCellOverlay.tsx / SelectionOverlay.tsx と同じ DOM と class。
import { Show } from 'solid-js';
import type { GridResolvedSlot } from '../model/gridTypes';
import { px } from '../primitives/style';

export type OverlayRect = { left: number; top: number; width: number; height: number };

type OverlayProps = {
  class: string;
  slot?: GridResolvedSlot | undefined;
  rect: OverlayRect | null;
  headerHeight: number;
  leadingWidth: number;
  baseOffset: number;
};

export function Overlay(props: OverlayProps) {
  return (
    <Show when={props.rect}>
      {(rect) => (
        <div
          class={[props.class, props.slot?.className]}
          style={{
            ...props.slot?.style,
            position: 'absolute',
            left: px(props.leadingWidth + rect().left),
            top: px(props.headerHeight + rect().top - props.baseOffset),
            width: px(rect().width),
            height: px(rect().height),
          }}
        />
      )}
    </Show>
  );
}