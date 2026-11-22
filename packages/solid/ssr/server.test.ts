// サーバーで描いた HTML の確かめ(React 版の SpreadsheetGrid.initialState.ssr / ssrCurrentTime.ssr と同じ)。
import { describe, expect, inject, it } from 'vitest';
import { READS_CURRENT_TIME } from './fixtures';

const server = () => inject('ssrServerOutput');

function textOf(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
}

describe('サーバーで描く', () => {
  it('initialState の絞り込みと並べ替えはサーバーの HTML から効く', () => {
    const text = textOf(server().pages.initialState ?? '');
    expect(text).toContain('行 2 / 4');
    expect(text).toContain('並び替え: 数量(降順)');
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