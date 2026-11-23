// サーバーで描いた HTML の確かめ(React 版の SpreadsheetGrid.initialState.ssr / ssrCurrentTime.ssr と同じ)。
import { describe, expect, inject, it } from 'vitest';
import { READS_CURRENT_TIME } from './fixtures';
import { splitServerHtml } from './serverHtml';

const server = () => inject('ssrServerOutput');

describe('サーバーで描く', () => {
  // 変更(段 3-5): サーバーは行も描く(React 版と同じく、行番号・固定列のセル・件数がサーバーの HTML に出る。中央のペインの
  //   セルは列の幅が要るので、React 版と同じくサーバーでは描かない)。ハイドレーションする骨組みは今までどおり行を空として
  //   描いて隠し(サーバーとクライアントで同じになる。S8-01)、すぐ後に行を入れた写し(ハイドレーションしない)を置く。
  //   ブラウザでは描き終わった後に写しを外し、クライアントの行を出す(hydrate.*.test.tsx)。
  it('initialState の条件と、絞り込んで並べ替えた行と件数をサーバーの HTML に出す', () => {
    const { frame, snapshot } = splitServerHtml(server().pages.initialState ?? '');
    expect(frame?.style.display).toBe('none');
    expect(frame?.nextElementSibling).toBe(snapshot);
    // 追加(1.4.1): サーバーの HTML の .ssg-root は写しの 1 つだけ(React 版と同じ)。隠した骨組みには付けない(見せるときに付ける)。
    const element = document.createElement('div');
    element.innerHTML = server().pages.initialState ?? '';
    expect(Array.from(element.querySelectorAll('.ssg-root'))).toEqual([element.querySelector('[data-ssg-ssr-snapshot]')]);
    expect(frame?.classList.contains('ssg-root')).toBe(false);
    // 骨組みは行と件数を持たない(ハイドレーションで使う)。
    expect(frame?.querySelectorAll('.ssg-body-row')).toHaveLength(0);
    expect(frame?.textContent).not.toMatch(/行 \d+ \/ \d+/);
    // 写しはハイドレーションの印を持たない(Solid がサーバーの要素として探さない)。
    expect(snapshot?.querySelector('[_hk]')).toBeNull();
    expect(snapshot?.hasAttribute('_hk')).toBe(false);
    const text = snapshot?.textContent ?? '';
    expect(text).toContain('並び替え: 数量(降順)');
    expect(text).toContain('絞り込み: 1 列');
    expect(text).toContain('行 2 / 4');
    // 名前に r を含む 2 行を数量の降順に(charlie 2 → bravo 1)。行のキーで確かめる。
    const keys = Array.from(snapshot?.querySelectorAll('.ssg-body-row[data-pane="left"]') ?? [], (row) => row.getAttribute('data-row-key'));
    expect(keys).toEqual(['3', '2']);
  });

  it('固定列のセルはサーバーのタイムゾーンで絞り込んだ行で描く(ブラウザで描き直す。hydrate.pinnedDates)', () => {
    const { snapshot } = splitServerHtml(server().pages.pinnedDates ?? '');
    const labels = Array.from(snapshot?.querySelectorAll('[data-pane="left"].ssg-body-row [data-ssg-col-key="label"]') ?? [], (cell) => cell.textContent);
    expect(labels).toEqual(['行1', '行3']);
    expect(snapshot?.textContent).toContain('行 2 / 5');
  });

  it('サーバーサイドの行モデル(dataSource)は写さない(サーバーで行を読まない。骨組みをそのまま見せる)', () => {
    const { frame, snapshot } = splitServerHtml(server().pages.serverSide ?? '');
    expect(frame).toBeNull();
    expect(snapshot).toBeNull();
    const element = document.createElement('div');
    element.innerHTML = server().pages.serverSide ?? '';
    expect(element.querySelectorAll('.ssg-root')).toHaveLength(1);
    expect(element.querySelector<HTMLElement>('.ssg-root')?.style.display).toBe('');
  });

  it('サーバーで描いている間に現在時刻を読まない(日付の列の条件を入れた表だけは条件を解くのに読む)', () => {
    for (const [name, reads] of Object.entries(server().currentTimeReads)) {
      if (READS_CURRENT_TIME.has(name)) {
        expect(reads.length, name).toBeGreaterThan(0);
      } else {
        expect(reads, name).toEqual([]);
      }
    }
  });
});