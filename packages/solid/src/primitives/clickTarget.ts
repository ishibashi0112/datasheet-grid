// 追加(0.1.0 の前の実アプリ点検 S6-01): click を受ける要素に、React 版と同じく空の onclick を付けます。
//   React は onClick を渡した要素に空の onclick を付けます(react-dom の trapClickOnNonInteractiveElement。iOS の Safari が
//   ボタンでない要素へ click を送るため)。Chromium のタッチの位置合わせ(touch adjustment)は click のリスナーを持つ要素を
//   タップの的の候補にするので、Solid の委譲(リスナーは document だけ)では、checkbox の列のセルの端や展開トグルの近くを
//   タップしたときに選ばれる要素が React 版と違っていました(checkbox は箱の真上だけで切り替わり、トグルはボタンの外でも開く)。
//   セルと checkbox のセル(React 版で onClick を持つ、ボタンでない要素)に付けて同じにします。動きは委譲の onClick のまま。
const noop = () => {};

export const markClickTarget = (element: HTMLElement): void => {
  element.onclick = noop;
};