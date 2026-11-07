import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GridColumn } from '../model/gridTypes.unbound';
import { setCellValue } from './permissions';

type Row = { first: string; last: string; price?: number };

describe('setCellValue の計算列への書き込みの開発時の警告(dogfood DD-05)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getValue だけの列へ書くと、行に無いプロパティが足されることを列ごとに 1 回だけ知らせる', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const column: GridColumn<Row> = {
      key: 'fullNameDd05',
      width: 120,
      title: '氏名',
      getValue: (row) => `${row.last} ${row.first}`,
    };
    const row: Row = { first: '太郎', last: '山田' };

    const next = setCellValue(row, column, '佐藤 花子');
    setCellValue(next, column, '鈴木 一郎');
    setCellValue(row, column, '高橋 次郎');

    // 書き込み自体は従来どおり(key の浅いコピー)。
    expect(next).toEqual({ first: '太郎', last: '山田', fullNameDd05: '佐藤 花子' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('`fullNameDd05`');
    expect(String(warn.mock.calls[0]?.[0])).toContain('setValue');
  });

  it('行に key のプロパティがある列(getValue で読み方だけ変える列)と setValue のある列は知らせない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readsOwnKey: GridColumn<Row> = {
      key: 'price',
      width: 120,
      title: '単価',
      getValue: (row) => row.price ?? 0,
    };
    const withSetter: GridColumn<Row> = {
      key: 'fullNameWithSetterDd05',
      width: 120,
      title: '氏名',
      getValue: (row) => `${row.last} ${row.first}`,
      setValue: (row, value) => {
        const [last = '', first = ''] = String(value).split(' ');
        return { ...row, last, first };
      },
    };
    const plain: GridColumn<Row> = { key: 'plainDd05', title: '素の列', width: 120 };

    expect(setCellValue({ first: 'a', last: 'b', price: 1 }, readsOwnKey, 2)).toEqual({ first: 'a', last: 'b', price: 2 });
    expect(setCellValue({ first: 'a', last: 'b' }, withSetter, '佐藤 花子')).toEqual({ first: '花子', last: '佐藤' });
    setCellValue({ first: 'a', last: 'b' }, plain, 'x');

    expect(warn).not.toHaveBeenCalled();
  });
});