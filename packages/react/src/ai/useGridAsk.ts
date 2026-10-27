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
} from '@ishibashi0112/spreadsheet-grid-core/logic/gridAsk';
import type { GridColumn, GridState } from '../model/gridTypes';

/**
 * AI に聞く関数です(利用側が用意する)。`request` を自分のサーバーへ送り、AI の答え(オブジェクトか JSON の文字列)を返します。
 * `signal` は「止める」で abort されます(fetch にそのまま渡せます)。
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
  columnHints?: Readonly<Record<string, string | false>>;
  /** 並びを変えてよいか(既定 true)。 */
  allowSort?: boolean;
  /** グローバル検索の文字を変えてよいか(既定 true)。 */
  allowSearch?: boolean;
  /** 列を隠す・見せるのを許す(既定 false。グリッドに onColumnsChange を渡しているときに付ける)。 */
  allowColumnVisibility?: boolean;
  /** 反映したあとに呼ぶ。 */
  onApply?: (event: GridAskApplyEvent) => void;
  /** ask が失敗したとき(throw / reject)に呼ぶ。止めたときは呼ばない。 */
  onError?: (error: unknown) => void;
};

/** 最後の頼みの結果です。 */
export type GridAskSession = {
  /** applied = 反映した / unchanged = 変える条件が無かった / undone = 元に戻した。 */
  phase: 'applied' | 'unchanged' | 'undone';
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
  /** 文を AI に聞いて反映する。聞いている間は何もしない。 */
  submit: (text: string) => Promise<void>;
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

const ASK_ERROR = 'AI に聞けませんでした。もう一度試してください。';
const CHANGED_NOTICE = '表の条件が変わったので、ここからは変えられません。表のフィルターや並びで直してください。';

// 隠した列が変わらないときは columns を渡しません(列定義を onColumnsChange で書き直さないため)。
const toApplicable = (current: GridState, next: GridState): GridState =>
  isGridAskColumnsChanged(current, next) ? next : { ...next, columns: undefined };

// 元に戻す: 今の列幅・列の順番・固定はそのままで、見え方(フィルター / 並び / 検索 / 隠した列)だけを戻します。
const restoreView = (current: GridState, before: GridState): GridState => {
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
  // 聞いている間の AbortController(止める / 次の頼み / アンマウントで abort)。
  const pendingRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      pendingRef.current?.abort();
      pendingRef.current = null;
    },
    [],
  );

  const askOptions: GridAskOptions<T> = {
    columns: options.columns,
    columnHints: options.columnHints,
    allowSort: options.allowSort,
    allowSearch: options.allowSearch,
    allowColumnVisibility: options.allowColumnVisibility,
  };
  const describe = (state: GridState): GridAskItem[] => describeGridAskView(state, askOptions);

  const submit = async (raw: string): Promise<void> => {
    const text = raw.trim();
    const grid = options.grid.current;
    if (text === '' || grid === null || pendingRef.current !== null) {
      return;
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
        return;
      }
      pendingRef.current = null;
      setStatus('idle');
      options.onError?.(caught);
      setError(ASK_ERROR);
      return;
    }
    // 止めたあとに答えが届いたら捨てます(cancel が状態を戻し済み)。
    if (controller.signal.aborted) {
      return;
    }
    pendingRef.current = null;
    setStatus('idle');
    const target = options.grid.current;
    if (target === null) {
      return;
    }
    // 聞いている間に表が変わっていてもよいように、答えは今の状態に当てます。
    const before = target.getState();
    const result = readGridAskAnswer(answer, before, askOptions);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const view = { text, dropped: result.dropped, unsupported: result.unsupported };
    if (!result.changed) {
      setSession({ view: { ...view, phase: 'unchanged', items: describe(before) }, before, applied: before });
      return;
    }
    target.applyState(toApplicable(before, result.state));
    setSession({ view: { ...view, phase: 'applied', items: describe(result.state) }, before, applied: result.state });
    options.onApply?.({ text, state: result.state, dropped: result.dropped, unsupported: result.unsupported });
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

  // 反映したあと表が手で変えられていないかを確かめてから、今の状態を返します。
  const readUnchanged = (current: SessionState): { target: GridAskTarget; now: GridState } | null => {
    const target = options.grid.current;
    if (target === null || current.view.phase !== 'applied') {
      return null;
    }
    const now = target.getState();
    if (!isSameGridAskView(now, current.applied)) {
      setNotice(CHANGED_NOTICE);
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
    const restored = restoreView(checked.now, session.before);
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