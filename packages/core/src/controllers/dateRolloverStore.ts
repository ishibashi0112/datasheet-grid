// 追加(監査 L-15): 相対日付プリセット(今日 / 今月 / 過去 30 日 / カスタム)の解決基準日を購読可能にするストアです
//   (React 非依存)。値はローカル時刻の 'YYYY-MM-DD' で、日付が変わったら新しい値へ差し替えて購読者へ通知します。
//   シェルはこの値で解決したプリセットの範囲のキー(logic/filtering の resolveRelativeDateFilterKey)を列フィルター /
//   serverSide の queryKey の memo 入力に足すため、日付をまたいで開きっぱなしでも「今日」の範囲が自動で翌日へ追従
//   します(従来は他の入力が変わるまで前日の範囲のままだった)。範囲が変わらない日(「今月」の月内など)は何もしません。
//   - update({ active }) で見張りを入り切りします。プリセットが 1 つも掛かっていない間(active=false)は
//     タイマーもリスナーも持ちません(大多数の利用側ではゼロコスト)。
//   - 見張り中は「次のローカル深夜 0 時」にタイマーを張ります(夏時間でも Date の繰り上がりで正しい時刻)。
//     PC のスリープ等でタイマーが遅れる環境に備え、待ち時間は最大 1 時間に区切り、タブが前面に戻ったとき
//     (visibilitychange / focus)にも確かめ直します。
//   - dispose 後に update が来たら(StrictMode の再マウント)見張りをやり直します(監査 C-11 と同じ作法)。
import { formatDateKey } from '../logic/filtering';
import { createValueStore } from '../logic/valueStore';

export type DateRolloverArgs = {
  // 相対日付プリセットを含む列フィルターが掛かっているか(columnFiltersUseRelativeDate)。
  active: boolean;
};

export type DateRolloverStore = {
  update: (args: DateRolloverArgs) => void;
  // 現在の基準日('YYYY-MM-DD')。active=false の間は更新しません(使う側も active のときだけ読む)。
  getSnapshot: () => string;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
};

export type DateRolloverStoreOptions = {
  // 現在時刻の取得(テストで固定 / 進めるため)。既定は new Date()。
  now?: () => Date;
};

// タイマー 1 回の待ち時間の上限(ms)。スリープ明け等で遅れても、この間隔で確かめ直します。
const MAX_TIMER_DELAY_MS = 60 * 60 * 1000;
// 深夜 0 時ちょうどに発火して日付がまだ前日に見える(タイマーの早着)のを避ける余裕(ms)。
const MIDNIGHT_MARGIN_MS = 50;

// 次のローカル深夜 0 時までの ms(上限つき)。
const msUntilNextCheck = (current: Date): number => {
  const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  const delay = nextMidnight.getTime() - current.getTime() + MIDNIGHT_MARGIN_MS;
  return Math.min(Math.max(delay, MIDNIGHT_MARGIN_MS), MAX_TIMER_DELAY_MS);
};

export const createDateRolloverStore = (options: DateRolloverStoreOptions = {}): DateRolloverStore => {
  const now = options.now ?? (() => new Date());
  const store = createValueStore(formatDateKey(now()));
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let listening = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // 今の日付キーを確かめ、変わっていれば差し替えます(同値なら valueStore が通知しない)。
  const check = () => {
    store.setSnapshot(formatDateKey(now()));
  };

  const schedule = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      check();
      if (active) {
        schedule();
      }
    }, msUntilNextCheck(now()));
  };

  // タブが前面に戻ったとき(スリープ明け / 別タブから戻った)に確かめ直し、タイマーも張り直します。
  const handleWake = () => {
    if (!active) {
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    check();
    schedule();
  };

  const attachListeners = () => {
    if (listening || typeof window === 'undefined') {
      return;
    }
    listening = true;
    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);
  };
  const detachListeners = () => {
    if (!listening) {
      return;
    }
    listening = false;
    window.removeEventListener('focus', handleWake);
    document.removeEventListener('visibilitychange', handleWake);
  };

  const stop = () => {
    active = false;
    clearTimer();
    detachListeners();
  };

  return {
    update: ({ active: nextActive }) => {
      if (nextActive === active) {
        return;
      }
      if (!nextActive) {
        stop();
        return;
      }
      active = true;
      // 見張っていない間に日付が変わっていたら、ここで追いつきます。
      check();
      schedule();
      attachListeners();
    },
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    dispose: stop,
  };
};