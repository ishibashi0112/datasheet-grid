// React 版と Solid 版を同じ props・同じ操作で動かし、操作ごとの DOM と通知(on* の呼ばれ方)を比べるための道具。
//   React 版は `/lite` の createSpreadsheetGrid({ features: {} })(機能なし)をソースのまま描く(vitest.config.ts で
//   React のファイルには Solid の JSX 変換を掛けない)。2 つは同じ document で順に動かす(同時に置くとフォーカスを
//   取り合うため)。
//   - 操作は ctx.act(() => …) の中で行う(React は act、Solid は flush で書き込みを反映し、どちらも数フレーム待つ)。
//   - ctx.snapshot() でその時点の DOM(本体と body 直下のポータル)を normalizeDom で書き出して控える。
//   - watch に挙げた通知は呼ばれた順に引数ごと控える(イベントや要素は名前だけ)。
import { expect } from 'vitest';
import { createElement, act as reactAct, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createSignal, flush } from 'solid-js';
import { render } from '@solidjs/web';
import { SpreadsheetGrid } from '../SpreadsheetGrid';
import { normalizeDom } from './normalizeDom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 機能なしの React 版(Solid 版の段階 1 と同じ範囲)。React 版のソースは型検査で辿らないよう、パスを変数にして読む
// (このパッケージの tsconfig は Solid の JSX なので、React 版の .tsx は検査できない)。
const REACT_LITE_MODULE = new URL('../../../react/src/createSpreadsheetGrid.tsx', import.meta.url).pathname;
type ReactGridComponent = ComponentType<Record<string, unknown>>;
let reactGridPromise: Promise<ReactGridComponent> | null = null;
const loadReactGrid = (): Promise<ReactGridComponent> =>
  (reactGridPromise ??= import(/* @vite-ignore */ REACT_LITE_MODULE).then(
    (module: { createSpreadsheetGrid: (options: { features: object }) => unknown }) =>
      module.createSpreadsheetGrid({ features: {} }) as ReactGridComponent,
  ));

export type Framework = 'react' | 'solid';

export type ParityHandle = Record<string, (...args: never[]) => unknown>;

export type ParityContext = {
  framework: Framework;
  container: HTMLElement;
  // 操作(イベントや命令的 API)を行い、書き込みを反映して数フレーム待つ。
  act: (fn: () => void | Promise<void>, waitMs?: number) => Promise<void>;
  // 今の DOM を控える(label は差分の見出し)。
  snapshot: (label: string) => void;
  shell: () => HTMLElement;
  cell: (row: number, key: string, pane?: 'left' | 'center' | 'right') => HTMLElement;
  header: (key: string) => HTMLElement;
  handle: () => ParityHandle;
  // 要素を覚えておき、以後の snapshot ごとに「同じ要素のままか」を書き出す(React は要素を使い回すので、Solid が作り直すと
  //   差になる)。find は今の DOM から探す関数。
  track: (name: string, find: () => Element | null) => void;
  // ポインタを要素の上へ(ブラウザと同じく pointerover と pointerenter を送る。React は over から enter を作り、
  //   Solid は enter のリスナーを要素へ直接付けるため)。
  hover: (target: Element) => void;
  // props を差し替える(渡したものだけ。rows は制御された行の値を差し替える)。
  setProps: (patch: Record<string, unknown>) => Promise<void>;
  rows: () => readonly unknown[];
  // 命令的 API の戻り値などを通知と同じ列へ控える(React 版と同じ値か)。
  log: (label: string, value: unknown) => void;
};

export type ParityScenario = {
  // 両方へ渡す props(呼ぶたびに新しいオブジェクト。rows は制御された行の初期値になる)。描く関数(renderCell など)や
  //   style の書き方(React は camelCase、Solid は kebab-case)を分けたいときは framework を見る。
  props: (framework: Framework) => Record<string, unknown>;
  // 引数ごと控える通知の名前(props に無ければ控えるだけの関数を入れる)。
  watch?: readonly string[];
  // rows を制御する(onRowsChange で受けた行へ差し替える)。既定 true。
  controlledRows?: boolean;
  steps: (ctx: ParityContext) => Promise<void>;
};

export type ParityResult = {
  snapshots: { label: string; dom: string }[];
  calls: string[];
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const sanitize = (value: unknown, depth = 0): unknown => {
  if (value === undefined) {
    return '<undefined>';
  }
  if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'function') {
    return '<fn>';
  }
  if (typeof Event !== 'undefined' && value instanceof Event) {
    return `<event ${value.type}>`;
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return `<node ${(value as Element).tagName ?? value.nodeName}>`;
  }
  if (depth > 5) {
    return '<deep>';
  }
  if (value instanceof Set) {
    return { set: Array.from(value, (item) => sanitize(item, depth + 1)) };
  }
  if (value instanceof Map) {
    return { map: Array.from(value, ([key, item]) => [sanitize(key, depth + 1), sanitize(item, depth + 1)]) };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    result[key] = sanitize((value as Record<string, unknown>)[key], depth + 1);
  }
  return result;
};

// フォーカスのある要素(タグと class。グリッドの外なら「外」)。
const describeFocus = (container: HTMLElement): string => {
  const active = document.activeElement;
  if (!active || active === document.body) {
    return 'なし';
  }
  if (!container.contains(active)) {
    return `外 <${active.tagName.toLowerCase()}>`;
  }
  const classes = Array.from(active.classList).sort().join('.');
  const columnKey = active.getAttribute('data-ssg-col-key');
  return `<${active.tagName.toLowerCase()}${classes ? `.${classes}` : ''}${columnKey ? ` col=${columnKey}` : ''}>`;
};

// id を指す属性の参照先が document に無いもの(参照切れ)。React 版には無いので、Solid 版にあれば差になる。
const ID_REFERENCE_SELECTOR = '[aria-activedescendant], [aria-owns], [aria-controls], [aria-labelledby], [aria-describedby]';
const ID_REFERENCE_NAMES = ['aria-activedescendant', 'aria-owns', 'aria-controls', 'aria-labelledby', 'aria-describedby'];
const findDanglingIdReferences = (roots: readonly Element[]): string[] => {
  const result: string[] = [];
  for (const root of roots) {
    const elements = [root, ...Array.from(root.querySelectorAll(ID_REFERENCE_SELECTOR))];
    for (const element of elements) {
      for (const name of ID_REFERENCE_NAMES) {
        const value = element.getAttribute(name);
        if (value === null) {
          continue;
        }
        for (const id of value.split(/\s+/).filter(Boolean)) {
          if (document.getElementById(id) === null) {
            result.push(`参照切れ: <${element.tagName.toLowerCase()} class="${element.className}"> ${name}`);
          }
        }
      }
    }
  }
  return result;
};

const collectPortals = (container: HTMLElement): Element[] =>
  Array.from(document.body.children).filter((element) => element !== container && element.matches('[class*="ssg-"]'));

async function runOne(framework: Framework, scenario: ParityScenario): Promise<ParityResult> {
  const container = document.createElement('div');
  document.body.append(container);
  const snapshots: ParityResult['snapshots'] = [];
  const calls: string[] = [];
  const initial = scenario.props(framework);
  const controlledRows = scenario.controlledRows ?? Array.isArray(initial.rows);
  let currentRows: readonly unknown[] = (initial.rows as readonly unknown[] | undefined) ?? [];
  let handle: ParityHandle | null = null;

  const record = (name: string, args: unknown[]) => {
    calls.push(`${name} ${JSON.stringify(sanitize(args))}`);
  };
  const wrapCallbacks = (props: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...props };
    for (const name of scenario.watch ?? []) {
      const original = props[name];
      next[name] = (...args: unknown[]) => {
        record(name, args);
        return typeof original === 'function' ? (original as (...a: unknown[]) => unknown)(...args) : undefined;
      };
    }
    return next;
  };

  let setReactProps: ((patch: Record<string, unknown>) => void) | null = null;
  let setReactRows: ((rows: readonly unknown[]) => void) | null = null;
  let setSolidProps: ((patch: Record<string, unknown>) => void) | null = null;
  let setSolidRows: ((rows: readonly unknown[]) => void) | null = null;
  let unmount: () => void;

  const baseProps = wrapCallbacks(initial);
  const onRowsChangeOf = (props: Record<string, unknown>, setRows: (rows: readonly unknown[]) => void) => {
    const original = props.onRowsChange as ((rows: readonly unknown[]) => void) | undefined;
    if (!controlledRows) {
      return original;
    }
    return (next: readonly unknown[]) => {
      original?.(next);
      currentRows = next;
      setRows(next);
    };
  };

  if (framework === 'react') {
    const ReactGrid = await loadReactGrid();
    const root = createRoot(container);
    function Host() {
      const [props, setProps] = useState(baseProps);
      const [rows, setRows] = useState(currentRows);
      setReactProps = (patch) => setProps((previous) => ({ ...previous, ...wrapCallbacks(patch) }));
      setReactRows = setRows;
      return createElement(ReactGrid, {
        ...props,
        ...(controlledRows ? { rows, onRowsChange: onRowsChangeOf(props, setRows) } : null),
        ref: (value: ParityHandle | null) => {
          if (value) {
            handle = value;
          }
        },
      });
    }
    await reactAct(async () => {
      root.render(createElement(Host));
    });
    unmount = () => {
      void reactAct(() => root.unmount());
    };
  } else {
    unmount = render(() => {
      const [props, setProps] = createSignal(baseProps);
      const [rows, setRows] = createSignal<readonly unknown[]>(currentRows);
      setSolidProps = (patch) => setProps((previous) => ({ ...previous, ...wrapCallbacks(patch) }));
      setSolidRows = (next) => setRows(() => next);
      const Grid = SpreadsheetGrid as unknown as (props: Record<string, unknown>) => ReturnType<typeof SpreadsheetGrid>;
      return (
        <Grid
          {...props()}
          {...(controlledRows ? { rows: rows(), onRowsChange: onRowsChangeOf(props(), (next) => setRows(() => next)) } : {})}
          ref={(value: ParityHandle) => {
            handle = value;
          }}
        />
      );
    }, container);
    flush();
  }

  const settle = async (waitMs: number) => {
    const frames = Math.max(3, Math.ceil(waitMs / 20));
    if (framework === 'react') {
      await reactAct(async () => {
        for (let index = 0; index < frames; index += 1) {
          await sleep(20);
        }
      });
    } else {
      for (let index = 0; index < frames; index += 1) {
        flush();
        await sleep(20);
      }
      flush();
    }
  };
  await settle(60);

  const query = (selector: string): HTMLElement => {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`[${framework}] 見つかりません: ${selector}`);
    }
    return element;
  };

  const tracked = new Map<string, { find: () => Element | null; element: Element | null }>();
  const ctx: ParityContext = {
    framework,
    container,
    act: async (fn, waitMs = 60) => {
      if (framework === 'react') {
        await reactAct(async () => {
          await fn();
        });
      } else {
        await fn();
        flush();
      }
      await settle(waitMs);
    },
    snapshot: (label) => {
      const roots = [container, ...collectPortals(container)];
      const lines = [normalizeDom(roots), `フォーカス: ${describeFocus(container)}`, ...findDanglingIdReferences(roots)];
      for (const [name, entry] of tracked) {
        const now = entry.find();
        lines.push(`要素 ${name}: ${now === null ? 'なし' : now === entry.element ? '同じ' : '作り直し'}`);
      }
      snapshots.push({ label, dom: lines.join('\n') });
    },
    track: (name, find) => {
      tracked.set(name, { find, element: find() });
    },
    shell: () => query('.ssg-shell'),
    cell: (row, key, pane) =>
      query(`.ssg-body-row[data-row-index="${row}"]${pane ? `[data-pane="${pane}"]` : ''} [data-ssg-col-key="${key}"]`),
    header: (key) => query(`.ssg-header-cell[data-ssg-col-key="${key}"]`),
    handle: () => {
      if (!handle) {
        throw new Error(`[${framework}] ハンドルがありません`);
      }
      return handle;
    },
    setProps: async (patch) => {
      const { rows: nextRows, ...rest } = patch;
      await ctx.act(() => {
        if (framework === 'react') {
          setReactProps?.(rest);
          if (nextRows !== undefined) {
            currentRows = nextRows as readonly unknown[];
            setReactRows?.(currentRows);
          }
        } else {
          setSolidProps?.(rest);
          if (nextRows !== undefined) {
            currentRows = nextRows as readonly unknown[];
            setSolidRows?.(currentRows);
          }
        }
      });
    },
    rows: () => currentRows,
    log: (label, value) => {
      record(label, [value]);
    },
    hover: (target) => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1, isPrimary: true }));
      target.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, pointerId: 1, isPrimary: true }));
    },
  };

  try {
    await scenario.steps(ctx);
  } finally {
    unmount();
    container.remove();
    await sleep(0);
  }
  return { snapshots, calls };
}

// 差を調べるとき: 環境変数 PARITY_DUMP にディレクトリを渡すと、React 版と Solid 版の DOM と通知をファイルへ書き出す
//   (`diff -u <dir>/<名前>.react.txt <dir>/<名前>.solid.txt` で見比べる)。
export async function dumpParity(name: string, react: ParityResult, solid: ParityResult): Promise<void> {
  const dir = typeof process === 'undefined' ? undefined : process.env.PARITY_DUMP;
  if (!dir) {
    return;
  }
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  const base = `${dir}/${name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}`;
  const text = (result: ParityResult) =>
    [...result.snapshots.map((s) => `=== ${s.label}\n${s.dom}`), '=== 通知', ...result.calls].join('\n');
  await writeFile(`${base}.react.txt`, text(react));
  await writeFile(`${base}.solid.txt`, text(solid));
}

// 同じシナリオを React 版 → Solid 版の順に動かす。
export async function runParity(scenario: ParityScenario): Promise<{ react: ParityResult; solid: ParityResult }> {
  const react = await runOne('react', scenario);
  const solid = await runOne('solid', scenario);
  return { react, solid };
}

// React 版と Solid 版で、控えた DOM(操作ごと)と通知が同じことを確かめる。差は PARITY_DUMP で書き出して見る。
export async function expectParity(scenario: ParityScenario): Promise<void> {
  const { react, solid } = await runParity(scenario);
  await dumpParity(expect.getState().currentTestName ?? 'parity', react, solid);
  expect(solid.snapshots.map((s) => s.label)).toEqual(react.snapshots.map((s) => s.label));
  for (let index = 0; index < react.snapshots.length; index += 1) {
    expect(`${solid.snapshots[index]?.label}\n${solid.snapshots[index]?.dom}`).toBe(
      `${react.snapshots[index]?.label}\n${react.snapshots[index]?.dom}`,
    );
  }
  expect(solid.calls).toEqual(react.calls);
}