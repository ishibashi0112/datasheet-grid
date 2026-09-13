// 追加(非依存化 ④-1): useGridStore(useSyncExternalStore 購読)の React 側テストです。
//   ① store の dispatch で購読コンポーネントが再描画される
//   ② 同一 act 内の複数 dispatch は 1 回の再描画にまとまる(自動バッチング)
//   ③ no-op dispatch(同一参照)では再描画しない
//   再描画回数は Profiler の onRender(コミット単位)で数えます(レンダー中の変数書き換えを避けるため)。
// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { createGridStore, type GridStore } from '../model/gridStore';
import { createInitialGridUiState } from '../model/gridReducer';
import { gridActions } from '../model/gridActions';
import { useGridStore } from './useGridStore';

afterEach(() => {
  cleanup();
});

function Probe({ store }: { store: GridStore }) {
  const [state] = useGridStore(store);
  return (
    <div data-testid="active">
      {state.activeCell ? `${state.activeCell.row},${state.activeCell.col}` : 'none'}
    </div>
  );
}

const renderProbe = (store: GridStore) => {
  const commits = { count: 0 };
  const view = render(
    <Profiler
      id="probe"
      onRender={() => {
        commits.count += 1;
      }}
    >
      <Probe store={store} />
    </Profiler>,
  );
  return { ...view, commits };
};

describe('useGridStore', () => {
  it('dispatch で再描画され、同一 act 内の複数 dispatch は 1 回にまとまる', () => {
    const store = createGridStore(createInitialGridUiState([]));
    const { getByTestId, commits } = renderProbe(store);
    expect(getByTestId('active').textContent).toBe('none');
    const initialCommits = commits.count;

    act(() => {
      store.dispatch(gridActions.activateCell({ row: 1, col: 1 }));
      store.dispatch(gridActions.activateCell({ row: 2, col: 3 }));
    });
    expect(getByTestId('active').textContent).toBe('2,3');
    expect(commits.count - initialCommits).toBe(1);
  });

  it('no-op dispatch(reducer が同一参照)では再描画しない', () => {
    const initial = createInitialGridUiState([]);
    const store = createGridStore(initial, (state) => state);
    const { commits } = renderProbe(store);
    const initialCommits = commits.count;
    act(() => {
      store.dispatch(gridActions.activateCell({ row: 1, col: 1 }));
    });
    expect(commits.count).toBe(initialCommits);
  });
});