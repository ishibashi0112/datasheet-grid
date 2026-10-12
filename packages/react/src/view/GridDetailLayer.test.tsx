// GridDetailLayer(展開行の帯)の配置テストです。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
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