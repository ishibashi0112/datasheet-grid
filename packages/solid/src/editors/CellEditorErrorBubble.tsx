// 入力の検査の NG のときにエディタの下へ出すエラーの吹き出し。React 版の editors/CellEditorErrorBubble.tsx と同じ DOM と class。
//   描いた後に 1 回測って置きます(下に収まらなければ上へ、右へはみ出す分は左へ、広すぎる文言は折り返す。core
//   utils/errorBubblePlacement)。文言が変わったら呼ぶ側が作り直します(React 版の key={message} と同じ)。
import { Show, createSignal, onSettled } from 'solid-js';
import {
  DEFAULT_ERROR_BUBBLE_PLACEMENT,
  ERROR_BUBBLE_ABOVE_CLASS,
  placeErrorBubble,
} from '@ishibashi0112/spreadsheet-grid-core/internal/utils/errorBubblePlacement';
import { px } from '../primitives/style';

// エディタが持つエラーの文言(無ければ null)から吹き出しを出します。文言が変わったら作り直して測り直します(React 版の
//   key={message})。空の文言('' = localeText で空にしたとき)でも出します(React 版と同じ。Show の when は '' を偽とみなすので
//   箱に入れて渡す)。
export function CellEditorError(props: { message: string | null }) {
  return (
    <Show when={props.message !== null ? { message: props.message } : null} keyed>
      {(state) => <CellEditorErrorBubble message={state.message} />}
    </Show>
  );
}

export function CellEditorErrorBubble(props: { message: string }) {
  let element: HTMLDivElement | undefined;
  const [placement, setPlacement] = createSignal(DEFAULT_ERROR_BUBBLE_PLACEMENT);
  onSettled(() => {
    if (element) {
      setPlacement(placeErrorBubble(element));
    }
  });
  return (
    <div
      ref={(node) => {
        element = node;
      }}
      role="alert"
      class={['ssg-cell-editor-error', { [ERROR_BUBBLE_ABOVE_CLASS]: placement().above }]}
      style={
        placement().shift > 0 || placement().wrapWidth !== null
          ? {
              left: placement().shift > 0 ? px(-placement().shift) : undefined,
              width: placement().wrapWidth !== null ? px(placement().wrapWidth ?? 0) : undefined,
              'white-space': placement().wrapWidth !== null ? 'normal' : undefined,
            }
          : undefined
      }
    >
      {props.message}
    </div>
  );
}
