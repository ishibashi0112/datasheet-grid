// GridDetailLayer(展開行の帯)の配置テストです。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GridDetailLayer } from './GridDetailLayer';

afterEach(() => {
  cleanup();
});

describe('GridDetailLayer の帯の縦位置', () => {
  // 修正(audit V-13): virtualRow.start は行と同じ座標(verticalGeometry が windowBaseOffsetPx を差し引き済み)。
  //   帯はセル行の直下 = start + size に置き、基準オフセットを二重に引きません。
  it('帯の top は virtualRow.start + size(行と同じ座標)', () => {
    const { container } = render(
      <GridDetailLayer
        entries={[{ rowKey: 'r1', virtualRow: { index: 3, start: 1234, size: 30, detailSize: 80 } }]}
        mode="band"
        paneWidth={200}
        cardStickyLeft={0}
        cardWidth={0}
        renderCard={() => null}
      />,
    );
    const band = container.querySelector<HTMLElement>('.ssg-detail-band');
    expect(band).not.toBeNull();
    expect(band?.style.top).toBe('1264px');
    expect(band?.style.height).toBe('80px');
  });
});

// 追加(1.0.2 / 2026-11-09 実アプリの総点検 G-13): フォーカスを持ったカードがスクロールや絞り込みで消えると、フォーカスが body に
//   落ちて矢印キーや Ctrl+C がグリッドに届かなかった。
describe('カードが消えたときのフォーカス(G-13)', () => {
  const entry = { rowKey: 'r1', virtualRow: { index: 0, start: 0, size: 30, detailSize: 80 } };
  const layer = (entries: (typeof entry)[], onCardFocusLost: () => void) => (
    <GridDetailLayer
      entries={entries}
      mode="center"
      paneWidth={200}
      cardStickyLeft={0}
      cardWidth={200}
      renderCard={() => <input data-testid="in-card" />}
      onCardFocusLost={onCardFocusLost}
    />
  );

  it('中にフォーカスがあるまま消えたら onCardFocusLost を呼ぶ。中にフォーカスが無ければ呼ばない', async () => {
    const lost = vi.fn();
    const { rerender, getByTestId } = render(layer([entry], lost));
    getByTestId('in-card').focus();
    rerender(layer([], lost));
    await Promise.resolve();
    expect(lost).toHaveBeenCalledTimes(1);

    lost.mockClear();
    rerender(layer([entry], lost));
    rerender(layer([], lost));
    await Promise.resolve();
    expect(lost).not.toHaveBeenCalled();
  });
});