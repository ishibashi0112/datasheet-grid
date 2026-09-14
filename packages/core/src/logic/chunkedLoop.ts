// 追加(非依存化 ③-9): 時間分割ループの共通ヘルパーです(React 非依存)。
//   大量行の走査(列 autosize の計測 / select 候補の収集 / グローバルフィルター)を「1 チャンク =
//   予算 ms 以内で連続処理 → yieldToMain で入力・描画へ譲る → 中断判定 → 進捗通知」の形に揃えます。
//   3 つのランナーで同じ形のループが重複していたものを 1 箇所へ寄せました。
import { yieldToMain } from '../utils/scheduler';

// 1 チャンクで連続処理する時間予算(ms)。旧 3 ランナー共通の値。
export const CHUNK_BUDGET_MS = 10;

export const nowMs = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export type RunChunkedOptions = {
  budgetMs?: number;
  // yield 後の中断判定(true なら以降を打ち切り、runChunked は false を返す)。
  isCancelled?: () => boolean;
  // yield 後(中断でない場合)の進捗通知。done = 処理済み件数。
  onYield?: (done: number, total: number) => void;
};

// 0..total-1 を visit しながら時間分割で走査します。最後まで走ったら true、中断なら false。
//   1 チャンクで必ず 1 件以上進めます(時計が粗い / 予算 0 でも前進を保証し、無限ループを防ぐ)。
export const runChunked = async (
  total: number,
  visit: (index: number) => void,
  { budgetMs = CHUNK_BUDGET_MS, isCancelled, onYield }: RunChunkedOptions = {},
): Promise<boolean> => {
  let index = 0;
  while (index < total) {
    const sliceStart = nowMs();
    do {
      visit(index);
      index += 1;
    } while (index < total && nowMs() - sliceStart < budgetMs);
    if (index < total) {
      await yieldToMain();
      if (isCancelled?.()) {
        return false;
      }
      onYield?.(index, total);
    }
  }
  return !isCancelled?.();
};