// 追加(UP-1)の view テスト: 統合ツールパネルのシェル(ToolPanel)の配線を固定します。
//   - SegmentedControl: タブの描画 / クリックで onSelectTab(アクティブタブの再クリックは
//     発火しない)/ 件数バッジ(0 / undefined は非表示)。
//   - × クローズで onRequestClose。
//   - activeTab=null / layout=null では描画しない。
//   - children(アクティブタブのコンテンツ)の描画。
//   - ヘッダードラッグ(usePanelHeaderDrag / FM-4)の配線
//     (旧 FilterManagementPanel.test.tsx から移設。共有フックのため本シェルで固定します)。
//   CSS の見た目(インジケータの位置など)は jsdom で検証できないため、構造と
//   コールバック発火のみを固定します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';

import ToolPanel, { type ToolPanelTabDescriptor } from './ToolPanel';
import type {
  ToolPanelLayout,
  ToolPanelTab,
} from '../hooks/useToolPanelController';

afterEach(() => {
  cleanup();
});

const layout: ToolPanelLayout = { top: 20, left: 40, width: 360 };

const makeTabs = (): ToolPanelTabDescriptor[] => [
  { tab: 'filter', label: 'フィルター', badge: 2 },
  { tab: 'columns', label: '列' },
  { tab: 'sort', label: '並び替え', badge: 0 },
];

const makeProps = (activeTab: ToolPanelTab | null = 'columns') => ({
  activeTab,
  flashTick: 0,
  tabs: makeTabs(),
  layout,
  panelRef: createRef<HTMLDivElement>(),
  onSelectTab: vi.fn(),
  onRequestClose: vi.fn(),
  onPanelMove: vi.fn(),
});

describe('ToolPanel(統合ツールパネルのシェル UP-1)', () => {
  it('タブを表示順で描画し、アクティブタブに aria-selected が付く', () => {
    render(<ToolPanel {...makeProps('columns')}>content</ToolPanel>);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'フィルター2',
      '列',
      '並び替え',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('非アクティブタブのクリックで onSelectTab(tab)、アクティブタブの再クリックは発火しない', () => {
    const props = makeProps('columns');
    render(<ToolPanel {...props}>content</ToolPanel>);
    fireEvent.click(screen.getByRole('tab', { name: /フィルター/ }));
    expect(props.onSelectTab).toHaveBeenCalledWith('filter');
    fireEvent.click(screen.getByRole('tab', { name: '列' }));
    expect(props.onSelectTab).toHaveBeenCalledTimes(1);
  });

  it('件数バッジは正の値のみ表示する(0 / undefined は非表示)', () => {
    render(<ToolPanel {...makeProps()}>content</ToolPanel>);
    // filter: badge=2 → 表示 / columns: undefined・sort: 0 → 非表示。
    const badges = document.querySelectorAll('.ssg-toolpanel-seg-badge');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toBe('2');
  });

  it('× で onRequestClose を呼ぶ / children を描画する', () => {
    const props = makeProps();
    render(<ToolPanel {...props}>タブコンテンツ</ToolPanel>);
    expect(screen.getByText('タブコンテンツ')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('activeTab=null / layout=null では描画しない', () => {
    const closed = makeProps(null);
    const { unmount } = render(<ToolPanel {...closed}>content</ToolPanel>);
    expect(screen.queryByRole('tab')).toBeNull();
    unmount();

    const noLayout = { ...makeProps(), layout: null };
    render(<ToolPanel {...noLayout}>content</ToolPanel>);
    expect(screen.queryByRole('tab')).toBeNull();
  });

  // 移設(FM-4 → UP-1): ヘッダードラッグ(usePanelHeaderDrag)の配線固定です。
  it('ヘッダードラッグで onPanelMove(開始位置+差分) を呼び、pointerup 後は呼ばない(FM-4)', () => {
    const props = makeProps();
    render(<ToolPanel {...props}>content</ToolPanel>);
    const header = document.querySelector('.ssg-toolpanel-header') as HTMLElement;
    expect(header.classList.contains('ssg-popover-header--draggable')).toBe(
      true,
    );
    fireEvent.pointerDown(header, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 60,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 130, clientY: 90 });
    // layout = { top: 20, left: 40 } + 差分(+30, +30)です。
    expect(props.onPanelMove).toHaveBeenLastCalledWith(50, 70);
    // pointerId 不一致の move は無視されます。
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 999, clientY: 999 });
    expect(props.onPanelMove).toHaveBeenCalledTimes(1);
    // pointerup 後の move では呼ばれません(リスナー解除)。
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(props.onPanelMove).toHaveBeenCalledTimes(1);
  });

  it('ヘッダー内の button(SegmentedControl / × 閉じる)からはドラッグを開始しない(FM-4)', () => {
    const props = makeProps();
    render(<ToolPanel {...props}>content</ToolPanel>);
    fireEvent.pointerDown(screen.getByLabelText('閉じる'), {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(props.onPanelMove).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('tab', { name: /フィルター/ }), {
      button: 0,
      pointerId: 2,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 50, clientY: 50 });
    expect(props.onPanelMove).not.toHaveBeenCalled();
  });

  // 追加(UP-2 / 既開時フラッシュ): flashTick の変化でパネル枠へ --flash クラスが直付けされ、
  //   animationend で除去されること。クラスは className prop ではなく JS 直付けのため、
  //   flashTick を変えた再レンダーでも(props 変化による再レンダーで)消えないことを確認します。
  it('flashTick が増えると --flash クラスが付き、animationend で除去される(UP-2)', () => {
    const panelRef = createRef<HTMLDivElement>();
    const base = { ...makeProps(), panelRef };
    const { rerender } = render(
      <ToolPanel {...base} flashTick={0}>
        content
      </ToolPanel>,
    );
    const panel = panelRef.current as HTMLDivElement;
    expect(panel).toBeTruthy();
    // flashTick=0(初期)ではフラッシュしません。
    expect(panel.classList.contains('ssg-toolpanel--flash')).toBe(false);

    // flashTick を増やすと --flash が付きます(既開時 open 相当)。
    rerender(
      <ToolPanel {...base} flashTick={1}>
        content
      </ToolPanel>,
    );
    expect(panel.classList.contains('ssg-toolpanel--flash')).toBe(true);

    // props 変化による再レンダー(flashTick 据え置き)ではクラスは残ります(直付けのため)。
    rerender(
      <ToolPanel {...base} flashTick={1}>
        content-changed
      </ToolPanel>,
    );
    expect(panel.classList.contains('ssg-toolpanel--flash')).toBe(true);

    // animationend で除去されます。
    fireEvent.animationEnd(panel);
    expect(panel.classList.contains('ssg-toolpanel--flash')).toBe(false);

    // さらに flashTick を増やすと再びフラッシュします(連続既開 open)。
    rerender(
      <ToolPanel {...base} flashTick={2}>
        content-changed
      </ToolPanel>,
    );
    expect(panel.classList.contains('ssg-toolpanel--flash')).toBe(true);
  });
});