// 追加(Solid 版 段階 0-1): コントローラがイベントの時点の状態を読むための共通の形です。
//   コントローラは描画のたびに update(args) で状態(uiState)を受けますが、Solid 2.0 は書き込みをマイクロタスクでまとめて
//   反映するので、同じタスクの中で続けたイベント(JS から続けて dispatch したキー操作など)では、2 回目以降が 1 回目の前の
//   uiState を読んでいました(↓ を 3 回送っても 1 行しか動かない)。getUiState(store の getState)を渡すと、イベントの
//   時点の store の状態を読みます。渡さないときは今までどおり update で受けた uiState です。React 版も store の getState を
//   渡します(実際の入力では離散イベントごとに描き直すので、ふつうはどちらも同じ値)。
//   注意: 1 つのイベントが複数のハンドラを通る(バブリング)ときは違うことがあります。custom エディタ(div など)が keydown の
//   中で ctx.commit / ctx.cancel を呼ぶと store はその場で編集を終えますが、同じ keydown はまだ描き直す前のシェルまで上がって
//   きます。「編集中ならグリッドはキー / 貼り付けを扱わない」の判定は isEditingAtEvent(描いた時点か今のどちらかで編集中なら
//   扱わない)を使います(別視点のレビュー: 今の値だけを見ると Enter で同じセルの編集が開き直り、Escape で選択まで消えた)。
import type { GridUiState } from '../model/gridTypes.unbound';

export type LiveUiStateArgs = {
  uiState: GridUiState;
  // イベントの時点の状態(store の getState)。省略は uiState。
  getUiState?: (() => GridUiState) | undefined;
};

export const readLiveUiState = (args: LiveUiStateArgs): GridUiState => args.getUiState?.() ?? args.uiState;

// 描いた時点(update で受けた uiState)か今(store)のどちらかで編集中か。
export const isEditingAtEvent = (args: LiveUiStateArgs): boolean =>
  args.uiState.editingCell !== null || readLiveUiState(args).editingCell !== null;