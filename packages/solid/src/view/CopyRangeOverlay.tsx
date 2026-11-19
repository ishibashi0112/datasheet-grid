// コピー範囲(Ctrl / ⌘ + C の後の動く点線)と、クロスヘア(hoverHighlight: 'cross')のポインタの列の帯。機能
//   features/motionExtras の部品で、React 版の CopyRangeOverlay.tsx / ColumnHoverOverlay.tsx と同じ DOM と class。座標は
//   選択範囲の塗り(view/Overlay)と同じ(ペインの中 + leadingWidth / headerHeight / baseOffset)で、点線とアニメーションは
//   style.css(.ssg-copy-range-overlay / .ssg-col-hover-overlay)。
import { Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { GridResolvedSlot } from '../model/gridTypes';
import { px } from '../primitives/style';
import type { OverlayRect } from './Overlay';

type PlacedOverlayProps = {
  rect: OverlayRect | null;
  headerHeight: number;
  leadingWidth: number;
  baseOffset: number;
};

const placement = (props: PlacedOverlayProps, rect: OverlayRect): JSX.CSSProperties => ({
  position: 'absolute',
  left: px(props.leadingWidth + rect.left),
  top: px(props.headerHeight + rect.top - props.baseOffset),
  width: px(rect.width),
  height: px(rect.height),
});

export function CopyRangeOverlay(props: PlacedOverlayProps & { slot?: GridResolvedSlot | undefined }) {
  return (
    <Show when={props.rect}>
      {(rect) => (
        <div
          class={['ssg-copy-range-overlay', props.slot?.className]}
          style={{ ...props.slot?.style, ...placement(props, rect()) }}
          data-ssg-copy-range=""
        />
      )}
    </Show>
  );
}

export function ColumnHoverOverlay(props: PlacedOverlayProps) {
  return (
    <Show when={props.rect}>
      {(rect) => <div class="ssg-col-hover-overlay" style={placement(props, rect())} data-ssg-col-hover="" />}
    </Show>
  );
}