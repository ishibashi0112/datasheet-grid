// 入力欄(input / select)の value を、今の値と違うときだけ書きます(React 版の制御された入力欄の代わり)。Solid の JSX の式で
//   value を結ぶと、同じ要素のほかの属性が変わったときにも書き直され、IME の変換中の文字を消すことがあるため(上部バーの検索欄と
//   同じ)。select は候補(option)を入れた後に書く必要があるので、要素を受け取った後の描画の effect で書きます。
//   戻り値は ref に渡す関数です。
import { createRenderEffect, createSignal } from 'solid-js';

export function createInputValue<E extends HTMLInputElement | HTMLSelectElement>(
  value: () => string,
): (element: E) => void {
  const [element, setElement] = createSignal<E>();
  createRenderEffect(
    () => [element(), value()] as const,
    ([target, next]) => {
      if (target && target.value !== next) {
        target.value = next;
      }
    },
  );
  return (target) => {
    setElement(() => target);
  };
}

// チェックボックスを制御された入力欄のように扱います(React 版の checked と同じ)。押されたらブラウザが変えた checked /
//   indeterminate を元に戻してから知らせ、表示は状態から決めた値で書き直します(状態が変わらなければ元のまま)。
export const controlledToggle =
  (indeterminate: () => boolean, action: () => void) =>
  (event: Event & { currentTarget: HTMLInputElement }): void => {
    const target = event.currentTarget;
    target.checked = !target.checked;
    target.indeterminate = indeterminate();
    action();
  };

// チェックボックスの indeterminate(属性ではなくプロパティ)を状態から書きます(React 版は ref のたびに書く)。戻り値は ref に渡す関数。
export function createIndeterminate(value: () => boolean): (element: HTMLInputElement) => void {
  const [element, setElement] = createSignal<HTMLInputElement>();
  createRenderEffect(
    () => [element(), value()] as const,
    ([target, next]) => {
      if (target) {
        target.indeterminate = next;
      }
    },
  );
  return (target) => {
    setElement(() => target);
  };
}