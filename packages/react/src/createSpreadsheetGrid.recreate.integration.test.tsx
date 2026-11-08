// 追加(段階 2 DU-26): コンポーネントの中で createSpreadsheetGrid を呼ぶと、描くたびに別のコンポーネントになり、グリッドが
//   作り直されます(選択・スクロール位置・編集中の値が毎回消える)。これまでは開発時にも何も言われませんでした。
//   「グリッドが表示されている間に作ったコンポーネントが、同じ場所(同じ rows)で前のグリッドと入れ替わった」ときに、
//   開発時だけ 1 回警告します。モジュールの先頭で作ったコンポーネントの切り替え(タブなど)と StrictMode では出しません。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StrictMode, useMemo } from 'react';

import { createSpreadsheetGrid } from './createSpreadsheetGrid';
import { resetRecreatedGridWarning } from './hooks/useRecreatedGridWarning';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }];

const GridA = createSpreadsheetGrid({ features: {} });
const GridB = createSpreadsheetGrid({ features: {} });

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  resetRecreatedGridWarning();
  vi.restoreAllMocks();
});

const recreatedWarnings = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.filter(([message]) => String(message).includes('createSpreadsheetGrid'));

function InsideComponent({ tick }: { tick: number }) {
  // わざとコンポーネントの中で作ります(検出したい間違い)。
  const Grid = createSpreadsheetGrid({ features: {} });
  return (
    <div data-tick={tick}>
      {/* eslint-disable-next-line react-hooks/static-components -- 描くたびに作り直す間違いを再現するテストです。 */}
      <Grid rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />
    </div>
  );
}

describe('コンポーネントの中で createSpreadsheetGrid を呼んだときの警告(DU-26)', () => {
  it('描き直しでグリッドが作り直されたら、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(<InsideComponent tick={0} />);
    expect(recreatedWarnings(warn)).toHaveLength(0);
    rerender(<InsideComponent tick={1} />);
    rerender(<InsideComponent tick={2} />);
    expect(recreatedWarnings(warn)).toHaveLength(1);
  });

  it('モジュールの先頭で作ったコンポーネントを切り替える(タブなど)だけなら警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Switcher = ({ tab }: { tab: 'a' | 'b' }) =>
      tab === 'a' ? (
        <GridA rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />
      ) : (
        <GridB rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />
      );
    const { rerender } = render(<Switcher tab="a" />);
    rerender(<Switcher tab="b" />);
    rerender(<Switcher tab="a" />);
    rerender(<Switcher tab="a" />);
    expect(recreatedWarnings(warn)).toHaveLength(0);
  });

  it('useMemo で 1 回だけ作るなら、StrictMode でも描き直しでも警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Memoized({ tick }: { tick: number }) {
      const Grid = useMemo(() => createSpreadsheetGrid({ features: {} }), []);
      return (
        <div data-tick={tick}>
          {/* eslint-disable-next-line react-hooks/static-components -- useMemo で 1 回だけ作る形(警告しないこと)を確かめるテストです。 */}
          <Grid rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />
        </div>
      );
    }
    const { rerender } = render(
      <StrictMode>
        <Memoized tick={0} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <Memoized tick={1} />
      </StrictMode>,
    );
    expect(recreatedWarnings(warn)).toHaveLength(0);
  });
});