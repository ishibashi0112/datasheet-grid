// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-08): select 列の表示名(label)と値(value)の読み替えと、コピー / エクスポートの
//   セルの文字(formatCellClipboardText)。
import { describe, expect, it } from 'vitest';
import type { GridColumn, GridSelectEditorOption } from '../model/gridTypes.unbound';
import { formatCellClipboardText, resolveSelectLabelParser } from './selectLabels';
import { resolveCellParser } from './editorValues';
import { createGroupSubtotalLineGetter } from './groupExport';

type Row = { id: number; kind: string; group?: string };

const OPTIONS: GridSelectEditorOption[] = [
  { value: 'transport', label: '交通費' },
  { value: 'meal', label: '会議費' },
  // 同じ label が 2 つあれば先の候補。
  { value: 'meal2', label: '会議費' },
];

const labelColumn: GridColumn<Row> = {
  key: 'kind',
  title: '区分',
  width: 100,
  editor: { type: 'select', options: OPTIONS, clipboard: 'label' },
};

describe('formatCellClipboardText', () => {
  it("'label' の select 列は候補の label、候補に無い値と空はその文字", () => {
    const row = { id: 1, kind: 'transport' };
    expect(formatCellClipboardText(labelColumn, 'transport', row)).toBe('交通費');
    expect(formatCellClipboardText(labelColumn, 'other', row)).toBe('other');
    expect(formatCellClipboardText(labelColumn, null, row)).toBe('');
  });

  it("既定('value')と select 以外の列は値の文字(1.0 と同じ)", () => {
    const row = { id: 1, kind: 'transport' };
    const valueColumn: GridColumn<Row> = { ...labelColumn, editor: { type: 'select', options: OPTIONS } };
    expect(formatCellClipboardText(valueColumn, 'transport', row)).toBe('transport');
    expect(formatCellClipboardText({ key: 'kind', title: '区分', width: 100 }, 'transport', row)).toBe('transport');
    expect(formatCellClipboardText({ key: 'kind', title: '区分', width: 100 }, undefined, row)).toBe('');
  });

  it('formatClipboardValue があればそちらが勝つ。行が無いとき(小計の行)は formatClipboardValue を呼ばない', () => {
    const row = { id: 1, kind: 'transport' };
    const column: GridColumn<Row> = { ...labelColumn, formatClipboardValue: (value) => `<${String(value)}>` };
    expect(formatCellClipboardText(column, 'transport', row)).toBe('<transport>');
    expect(formatCellClipboardText(column, 'transport', undefined)).toBe('交通費');
  });

  it('行に依る候補は行から引く(行が無ければ値の文字)', () => {
    const column: GridColumn<Row> = {
      ...labelColumn,
      editor: {
        type: 'select',
        options: (row) => [{ value: 'transport', label: row.id === 1 ? '交通費 A' : '交通費 B' }],
        clipboard: 'label',
      },
    };
    expect(formatCellClipboardText(column, 'transport', { id: 1, kind: '' })).toBe('交通費 A');
    expect(formatCellClipboardText(column, 'transport', { id: 2, kind: '' })).toBe('交通費 B');
    expect(formatCellClipboardText(column, 'transport', undefined)).toBe('transport');
  });
});

describe('resolveSelectLabelParser / resolveCellParser', () => {
  const row = { id: 1, kind: '' };

  it('label は value へ、value はそのまま、どちらでもない文字は生のまま。前後の空白は外して比べる', () => {
    const parse = resolveCellParser(labelColumn);
    expect(parse('交通費', row)).toBe('transport');
    expect(parse(' 交通費 ', row)).toBe('transport');
    expect(parse('transport', row)).toBe('transport');
    expect(parse(' meal\t', row)).toBe('meal');
    expect(parse('会議費', row)).toBe('meal');
    expect(parse('タクシー', row)).toBe('タクシー');
    expect(parse('', row)).toBe('');
  });

  it("既定('value')は 1.0 と同じ(生のまま)。parseClipboardValue があればそちらが勝つ", () => {
    expect(resolveSelectLabelParser({ ...labelColumn, editor: { type: 'select', options: OPTIONS } })).toBeUndefined();
    expect(resolveCellParser({ ...labelColumn, editor: { type: 'select', options: OPTIONS } })('交通費', row)).toBe('交通費');
    const parse = resolveCellParser({ ...labelColumn, parseClipboardValue: (raw) => `[${raw}]` });
    expect(parse('交通費', row)).toBe('[交通費]');
  });
});

describe('小計の行(groupExport)', () => {
  it("グループ元の列の文字は 'label' の select 列なら label(formatClipboardValue と同じ規則)", () => {
    const rows: Row[] = [{ id: 1, kind: 'transport' }];
    const lineAt = createGroupSubtotalLineGetter<Row>({
      order: [-1, 0],
      groups: [{ kind: 'group', groupKey: 'k', columnKey: 'kind', value: 'transport', label: 'transport', level: 0, leafCount: 1, aggregates: {} }],
      columns: [labelColumn],
      groupColumnKeys: ['kind'],
      getSourceRow: (index) => rows[index],
    });
    expect(lineAt(0)?.texts).toEqual(['交通費 小計']);
  });
});