// アクティブセルの枠 / 選択範囲の塗り(試作)。React 版の ActiveCellOverlay.tsx / SelectionOverlay.tsx と同じ DOM と class。
import { Show } from 'solid-js';
import { px } from '../primitives/style';

export type OverlayRect = { left: number; top: number; width: number; height: number };

type OverlayProps = {
  class: string;
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
          class={props.class}
          style={{
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