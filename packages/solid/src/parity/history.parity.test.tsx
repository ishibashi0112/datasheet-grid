// React 版の結合テストのうち、Solid 版でまだ同じ場面を見ていなかったものを、React 版と比べるテストへ移した(段階 4-1。
//   docs/audits/2026-11-22-solid-quality/test-inventory.md)。元に戻す / やり直す・貼り付けで書かなかったセル(onPasteSkipped)・
//   canEditCell に渡る位置・入力の検査と貼り付け。React 版の元のテストは packages/react/src の
//   SpreadsheetGrid.undoRedo / pasteSkipped / canEditCellIndex / validation の各 integration.test.tsx。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { numberParser } from '../index';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number | string | null; locked: string };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: (i + 1) * 10, locked: `L${i + 1}` }));

const columns = [
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number', min: 0 }, validationMode: 'reject' },
  { key: 'locked', title: '固定', width: 80, editable: false },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 900, height: 400 });
});

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const paste = async (ctx: ParityContext, cell: { row: number; col: number } | null, text: string) => {
  if (cell) {
    await ctx.act(() => {
      call(ctx, 'selectCell', cell.row, cell.col);
    });
  }
  await ctx.act(() => {
    fireEvent.paste(ctx.shell(), { clipboardData: { getData: () => text } });
  });
};

const key = async (ctx: ParityContext, init: KeyboardEventInit & { key: string }, target?: Element) => {
  await ctx.act(() => {
    fireEvent.keyDown(target ?? ctx.shell(), init);
  });
};

// 履歴の可否と、行が初めの配列(参照そのもの)へ戻ったかを控える。
const logHistory = (ctx: ParityContext, label: string, initial: readonly unknown[] | null) => {
  ctx.log(label, {
    canUndo: call(ctx, 'canUndo'),
    canRedo: call(ctx, 'canRedo'),
    backToInitial: initial === null ? null : ctx.rows() === initial,
    names: ctx.rows().map((row) => (row as Row).name),
  });
};

describe('元に戻す / やり直す(undoRedo)', () => {
  it('貼り付け → Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y・ハンドル・新しい編集で redo を捨てる・履歴の上限', async () => {
    let initial: readonly unknown[] | null = null;
    await expectParity({
      props: () => {
        const rows = makeRows(5);
        initial = rows;
        return { rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300, undoHistoryLimit: 2 };
      },
      watch: ['onRowsChange', 'onUndoRedoStateChange'],
      steps: async (ctx) => {
        logHistory(ctx, '最初', initial);
        await paste(ctx, { row: 0, col: 0 }, 'EDITED');
        logHistory(ctx, '貼り付け', initial);
        await key(ctx, { key: 'z', ctrlKey: true });
        logHistory(ctx, 'Ctrl+Z', initial);
        ctx.snapshot('元に戻した');
        await key(ctx, { key: 'z', ctrlKey: true, shiftKey: true });
        logHistory(ctx, 'Ctrl+Shift+Z', initial);
        await key(ctx, { key: 'z', metaKey: true });
        await key(ctx, { key: 'y', ctrlKey: true });
        logHistory(ctx, 'Cmd+Z → Ctrl+Y', initial);
        // 新しい編集で redo の系譜を捨てる。
        await ctx.act(() => {
          call(ctx, 'undo');
        });
        await paste(ctx, { row: 1, col: 0 }, 'NEW');
        logHistory(ctx, 'undo の後の新しい編集', initial);
        // 上限 2: 3 回書いて 3 回戻すと、最初の 1 回は戻らない。
        await paste(ctx, { row: 2, col: 0 }, 'A');
        await paste(ctx, { row: 3, col: 0 }, 'B');
        await ctx.act(() => {
          call(ctx, 'undo');
          call(ctx, 'undo');
          call(ctx, 'undo');
        });
        logHistory(ctx, '上限を超えて戻す', initial);
        await ctx.act(() => {
          call(ctx, 'redo');
          call(ctx, 'clearUndoHistory');
        });
        logHistory(ctx, 'clearUndoHistory', initial);
        ctx.snapshot('最後');
      },
    });
  });

  it('Delete で範囲・Backspace でアクティブセルを消し、undo / redo でアクティブセルと選択とスクロールを戻す', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(200), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onRowsChange', 'onActiveCellChange'],
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'scrollToRow', 150);
        });
        await ctx.act(() => {
          call(ctx, 'selectRange', { start: { row: 150, col: 0 }, end: { row: 151, col: 0 } });
        });
        await key(ctx, { key: 'Delete' });
        ctx.snapshot('Delete');
        await ctx.act(() => {
          call(ctx, 'selectCell', 152, 0);
        });
        await key(ctx, { key: 'Backspace' });
        ctx.snapshot('Backspace');
        await ctx.act(() => {
          call(ctx, 'selectCell', 0, 0);
          call(ctx, 'scrollToRow', 0);
        });
        await key(ctx, { key: 'z', ctrlKey: true }, undefined);
        await ctx.act(() => undefined, 120);
        ctx.log('Backspace を戻した後', {
          active: call(ctx, 'getActiveCell'),
          selection: call(ctx, 'getSelection'),
          range: call(ctx, 'getVisibleRowRange'),
        });
        await key(ctx, { key: 'z', ctrlKey: true });
        await ctx.act(() => undefined, 120);
        ctx.log('Delete を戻した後', { active: call(ctx, 'getActiveCell'), selection: call(ctx, 'getSelection') });
        ctx.snapshot('戻した');
        await key(ctx, { key: 'y', ctrlKey: true });
        await ctx.act(() => undefined, 120);
        ctx.log('やり直した後', { active: call(ctx, 'getActiveCell'), selection: call(ctx, 'getSelection') });
      },
    });
  });

  it('外から rows を差し替えると履歴が消える・applyRows は履歴に積む(undoable: false・関数の形)', async () => {
    await expectParity({
      props: () => ({ rows: makeRows(4), columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      watch: ['onRowsChange', 'onUndoRedoStateChange'],
      steps: async (ctx) => {
        await paste(ctx, { row: 0, col: 0 }, 'EDIT');
        logHistory(ctx, '編集', null);
        await ctx.setProps({ rows: ctx.rows().map((row) => ({ ...(row as Row) })) });
        logHistory(ctx, '外から差し替え', null);
        // applyRows: 外の変更を履歴に積んでから onRowsChange へ渡す。
        await ctx.act(() => {
          call(ctx, 'applyRows', [...ctx.rows(), { id: 99, name: '足した行', qty: 1, locked: '' }]);
        });
        logHistory(ctx, 'applyRows', null);
        await ctx.act(() => {
          call(ctx, 'undo');
        });
        logHistory(ctx, 'applyRows を戻す', null);
        await ctx.act(() => {
          call(ctx, 'redo');
        });
        // 編集の後に undoable: false の外の更新を挟んでも、Ctrl+Z は編集だけを戻す。
        await paste(ctx, { row: 1, col: 0 }, 'EDIT2');
        await ctx.act(() => {
          call(ctx, 'applyRows', (rows: readonly Row[]) => rows.map((row) => (row.id === 3 ? { ...row, name: '外' } : row)), {
            undoable: false,
          });
        });
        logHistory(ctx, 'undoable: false', null);
        await key(ctx, { key: 'z', ctrlKey: true });
        logHistory(ctx, '編集だけを戻す', null);
        // 関数の形は最後に渡した行を受け取る(続けて呼んでも重なる)。
        await ctx.act(() => {
          call(ctx, 'applyRows', (rows: readonly Row[]) => rows.filter((row) => row.id !== 1));
          call(ctx, 'applyRows', (rows: readonly Row[]) => rows.filter((row) => row.id !== 2));
        });
        logHistory(ctx, '関数の形を 2 回', null);
        await key(ctx, { key: 'z', ctrlKey: true });
        await key(ctx, { key: 'z', ctrlKey: true });
        logHistory(ctx, '消した行を戻す', null);
        ctx.snapshot('最後');
      },
    });
  });

  it('readOnly / enableUndoRedo={false} / enableClearOnDelete={false}', async () => {
    for (const extra of [{ readOnly: true }, { enableUndoRedo: false }, { enableClearOnDelete: false }]) {
      await expectParity({
        props: () => ({ rows: makeRows(3), columns, rowKeyGetter: (row: Row) => row.id, height: 300, ...extra }),
        watch: ['onRowsChange', 'onUndoRedoStateChange'],
        steps: async (ctx) => {
          ctx.log('構成', extra);
          await paste(ctx, { row: 0, col: 0 }, 'P');
          await key(ctx, { key: 'Delete' });
          await ctx.act(() => {
            call(ctx, 'selectCell', 1, 0);
          });
          await key(ctx, { key: 'Backspace' });
          await key(ctx, { key: 'z', ctrlKey: true });
          logHistory(ctx, '操作の後', null);
          ctx.snapshot('最後');
        },
      });
    }
  });
});

describe('貼り付けで書かなかったセル(onPasteSkipped)と pasteFillsSelection', () => {
  const skippedSummary = (params: { cells: readonly Record<string, unknown>[] }) =>
    params.cells.map(({ rowKey, rowIndex, columnKey, colIndex, text, reason, value, message }) => ({
      rowKey,
      rowIndex,
      columnKey,
      colIndex,
      text,
      reason,
      value,
      message,
    }));

  it('編集できないセル・reject の列の検査に通らない値・末尾へ足した行・numberParser・英語の文言', async () => {
    for (const variant of ['既定', '末尾へ足す', 'numberParser', '英語'] as const) {
      await expectParity({
        props: () => ({
          rows: makeRows(2),
          columns:
            variant === 'numberParser'
              ? columns.map((column) =>
                  column.key === 'qty'
                    ? { ...column, parseClipboardValue: numberParser({ strip: ['¥', '円'], negativeParentheses: true }) }
                    : column,
                )
              : columns,
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          canEditCell: (_r: number, _c: number, row: Row, column: { key: string }) => !(row.id === 2 && column.key === 'name'),
          ...(variant === '末尾へ足す' ? { createRow: () => ({ id: 100, name: '', qty: null, locked: '' }) } : null),
          ...(variant === '英語' ? { localeText: { enterNumber: 'Enter a number', enterMin: 'Must be {min} or more' } } : null),
        }),
        watch: ['onRowsChange'],
        steps: async (ctx) => {
          const seen: unknown[] = [];
          await ctx.setProps({
            onPasteSkipped: (params: { cells: readonly Record<string, unknown>[] }) => {
              seen.push(skippedSummary(params));
            },
          });
          ctx.log('構成', variant);
          if (variant === '末尾へ足す') {
            await paste(ctx, { row: 1, col: 1 }, '3\n-1');
          } else {
            await paste(ctx, { row: 0, col: 0 }, 'A\t¥12,000\tL1\nB\t-5\tL2');
          }
          ctx.log('onPasteSkipped', seen);
          ctx.log('行', ctx.rows());
          // 書かなかったセルが無ければ呼ばない。
          seen.length = 0;
          await paste(ctx, { row: 0, col: 0 }, 'Z\t7');
          ctx.log('すべて書けた貼り付け', seen);
          ctx.snapshot('最後');
        },
      });
    }
  });

  // 追加(1.3.0 / Solid 版 0.1.2 / 品質の段 2-3): 書けるセルが 1 つも無い貼り付けは onRowsChange も履歴も残さない(S1-03)、
  //   編集できないセルへ貼った空の文字は数えない(S9-04)。
  it('書けるセルの無い貼り付け(S1-03)と、編集できないセルへの空の文字(S9-04)', async () => {
    await expectParity({
      props: () => ({
        rows: makeRows(2),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        createRow: () => ({ id: 100, name: '', qty: null, locked: '' }),
      }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        const seen: unknown[] = [];
        await ctx.setProps({
          onPasteSkipped: (params: { cells: readonly Record<string, unknown>[] }) => {
            seen.push(skippedSummary(params));
          },
        });
        await paste(ctx, { row: 1, col: 2 }, 'L1\nL2');
        ctx.log('書けるセルの無い貼り付け', { seen, canUndo: call(ctx, 'canUndo'), selection: call(ctx, 'getSelection') });
        seen.length = 0;
        await paste(ctx, { row: 0, col: 0 }, 'A\t3\t\nB\t-1\tL2');
        ctx.log('空の文字', { seen, rows: ctx.rows() });
        seen.length = 0;
        await paste(ctx, { row: 0, col: 1 }, '5\t');
        ctx.log('空の文字だけが編集できないセルに重なる', seen);
      },
    });
  });

  it('1 セルのコピーで範囲を埋める(既定)と pasteFillsSelection={false}', async () => {
    for (const fills of [undefined, false]) {
      await expectParity({
        props: () => ({
          rows: makeRows(4),
          columns,
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          ...(fills === false ? { pasteFillsSelection: false } : null),
        }),
        watch: ['onRowsChange', 'onPasteSkipped'],
        steps: async (ctx) => {
          await ctx.act(() => {
            call(ctx, 'selectRange', { start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
          });
          await paste(ctx, null, '7');
          ctx.snapshot('埋めた');
          await key(ctx, { key: 'z', ctrlKey: true });
          ctx.log('1 回で戻る', ctx.rows());
        },
      });
    }
  });
});

describe('canEditCell に渡る位置(RD-4)', () => {
  // 並べ替えた表で「gamma の数量」(表示の 0 行目・元の 2 行目)について呼ばれた引数を、重ねずに控える
  //   (描くたびに呼ぶ回数は React 版と Solid 版で違うので、回数は比べない)。
  let seen = new Set<string>();
  const canEditCell = (rowIndex: number, colIndex: number, row: Row, _column: unknown, ctx: unknown) => {
    if (row.id === 3 && colIndex === 1) {
      seen.add(JSON.stringify({ rowIndex, ctx }));
    }
    return true;
  };
  const rows = (): Row[] => [
    { id: 1, name: 'alpha', qty: 10, locked: '' },
    { id: 2, name: 'beta', qty: 20, locked: '' },
    { id: 3, name: 'gamma', qty: 30, locked: '' },
  ];

  it('貼り付け・Delete・打ち始め・確定で、表示の位置と元の位置・行キーを渡す。表示の位置で弾くと貼り付けも弾く', async () => {
    for (const lockFirst of [false, true]) {
      await expectParity({
        props: () => {
          seen = new Set();
          return {
            rows: rows(),
            columns: columns.slice(0, 2).map((column) => ({ ...column, validationMode: undefined })),
            rowKeyGetter: (row: Row) => row.id,
            height: 300,
            canEditCell: lockFirst ? (rowIndex: number) => rowIndex !== 0 : canEditCell,
          };
        },
        watch: ['onRowsChange'],
        steps: async (ctx) => {
          await ctx.act(() => {
            call(ctx, 'applyState', { sort: [{ columnKey: 'name', direction: 'desc' }] });
          });
          await ctx.act(() => {
            call(ctx, 'setActiveCell', { row: 0, col: 1 });
          });
          seen.clear();
          await paste(ctx, null, '40');
          ctx.log('貼り付け', [...seen]);
          seen.clear();
          await key(ctx, { key: 'Delete' });
          ctx.log('Delete', [...seen]);
          seen.clear();
          await key(ctx, { key: '5' });
          ctx.log('打ち始め', [...seen]);
          const input = document.activeElement;
          seen.clear();
          if (input && input.tagName === 'INPUT') {
            await key(ctx, { key: 'Enter' }, input);
          }
          ctx.log('確定', [...seen]);
          ctx.log('行', ctx.rows());
        },
      });
    }
  });
});

describe('入力の検査と貼り付け・Delete(validation)', () => {
  const validated = [
    { key: 'name', title: '品名', width: 120, validate: ({ value }: { value: unknown }) => (value === '' ? '必須です' : true), validationMode: 'reject' },
    { key: 'memo', title: 'メモ', width: 120, validate: ({ value }: { value: unknown }) => (String(value).length > 3 ? '3 文字まで' : true) },
    { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number', integer: true } },
  ];
  const rows = () => [
    { id: 1, name: 'a', memo: 'ok', qty: 1 },
    { id: 2, name: 'b', memo: 'toolong', qty: 2.5 },
  ];

  it('reject の列は不正なセルだけ飛ばし、mark の列はそのまま書いて印・全角の数字・Delete・getInvalidCells・印を出さない', async () => {
    for (const showValidationMarks of [undefined, false]) {
      await expectParity({
        props: () => ({
          rows: rows(),
          columns: validated,
          rowKeyGetter: (row: { id: number }) => row.id,
          height: 300,
          ...(showValidationMarks === false ? { showValidationMarks } : null),
        }),
        watch: ['onRowsChange'],
        steps: async (ctx) => {
          ctx.snapshot('最初');
          await paste(ctx, { row: 0, col: 0 }, '\tlonger\t１，２００');
          ctx.snapshot('貼り付け');
          await ctx.act(() => {
            call(ctx, 'selectRange', { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
          });
          await key(ctx, { key: 'Delete' });
          ctx.snapshot('Delete');
          ctx.log('getInvalidCells', call(ctx, 'getInvalidCells'));
        },
      });
    }
  });
});