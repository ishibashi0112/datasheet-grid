// 追加(監査 L-03 / L-04): TSV の解釈 / 出力が Excel / Google スプレッドシート互換であることを固定します。
import { describe, expect, it } from 'vitest';
import { escapeTsvField, joinTsvRow, parseClipboardText, serializeSelectionToTsv } from './clipboard';
import type { GridColumn } from '../model/gridTypes.unbound';

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
});
