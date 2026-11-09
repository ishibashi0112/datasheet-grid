// 本物の AI の代わり。受け取った頼みを記録し、決まった文に構造化出力と同じ形の答えを返す。
import type { GridAsk, GridAskRequest } from '@ishibashi0112/spreadsheet-grid/ai';
import { toYmd } from './data';

export type AskLogEntry = {
  at: number;
  text: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  bodyBytes: number;
  outcome?: 'answered' | 'aborted' | 'threw';
  answer?: unknown;
};

declare global {
  interface Window {
    __askLog: AskLogEntry[];
    __askAbortCount: number;
  }
}
window.__askLog = [];
window.__askAbortCount = 0;

type F = { column: string; op: string; value: string | null; values: string[] | null; to: string | null };
const f = (column: string, op: string, value: string | null = null, values: string[] | null = null, to: string | null = null): F => ({
  column,
  op,
  value,
  values,
  to,
});
const answer = (part: Partial<{ mode: string; filters: F[]; sort: { column: string; direction: string }[] | null; search: string | null; hide: string[]; show: string[]; unsupported: string | null }>) => ({
  mode: 'replace',
  filters: [],
  sort: null,
  search: null,
  hide: [],
  show: [],
  unsupported: null,
  ...part,
});

const lastMonth = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return [toYmd(from), toYmd(to)] as const;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

// 文 → 答え。ja と en の両方の言い方を受ける。
const rules: { test: RegExp; reply: () => unknown; delay?: number; throws?: boolean }[] = [
  // 1. 関東の 10 万円以上(地域は表示名で答える = 値へ直るか)
  { test: /関東の\s*10\s*万円以上/, reply: () => answer({ filters: [f('region', 'in', null, ['関東']), f('amount', '>=', '100000')] }) },
  { test: /kanto.*100,?000/i, reply: () => answer({ filters: [f('region', 'in', null, ['kanto']), f('amount', '>=', '100000')] }) },
  // 2. 先月の売上を金額の大きい順
  {
    test: /先月.*金額の大きい順|last month.*(largest|biggest)/i,
    reply: () => {
      const [from, to] = lastMonth();
      return answer({ filters: [f('date', 'between', from, null, to)], sort: [{ column: 'amount', direction: 'desc' }] });
    },
  },
  // 3. 状態が未入金のもの(select は equals)
  { test: /未入金|unpaid/i, reply: () => answer({ filters: [f('status', 'equals', 'unpaid')] }) },
  // 4. さらに数量 10 以上だけ(refine)
  { test: /さらに数量\s*10\s*以上|also.*qty.*10/i, reply: () => answer({ mode: 'refine', filters: [f('qty', '>=', '10')] }) },
  // 5. 今月の分(preset)
  { test: /今月|this month/i, reply: () => answer({ filters: [f('date', 'preset', 'thisMonth')] }) },
  // 6. 田中さんの分(textSet の contains)
  { test: /田中/, reply: () => answer({ filters: [f('rep', 'contains', '田中')] }) },
  // 7. ボールペンを検索(search)— JSON の文字列で返す
  { test: /ボールペン.*検索|search.*pen/i, reply: () => JSON.stringify(answer({ search: 'ボールペン' })) },
  // 8. ノートかボールペン(set の in。値で答える)
  { test: /ノートかボールペン|notebooks? or pens?/i, reply: () => answer({ filters: [f('product', 'in', null, ['note', 'pen'])], sort: [{ column: 'date', direction: 'desc' }] }) },
  // 9. 金額 5 万〜10 万(範囲を逆に書く = 入れ替わるか)、全角の数
  { test: /5\s*万.*10\s*万|50k.*100k/i, reply: () => answer({ filters: [f('amount', 'between', '１００，０００', null, '50000')] }) },
  // 10. メモに至急(filterType の無い列)
  { test: /メモに至急|memo.*urgent/i, reply: () => answer({ filters: [f('memo', 'contains', '至急')] }) },
  // 11. キャンセル以外(select の notIn = 使えない条件 → 落ちる)
  { test: /キャンセル以外|except cancelled/i, reply: () => answer({ filters: [f('status', 'notIn', null, ['cancelled'])] }) },
  // 12. 顧客コード順(filterType の無い列も並びはできる)
  { test: /メモ順|by memo/i, reply: () => answer({ sort: [{ column: 'memo', direction: 'asc' }] }) },
  // 13. メモ列を隠して(allowColumnVisibility)
  { test: /メモ列を隠|hide.*memo/i, reply: () => answer({ mode: 'refine', hide: ['memo'] }) },
  { test: /全部隠|hide everything/i, reply: () => answer({ mode: 'refine', hide: ['date', 'region', 'rep', 'product', 'qty', 'amount', 'status', 'customer', 'memo'] }) },
  // 14. 売れ筋(できないこと)
  { test: /売れ筋|best.?sell/i, reply: () => answer({ filters: [], unsupported: '行のデータを見て「売れ筋」を判断することはできません。' }) },
  // 15. 空白の状態
  { test: /状態が空|status is blank/i, reply: () => answer({ filters: [f('status', 'blank')] }) },
  // 16. 近畿と九州以外(set の notIn)
  { test: /近畿と九州以外/, reply: () => answer({ filters: [f('region', 'notIn', null, ['kinki', 'kyushu'])] }) },
  // ── 不正な答え ──
  { test: /無い列/, reply: () => answer({ filters: [f('price', '>=', '100'), f('地域', 'in', null, ['kanto'])], sort: [{ column: 'unknown', direction: 'desc' }] }) },
  {
    test: /型違い/,
    reply: () => ({ mode: 'replace', filters: [{ column: 'amount', op: '>=', value: 100000, values: null, to: null }, { column: 'region', op: 'in', value: null, values: 'kanto', to: null }], sort: 'amount', search: 123, hide: [], show: [], unsupported: null }),
  },
  {
    test: /範囲外/,
    reply: () =>
      answer({
        filters: [f('amount', 'between', 'abc', null, null), f('date', 'onOrAfter', '2026-13-45'), f('qty', 'like', '3'), f('region', 'in', null, ['沖縄']), f('date', 'preset', 'nextYear')],
        sort: [{ column: 'amount', direction: 'DESCENDING' }],
      }),
  },
  { test: /空の答え/, reply: () => '' },
  { test: /null の答え/, reply: () => null },
  { test: /空オブジェクト/, reply: () => ({}) },
  { test: /サーバーエラー/, reply: () => ({ error: 'rate_limited' }) },
  { test: /囲み/, reply: () => 'はい、こちらです。\n```json\n' + JSON.stringify(answer({ filters: [f('qty', '<', '5')] })) + '\n```\n以上です。' },
  { test: /途中で切れ/, reply: () => '{"mode":"replace","filters":[{"column":"amount","op":">=","value":"1' },
  { test: /長い文字/, reply: () => answer({ filters: [f('customer', 'contains', 'x'.repeat(201))], search: 'y'.repeat(201) }) },
  { test: /同じ列に二つ/, reply: () => answer({ filters: [f('qty', '>=', '5'), f('qty', '<=', '10')] }) },
  // ── 遅い / 例外 ──
  { test: /遅い|slow/i, delay: 5000, reply: () => answer({ filters: [f('qty', '>=', '30')] }) },
  { test: /例外|throw/i, throws: true, reply: () => null },
];

export const createMockAsk = (opts?: { defaultDelay?: number }): GridAsk => async (request: GridAskRequest, { signal }) => {
  // fetch の body と同じく JSON にして送る(大きさの記録)
  const body = JSON.stringify(request);
  const entry: AskLogEntry = {
    at: Date.now(),
    text: request.text,
    system: request.system,
    prompt: request.prompt,
    schema: request.schema,
    bodyBytes: new TextEncoder().encode(body).length,
  };
  window.__askLog.push(entry);
  const rule = rules.find((r) => r.test.test(request.text));
  try {
    await sleep(rule?.delay ?? opts?.defaultDelay ?? 300, signal);
  } catch (e) {
    entry.outcome = 'aborted';
    window.__askAbortCount += 1;
    throw e;
  }
  if (rule?.throws) {
    entry.outcome = 'threw';
    throw new Error('grid-ask: 500');
  }
  const reply = rule ? rule.reply() : answer({ filters: [], unsupported: 'この文には決まった答えがありません(モック)' });
  entry.outcome = 'answered';
  entry.answer = reply;
  return reply;
};
