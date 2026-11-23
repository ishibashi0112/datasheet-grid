// 追加(段 3-6): グラフの外を読んで書く effect の apply(後半)を包みます。
//
//   Solid 2 の開発用の計測(attribution。`vite dev` の既定で入る)は、effect が書いた値で別の計算が同じ変化のうちに 2 回走ると
//   EFFECT_RELAY_TEAR を出し、apply が引数(compute の結果)を受けるかどうかで書き込みの種類を見分けます:
//   - 引数を受ける = 書く値は compute の結果から決まる「派生した状態」とみなし、3 回目から console に警告する(直し方は memo)。
//   - 引数を受けない = DOM を測る・時刻・ref など、グラフの外を読んで書くとみなし、知らせを console に出さない(測ることの手間)。
//
//   グリッドの effect の多くは後者です。core のコントローラ(前の値を覚えて比べる・DOM を測る・自分の store を持つ)と、
//   グリッドの store(グラフの外の外部 store)の今の状態から決める reducer の action(選択を範囲の中へ詰めるなど)で、書く値は
//   compute の結果だけでは決まらず、memo にはできません(React 版と同じ core の作り。React 版もレイアウト effect / effect の中で
//   同じ書き込みをする)。それでも apply が引数を受けると前者に数えられ、利用者には直せない警告が console に出ていました
//   (docs/solid/README.md「開発ビルドで Solid が出す知らせ」、2026-11-22 の点検 S7 / S8)。値は今までどおり引数で受け
//   (compute と apply の間で値を写さない = 遷移の中でも Solid が渡す値をそのまま使う)、残余引数にして apply の引数の数を 0 にします。
//   自分で自分の入力を書き換える EFFECT_WRITES_OWN_SOURCE は引数の数に依らず、今までどおり出ます。
export function outsideGraphApply<V>(apply: (value: V) => void): (...values: [V]) => void {
  return (...values) => {
    apply(values[0]);
  };
}