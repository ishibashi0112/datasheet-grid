// 追加(ことばで絞り込み): 入口 `/ai` の状態とふるまいです(GridAskBar が使い、自前の見た目で作るときはこれだけを使う)。
//   利用者の文 → core の createGridAskRequest で頼みを組み立て → 利用側の ask(自分のサーバー → 好きな AI)→
//   core の readGridAskAnswer で検査 → グリッドの applyState へ。グリッドの部品(本体のモジュール)は import しない
//   (全部入りの入口とビルドのチャンクを共有しないため。使うのは core と React だけ)。
import { useEffect, useRef, useState } from 'react';
import {
  describeGridAskView,
  isGridAskColumnsChanged,
  isSameGridAskView,
  readGridAskAnswer,
  removeGridAskItem,
  createGridAskRequest,
  type GridAskItem,
  type GridAskOptions,
  type GridAskRequest,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAsk';
import {
  resolveGridAskLocaleText,
  type GridAskLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAskLocaleText';
import type { GridColumn, GridState } from '../model/gridTypes';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える。hooks/useUnregisteredFeatureWarnings と同じ)。
declare const process: { env: { NODE_ENV?: string | undefined } };

/**
 * AI に聞く関数です(利用側が用意する)。`request` を自分のサーバーへ送り、AI の答え(オブジェクトか JSON の文字列)を返します。
 * `signal` は「止める」/ Esc / アンマウントで abort されます(fetch にそのまま渡せます)。
 */
export type GridAsk = (request: GridAskRequest, context: { signal: AbortSignal }) => Promise<unknown> | unknown;

/** `getState()` / `applyState()` を持つもの(SpreadsheetGrid の ref ハンドル)。 */
export type GridAskTarget = {
  getState: () => GridState;
  applyState: (state: GridState) => void;
};

/** 反映したあとの通知(ログなどに)。 */
export type GridAskApplyEvent = {
  text: string;
  state: GridState;
  dropped: string[];
  unsupported: string | null;
};

export type UseGridAskOptions<T> = {
  /** SpreadsheetGrid の ref。`getState()` と `applyState()` を使う。 */
  grid: { readonly current: GridAskTarget | null };
  /** グリッドと同じ列定義。AI に見せるのは key・title・filterType・候補(filterOptions / select エディタの選択肢)だけ。 */
  columns: readonly GridColumn<T>[];
  /** AI に聞く関数。 */
  ask: GridAsk;
  /** 列ごとの補足(単位や値の書き方)。`false` でその列を AI に見せない。 */
  columnHints?: Readonly<Record<string, string | false>> | undefined;
  /** 列の条件(フィルター)を変えてよいか(既定 true)。 */
  allowFilter?: boolean | undefined;
  /** 並びを変えてよいか(既定 true)。 */
  allowSort?: boolean | undefined;
  /** グローバル検索の文字を変えてよいか(既定 true)。 */
  allowSearch?: boolean | undefined;
  /** 列を隠す・見せるのを許す(既定 false。グリッドに onColumnsChange を渡しているときに付ける)。 */
  allowColumnVisibility?: boolean | undefined;
  /** 反映したあとに呼ぶ。 */
  onApply?: ((event: GridAskApplyEvent) => void) | undefined;
  /** ask が失敗したとき(throw / reject)に呼ぶ。止めたときは呼ばない。 */
  onError?: ((error: unknown) => void) | undefined;
  /** 文言(既定は日本語。英語は `gridAskLocaleTextEn`。一部だけ渡すと残りは既定)。 */
  localeText?: Partial<GridAskLocaleText> | undefined;
};

/** 最後の頼みの結果です。 */
export type GridAskSession = {
  /**
   * applied = 反映した / unchanged = 変える条件が無かった / undone = 元に戻した /
   * changed = 反映したあと表が手で変わった(チップは古いので、外す・元に戻すはできない。notice にも知らせが入る)。
   */
  phase: 'applied' | 'unchanged' | 'undone' | 'changed';
  text: string;
  /** 反映した状態の見え方(チップ)。 */
  items: GridAskItem[];
  /** 使えなかった部分(日本語)。 */
  dropped: string[];
  /** AI が「できなかった」と書いてきた文。 */
  unsupported: string | null;
};

export type UseGridAskResult = {
  status: 'idle' | 'asking';
  /** 失敗の文(次の頼みや閉じるで消える)。 */
  error: string | null;
  /** 元に戻せなかったときなどの知らせ。 */
  notice: string | null;
  session: GridAskSession | null;
  /**
   * 文を AI に聞いて反映する。聞いている間は何もしない。答えを読めたら(反映した / 変える条件が無かった)true、
   * 失敗・止めた・聞かなかったときは false で終わる(送ったあとに入力欄を空にするかの判断に使える)。
   */
  submit: (text: string) => Promise<boolean>;
  /** 聞いているのを止める。 */
  cancel: () => void;
  /** 反映した条件を元に戻す(表を手で変えたあとは戻さず notice を出す)。 */
  undo: () => void;
  /** チップ 1 件を外す。 */
  remove: (id: string) => void;
  /** 結果と知らせを閉じる。 */
  dismiss: () => void;
};

type SessionState = {
  view: GridAskSession;
  // 頼む前の状態(元に戻す先)と、反映した状態(表が手で変わったかの判定)。
  before: GridState;
  applied: GridState;
};

// 変更(英語対応): 失敗と知らせの文言は文言の表(localeText の askFailed / noGrid / changedNotice)へ移しました。
// 追加(dogfood DU-08): 反映したあと表が手で変わったかを確かめる間隔(ms)。クリックとキー操作の後にも確かめます。
const CHANGE_CHECK_INTERVAL_MS = 1000;
const CHANGE_CHECK_AFTER_INPUT_MS = 400;

// 反映した状態から表の見え方が変わっていないか。列の表示を AI に任せていないときは、隠した列の違い(手で隠した列)は
//   見ません。
const isViewUnchanged = (now: GridState, applied: GridState, columnVisibility: boolean): boolean =>
  columnVisibility
    ? isSameGridAskView(now, applied)
    : isSameGridAskView({ ...now, columns: undefined }, { ...applied, columns: undefined });

const toAskOptions = <T,>(options: UseGridAskOptions<T>): GridAskOptions<T> => ({
  columns: options.columns,
  columnHints: options.columnHints,
  allowFilter: options.allowFilter,
  allowSort: options.allowSort,
  allowSearch: options.allowSearch,
  allowColumnVisibility: options.allowColumnVisibility,
  localeText: options.localeText,
});

// 隠した列が変わらないときは columns を渡しません(列定義を onColumnsChange で書き直さないため)。
const toApplicable = (current: GridState, next: GridState): GridState =>
  isGridAskColumnsChanged(current, next) ? next : { ...next, columns: undefined };

// 元に戻す: 今の列幅・列の順番・固定はそのままで、見え方(フィルター / 並び / 検索 / 隠した列)だけを戻します。
//   列の表示を AI に任せていないときは、隠した列も今のまま(手で隠した列を戻さない)。
const restoreView = (current: GridState, before: GridState, columnVisibility: boolean): GridState => {
  if (!columnVisibility) {
    return { ...current, filters: before.filters, sort: before.sort };
  }
  const hidden = new Set((before.columns ?? []).filter((entry) => entry.visible === false).map((entry) => entry.key));
  return {
    ...current,
    filters: before.filters,
    sort: before.sort,
    columns: current.columns?.map((entry) => {
      if (hidden.has(entry.key)) {
        return { ...entry, visible: false };
      }
      const next = { ...entry };
      delete next.visible;
      return next;
    }),
  };
};

/**
 * 「ことばで絞り込み」の状態とふるまいです(見た目は持たない)。既定の見た目は `GridAskBar`。
 */
export function useGridAsk<T>(options: UseGridAskOptions<T>): UseGridAskResult {
  const [status, setStatus] = useState<'idle' | 'asking'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  // 聞いている間の AbortController(止める / Esc / アンマウントで abort。聞いている間の次の頼みは受け付けない)。
  const pendingRef = useRef<AbortController | null>(null);
  // 答えが届いたときに読む最新の設定です(聞いている間に列や allowSort が変わったら、変わったあとの設定で読む)。
  const latestRef = useRef(options);
  useEffect(() => {
    latestRef.current = options;
  });

  // アンマウントで聞くのをやめます。<Activity mode="hidden"> で隠したときもここを通り、また表示したときに
  //   「考えています」のまま固まらないよう status も戻します(本当のアンマウントでは何も起きない)。
  useEffect(
    () => () => {
      const controller = pendingRef.current;
      if (controller === null) {
        return;
      }
      pendingRef.current = null;
      controller.abort();
      setStatus('idle');
    },
    [],
  );

  const askOptions = toAskOptions(options);
  const texts = resolveGridAskLocaleText(options.localeText);
  const describe = (state: GridState): GridAskItem[] => describeGridAskView(state, askOptions);
  const columnVisibility = options.allowColumnVisibility ?? false;

  // 追加(dogfood DU-20): columnHints に列に無いキー(打ち間違い)があれば、開発時だけ警告します(`false` で隠した
  //   つもりの列が AI に送られるため)。同じ組み合わせでは 1 回だけ。
  const unknownHintKeys =
    process.env.NODE_ENV === 'production' || !options.columnHints
      ? ''
      : Object.keys(options.columnHints)
          .filter((key) => !options.columns.some((column) => column.key === key))
          .join(', ');
  // 変更(作り直しの確認 AI-N4): 接頭辞を [GridAskBar] から [spreadsheet-grid] に(useGridAsk だけの画面でも出るため)。
  // 変更(1.0.2 / 2026-11-09 実アプリの総点検 I-11): 最後に警告したキーを覚えて、StrictMode の effect の付け直しで
  //   もう一度出さないようにしました(これまでは 2 回以上出ていた)。
  const warnedHintKeysRef = useRef('');
  useEffect(() => {
    if (unknownHintKeys !== '' && unknownHintKeys !== warnedHintKeysRef.current) {
      warnedHintKeysRef.current = unknownHintKeys;
      console.warn(
        `[spreadsheet-grid] GridAskBar / useGridAsk の columnHints に列に無いキーがあります: ${unknownHintKeys}。列の key と同じ名前にしてください(この補足や \`false\` は効いていません)。\n` +
          `[spreadsheet-grid] columnHints of GridAskBar / useGridAsk has keys that are not columns: ${unknownHintKeys}. Use the column keys (these hints and \`false\` have no effect).`,
      );
    }
  }, [unknownHintKeys]);

  // 追加(dogfood DU-08): 反映したあと表が手で変わったら(チップバーの ×・グローバル検索・applyState など)、すぐに
  //   「変わった」にします。これまでは古いチップが押せるまま残り、押して初めて知らせていました。グリッドの変化を
  //   知る手段が ref のハンドルだけなので、一定の間隔とクリック / キー操作の後に getState() で比べます(反映した
  //   状態がある間だけ)。
  const appliedSession = session !== null && session.view.phase === 'applied' ? session : null;
  useEffect(() => {
    if (appliedSession === null) {
      return undefined;
    }
    let inputTimer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      // 聞いている間は確かめません(答えを反映すると今の反映は置き換わる。知らせが次の反映の後まで残っていた)。
      if (pendingRef.current !== null) {
        return;
      }
      const target = latestRef.current.grid.current;
      if (target === null || isViewUnchanged(target.getState(), appliedSession.applied, columnVisibility)) {
        return;
      }
      setSession((current) =>
        current === appliedSession ? { ...current, view: { ...current.view, phase: 'changed' } } : current,
      );
      setNotice(resolveGridAskLocaleText(latestRef.current.localeText).changedNotice);
    };
    const checkSoon = () => {
      if (inputTimer === null) {
        inputTimer = setTimeout(() => {
          inputTimer = null;
          check();
        }, CHANGE_CHECK_AFTER_INPUT_MS);
      }
    };
    const timer = setInterval(check, CHANGE_CHECK_INTERVAL_MS);
    document.addEventListener('click', checkSoon, true);
    document.addEventListener('keyup', checkSoon, true);
    return () => {
      clearInterval(timer);
      if (inputTimer !== null) {
        clearTimeout(inputTimer);
      }
      document.removeEventListener('click', checkSoon, true);
      document.removeEventListener('keyup', checkSoon, true);
    };
  }, [appliedSession, columnVisibility]);

  const submit = async (raw: string): Promise<boolean> => {
    const text = raw.trim();
    if (text === '' || pendingRef.current !== null) {
      return false;
    }
    const grid = options.grid.current;
    if (grid === null) {
      setError(texts.noGrid);
      return false;
    }
    const controller = new AbortController();
    pendingRef.current = controller;
    setStatus('asking');
    setError(null);
    setNotice(null);
    let answer: unknown;
    try {
      answer = await options.ask(createGridAskRequest(text, grid.getState(), askOptions), {
        signal: controller.signal,
      });
    } catch (caught) {
      if (controller.signal.aborted) {
        return false;
      }
      pendingRef.current = null;
      setStatus('idle');
      latestRef.current.onError?.(caught);
      setError(texts.askFailed);
      return false;
    }
    // 止めたあとに答えが届いたら捨てます(cancel が状態を戻し済み)。
    if (controller.signal.aborted) {
      return false;
    }
    pendingRef.current = null;
    setStatus('idle');
    // 聞いている間に変わった設定(列・allowSort など)と表の状態で答えを読みます。
    const latest = latestRef.current;
    const latestOptions = toAskOptions(latest);
    const target = latest.grid.current;
    if (target === null) {
      setError(texts.noGrid);
      return false;
    }
    const before = target.getState();
    const result = readGridAskAnswer(answer, before, latestOptions);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    const view = { text, dropped: result.dropped, unsupported: result.unsupported };
    // 前の反映への「変わった」の知らせは、新しい答えで置き換わるので消します。
    setNotice(null);
    if (!result.changed) {
      setSession({
        view: { ...view, phase: 'unchanged', items: describeGridAskView(before, latestOptions) },
        before,
        applied: before,
      });
      return true;
    }
    target.applyState(toApplicable(before, result.state));
    setSession({
      view: { ...view, phase: 'applied', items: describeGridAskView(result.state, latestOptions) },
      before,
      applied: result.state,
    });
    latest.onApply?.({ text, state: result.state, dropped: result.dropped, unsupported: result.unsupported });
    return true;
  };

  const cancel = (): void => {
    const controller = pendingRef.current;
    if (controller === null) {
      return;
    }
    pendingRef.current = null;
    controller.abort();
    setStatus('idle');
  };

  // 反映したあと表が手で変えられていないかを確かめてから、今の状態を返します。列の表示を AI に任せていない
  //   ときは、隠した列の違い(手で隠した列)は見ません。
  // 変更(dogfood DU-08): 変わっていたら、知らせるだけでなく「変わった」(changed)にします(チップを古いまま残さない)。
  const readUnchanged = (current: SessionState): { target: GridAskTarget; now: GridState } | null => {
    const target = options.grid.current;
    if (target === null || current.view.phase !== 'applied') {
      return null;
    }
    const now = target.getState();
    if (!isViewUnchanged(now, current.applied, columnVisibility)) {
      setNotice(texts.changedNotice);
      setSession({ ...current, view: { ...current.view, phase: 'changed' } });
      return null;
    }
    return { target, now };
  };

  const undo = (): void => {
    if (session === null) {
      return;
    }
    const checked = readUnchanged(session);
    if (checked === null) {
      return;
    }
    const restored = restoreView(checked.now, session.before, columnVisibility);
    checked.target.applyState(toApplicable(checked.now, restored));
    setNotice(null);
    setSession({ ...session, view: { ...session.view, phase: 'undone' } });
  };

  const remove = (id: string): void => {
    if (session === null) {
      return;
    }
    const checked = readUnchanged(session);
    if (checked === null) {
      return;
    }
    const next = removeGridAskItem(checked.now, id);
    checked.target.applyState(toApplicable(checked.now, next));
    setSession({ ...session, applied: next, view: { ...session.view, items: describe(next) } });
  };

  const dismiss = (): void => {
    setSession(null);
    setNotice(null);
    setError(null);
  };

  return {
    status,
    error,
    notice,
    session: session?.view ?? null,
    submit,
    cancel,
    undo,
    remove,
    dismiss,
  };
}