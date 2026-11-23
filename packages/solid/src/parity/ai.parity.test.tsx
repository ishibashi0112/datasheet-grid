// 追加(段 3-1 Solid 版の /ai): React 版と Solid 版の GridAskBar を同じ props・同じ操作で動かし、操作ごとのバーの DOM と、
//   表(偽のハンドル)へ渡した状態・通知を比べます。グリッドは偽のハンドル(getState / applyState だけ)で置き換える
//   (バーが見るのはハンドルだけなので、比べるのはバーの描き方とふるまい)。
//   React 版のソースは React の JSX 変換のまま読むので、React の部品は createElement で作る(parity/harness.tsx と同じ)。
import { afterEach, describe, expect, it } from 'vitest';
import { act as reactAct, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { flush } from 'solid-js';
import { render } from '@solidjs/web';
import { GridAskBar as SolidGridAskBar, type GridAsk, type GridAskBarProps } from '../ai';
import type { GridColumn, GridState, GridStatePatch } from '../index';
import { normalizeDom } from './normalizeDom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REACT_AI_MODULE = new URL('../../../react/src/ai.ts', import.meta.url).pathname;

type Row = { id: number; name: string; warehouse: string; stock: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60 },
  { key: 'name', title: '品名', width: 160, filterType: 'textSet' },
  {
    key: 'warehouse',
    title: '倉庫',
    width: 80,
    filterType: 'set',
    filterOptions: [
      { value: '東京', label: '東京' },
      { value: '大阪', label: '大阪' },
    ],
  },
  { key: 'stock', title: '在庫数', width: 80, filterType: 'numberSet' },
];

const filter = (column: string, op: string, extra: Record<string, unknown> = {}) => ({
  column,
  op,
  value: null,
  values: null,
  to: null,
  ...extra,
});
const answerOf = (extra: Record<string, unknown>) => ({
  mode: 'replace',
  filters: [],
  sort: null,
  search: null,
  hide: [],
  show: [],
  unsupported: null,
  ...extra,
});
const tokyoLowStock = answerOf({
  filters: [filter('warehouse', 'in', { values: ['東京'] }), filter('stock', '<=', { value: '10' })],
  sort: [{ column: 'stock', direction: 'desc' }],
});
const partly = answerOf({
  filters: [filter('color', 'in', { values: ['赤'] }), filter('warehouse', 'in', { values: ['東京'] })],
  unsupported: '色の列が無いので、色では絞り込めませんでした。',
  hide: ['stock'],
});

// 偽のハンドル(applyState は渡したスライスだけを変える = グリッドと同じ)。
const createTarget = (log: string[]) => {
  let state: GridState = {
    version: 2,
    columnWidths: {},
    filters: { globalText: '', columnFilters: {} },
    sort: [],
    columns: columns.map((column) => ({ key: column.key })),
  };
  return {
    getState: () => state,
    applyState: (next: GridStatePatch) => {
      log.push(`applyState ${JSON.stringify(next)}`);
      state = {
        ...state,
        ...(next.columnWidths !== undefined ? { columnWidths: next.columnWidths } : {}),
        ...(next.filters !== undefined ? { filters: { ...state.filters, ...next.filters } } : {}),
        ...(next.sort !== undefined ? { sort: next.sort } : {}),
        ...(next.columns !== undefined ? { columns: next.columns } : {}),
      };
    },
    setByHand: (next: GridStatePatch) => {
      state = { ...state, ...(next.sort !== undefined ? { sort: next.sort } : {}) };
    },
  };
};

type Step = { label: string; run: (ctx: Ctx) => void | Promise<void> };
type Ctx = {
  root: () => HTMLElement;
  input: () => HTMLInputElement;
  button: (name: string) => HTMLButtonElement;
  target: ReturnType<typeof createTarget>;
};

type Framework = 'react' | 'solid';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const setInputValue = (input: HTMLInputElement, value: string) => {
  // React の制御された入力欄は、プロパティの setter を通さないと変化に気づかない(testing-library の fireEvent.change と同じ)。
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

async function runScenario(
  framework: Framework,
  props: Record<string, unknown>,
  answers: unknown[],
  steps: Step[],
): Promise<{ snapshots: string[]; calls: string[] }> {
  const container = document.createElement('div');
  document.body.append(container);
  const calls: string[] = [];
  const target = createTarget(calls);
  let answerIndex = 0;
  const ask: GridAsk = async (request) => {
    calls.push(`ask ${request.text}`);
    const answer = answers[answerIndex];
    answerIndex += 1;
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  };
  const allProps = {
    columns,
    ask,
    onApply: (event: { text: string; dropped: string[]; unsupported: string | null }) =>
      calls.push(`onApply ${event.text} ${JSON.stringify(event.dropped)} ${event.unsupported}`),
    onError: (error: unknown) => calls.push(`onError ${String(error)}`),
    ...props,
  };
  let dispose: () => void;
  // 書き込みを反映して、ask の Promise と次の描画まで待つ。
  const settle = async (fn?: () => void | Promise<void>) => {
    if (framework === 'react') {
      await reactAct(async () => {
        await fn?.();
        await sleep(0);
      });
    } else {
      await fn?.();
      flush();
      await sleep(0);
      flush();
    }
  };
  if (framework === 'react') {
    const module = (await import(/* @vite-ignore */ REACT_AI_MODULE)) as { GridAskBar: ComponentType<Record<string, unknown>> };
    const reactRoot = createRoot(container);
    await settle(() => {
      reactRoot.render(createElement(module.GridAskBar, { ...allProps, grid: { current: target } }));
    });
    dispose = () => reactAct(() => reactRoot.unmount());
  } else {
    dispose = render(() => <SolidGridAskBar {...(allProps as unknown as GridAskBarProps<Row>)} grid={target} />, container);
    await settle();
  }
  const ctx: Ctx = {
    root: () => container.querySelector('.ssg-ask') as HTMLElement,
    input: () => container.querySelector('.ssg-ask-input') as HTMLInputElement,
    button: (name) => {
      const found = Array.from(container.querySelectorAll('button')).find(
        (button) => (button.getAttribute('aria-label') ?? button.textContent) === name,
      );
      if (!found) {
        throw new Error(`${framework}: ボタンがありません: ${name}`);
      }
      return found;
    },
    target,
  };
  const snapshots: string[] = [];
  try {
    for (const step of steps) {
      await settle(() => step.run(ctx));
      await settle();
      const active = document.activeElement;
      const focus = active && container.contains(active) ? `<${active.tagName.toLowerCase()} ${active.className}>` : 'なし';
      snapshots.push(`## ${step.label}\nfocus: ${focus}\nstate: ${JSON.stringify(target.getState())}\n${normalizeDom(ctx.root())}`);
    }
  } finally {
    dispose();
    container.remove();
  }
  return { snapshots, calls };
}

const compare = async (props: Record<string, unknown>, answers: unknown[], steps: Step[]) => {
  const react = await runScenario('react', props, answers, steps);
  const solid = await runScenario('solid', props, answers, steps);
  // AI_PARITY_DUMP=<ファイル> で React 版の書き出しを控える(差を見るとき)。
  if (process.env.AI_PARITY_DUMP) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.AI_PARITY_DUMP, `${react.snapshots.join('\n')}\n${react.calls.join('\n')}\n\n`);
  }
  expect(solid.snapshots.join('\n')).toBe(react.snapshots.join('\n'));
  expect(solid.calls).toEqual(react.calls);
};

const type = (text: string): Step => ({ label: `打つ ${text}`, run: (ctx) => setInputValue(ctx.input(), text) });
const submit: Step = { label: '送る', run: (ctx) => ctx.input().form!.requestSubmit() };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('GridAskBar(React 版と Solid 版の比べ)', () => {
  it('送る → チップ → 1 つ外す → 元に戻す → 閉じる', async () => {
    await compare({ examples: ['東京の在庫が 10 個以下', '大阪だけ'] }, [tokyoLowStock], [
      { label: '最初', run: () => {} },
      type('東京の在庫が 10 個以下を多い順に'),
      submit,
      { label: '1 つ外す', run: (ctx) => {
        const button = ctx.button('倉庫 "東京" を外す');
        button.focus();
        button.click();
      } },
      { label: '元に戻す', run: (ctx) => ctx.button('元に戻す').click() },
      { label: '閉じる', run: (ctx) => ctx.button('閉じる').click() },
    ]);
  });

  it('使えなかった部分・AI からのひとこと・列の表示を許さない', async () => {
    await compare({ theme: 'dark', className: 'my-bar', placeholder: '例: 東京だけ' }, [partly], [
      type('赤い東京のもの、在庫数は隠して'),
      submit,
    ]);
  });

  it('列の表示を許すと隠し、表を手で変えた後の元に戻すは知らせる', async () => {
    await compare({ allowColumnVisibility: true }, [partly], [
      type('赤い東京のもの、在庫数は隠して'),
      submit,
      { label: '手で並べ替える', run: (ctx) => ctx.target.setByHand({ sort: [{ columnKey: 'id', direction: 'asc' }] }) },
      { label: '元に戻す', run: (ctx) => ctx.button('元に戻す').click() },
      { label: '閉じる', run: (ctx) => ctx.button('閉じる').click() },
    ]);
  });

  it('失敗 → もう一度 → 読めない答え、例の文で聞く', async () => {
    await compare({ examples: ['東京だけ'] }, [new Error('network'), 'わかりません', tokyoLowStock], [
      type('東京だけ'),
      submit,
      type('書き換えた文'),
      { label: 'もう一度', run: (ctx) => ctx.button('もう一度').click() },
      { label: '例の文', run: (ctx) => ctx.button('東京だけ').click() },
    ]);
  });

  it('聞いている間(考えています・止める)と Esc で止める', async () => {
    await compare({}, [new Promise(() => {}), new Promise(() => {})], [
      type('東京だけ'),
      submit,
      { label: 'Esc', run: (ctx) => {
        ctx.input().focus();
        ctx.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      } },
      submit,
      { label: '止める', run: (ctx) => ctx.button('止める').click() },
    ]);
  });

  it('英語の文言', async () => {
    const { gridAskLocaleTextEn } = await import('../locales/en');
    await compare({ localeText: gridAskLocaleTextEn, examples: ['Tokyo only'] }, [tokyoLowStock], [
      { label: '最初', run: () => {} },
      type('Tokyo, low stock'),
      submit,
    ]);
  });
});