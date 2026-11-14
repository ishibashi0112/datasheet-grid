// 追加(監査 L-03 / L-04): TSV の解釈 / 出力が Excel / Google スプレッドシート互換であることを固定します。
import { describe, expect, it } from 'vitest';
import {
  applyClipboardMatrixToRows,
  escapeTsvField,
  joinTsvRow,
  parseClipboardText,
  resolvePasteColumnIndexes,
  serializeSelectionToTsv,
} from './clipboard';
import type { GridColumn } from '../model/gridTypes.unbound';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '../logic/rowReorder';
import { DETAIL_TOGGLE_COLUMN_KEY } from '../logic/detailRow';

describe('parseClipboardText(監査 L-03 / L-04)', () => {
  it('基本: タブ区切り / CRLF / 末尾改行の最後の空行だけ落とす', () => {
    expect(parseClipboardText('')).toEqual([]);
    expect(parseClipboardText('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseClipboardText('a\tb')).toEqual([['a', 'b']]);
  });

  it('途中の空行を保持する(1 列 3 セルの中央が空)', () => {
    expect(parseClipboardText('a\r\n\r\nb\r\n')).toEqual([['a'], [''], ['b']]);
    // 空セル 1 つのコピー
    expect(parseClipboardText('\r\n')).toEqual([['']]);
  });

  it('引用符付きセル: セル内改行 / タブ / "" を解釈する', () => {
    expect(parseClipboardText('"line1\nline2"\tx\r\n')).toEqual([['line1\nline2', 'x']]);
    expect(parseClipboardText('"a\tb"\t"say ""hi"""\r\nnext\r\n')).toEqual([['a\tb', 'say "hi"'], ['next']]);
    // 引用符内の CRLF は LF へ
    expect(parseClipboardText('"l1\r\nl2"\r\n')).toEqual([['l1\nl2']]);
  });

  it('先頭以外の " は文字どおり、閉じ " の無い先頭 " も文字どおり', () => {
    expect(parseClipboardText('5"\tx')).toEqual([['5"', 'x']]);
    expect(parseClipboardText('"abc\tx\r\ny')).toEqual([['"abc', 'x'], ['y']]);
    // 閉じ " の後ろに文字が続く崩れた形は連結
    expect(parseClipboardText('"ab"cd\tx')).toEqual([['abcd', 'x']]);
  });
});

describe('escapeTsvField / joinTsvRow(監査 L-04)', () => {
  it('改行 / タブ / " を含むセルだけ引用符で囲む', () => {
    expect(escapeTsvField('plain')).toBe('plain');
    expect(escapeTsvField('l1\nl2')).toBe('"l1\nl2"');
    expect(escapeTsvField('a\tb')).toBe('"a\tb"');
    expect(escapeTsvField('5"')).toBe('"5"""');
    expect(joinTsvRow(['a', 'l1\nl2', ''])).toBe('a\t"l1\nl2"\t');
  });

  it('コピー → 貼り付けの往復でセルが保たれる', () => {
    type Row = { a: string; b: string };
    const rows: Row[] = [
      { a: 'l1\nl2', b: 'x' },
      { a: '', b: 'say "hi"' },
      { a: 'tab\there', b: '"lead' },
    ];
    const columns: GridColumn<Row>[] = [
      { key: 'a', title: 'A', width: 80 },
      { key: 'b', title: 'B', width: 80 },
    ];
    const tsv = serializeSelectionToTsv((i) => rows[i], rows.length, columns, {
      type: 'cell',
      range: { start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
    });
    expect(parseClipboardText(tsv)).toEqual(rows.map((r) => [r.a, r.b]));
  });

  // 追加(1.0.2 / 2026-11-09 実アプリの総点検の確かめ直し RV-C1): 最後の行のセルがすべて空なら末尾に改行を 1 つ足す
  //   (Excel のコピーと同じ形)。足さないと 1 列の範囲の最後の空のセルが、貼り付けで消えていた。
  it('最後の行が空なら末尾に改行を足し、貼り付けで行の数が変わらない', () => {
    type Row = { a: string; b: string };
    const rows: Row[] = [
      { a: 'x', b: 'y' },
      { a: '', b: '' },
    ];
    const getRow = (index: number) => rows[index] as Row;
    const columns: GridColumn<Row>[] = [
      { key: 'a', title: 'A', width: 80 },
      { key: 'b', title: 'B', width: 80 },
    ];
    const oneColumn = serializeSelectionToTsv(getRow, 2, columns, { type: 'col', startCol: 0, endCol: 0 });
    expect(oneColumn).toBe('x\n\n');
    expect(parseClipboardText(oneColumn)).toEqual([['x'], ['']]);
    const twoColumns = serializeSelectionToTsv(getRow, 2, columns, { type: 'row', startRow: 0, endRow: 1 });
    expect(twoColumns).toBe('x\ty\n\t\n');
    expect(parseClipboardText(twoColumns)).toEqual([['x', 'y'], ['', '']]);
    // 空のセル 1 つも、貼り付けると 1 つの空のセルになる(これまでは '' で何も貼られなかった)
    const single = serializeSelectionToTsv(getRow, 2, columns, {
      type: 'cell',
      range: { start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
    });
    expect(single).toBe('\n');
    expect(parseClipboardText(single)).toEqual([['']]);
    // 最後の行に値があれば今までどおり改行を足さない(途中の空の行はそのまま)
    const reversed = serializeSelectionToTsv((index) => [rows[1], rows[0]][index] as Row, 2, columns, {
      type: 'col',
      startCol: 0,
      endCol: 0,
    });
    expect(reversed).toBe('\nx');
    expect(parseClipboardText(reversed)).toEqual([[''], ['x']]);
  });
});

describe('合成列はコピー / 貼り付けの列に数えない(1.0 前の最終チェック FC-03)', () => {
  type Row = { a: string; b: string };
  const columns: GridColumn<Row>[] = [
    { key: ROW_DRAG_HANDLE_COLUMN_KEY, title: '', width: 28 },
    { key: DETAIL_TOGGLE_COLUMN_KEY, title: '', width: 28 },
    { key: 'a', title: 'A', width: 80 },
    { key: 'b', title: 'B', width: 80 },
  ];
  const rows: Row[] = [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ];
  const getRow = (index: number) => rows[index];

  it('行選択 / 列選択 / セル範囲のどれでも合成列を出さない', () => {
    expect(serializeSelectionToTsv(getRow, 2, columns, { type: 'row', startRow: 0, endRow: 1 })).toBe('1\t2\n3\t4');
    expect(serializeSelectionToTsv(getRow, 2, columns, { type: 'col', startCol: 0, endCol: 2 })).toBe('1\n3');
    expect(
      serializeSelectionToTsv(getRow, 2, columns, { type: 'cell', range: { start: { row: 0, col: 1 }, end: { row: 0, col: 3 } } }),
    ).toBe('1\t2');
    // 合成列だけの範囲は何もコピーしない
    expect(serializeSelectionToTsv(getRow, 2, columns, { type: 'col', startCol: 0, endCol: 1 })).toBe('');
  });

  it('貼り付けの列は合成列を飛ばして数え、列の数を超えたぶんは連番', () => {
    expect(resolvePasteColumnIndexes(columns, 0, 2)).toEqual([2, 3]);
    expect(resolvePasteColumnIndexes(columns, 1, 3)).toEqual([2, 3, 4]);
    expect(resolvePasteColumnIndexes(columns, 3, 2)).toEqual([3, 4]);
    const next = applyClipboardMatrixToRows(rows, (i) => i, columns, [['x', 'y']], 0, 0, () => true);
    expect(next[0]).toEqual({ a: 'x', b: 'y' });
  });
});