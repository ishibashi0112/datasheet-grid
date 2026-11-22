// サーバーで描いた HTML の確かめ(React 版の SpreadsheetGrid.initialState.ssr / ssrCurrentTime.ssr と同じ)。
import { describe, expect, inject, it } from 'vitest';
import { READS_CURRENT_TIME } from './fixtures';

const server = () => inject('ssrServerOutput');

function textOf(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
}

describe('サーバーで描く', () => {
  // 変更(段階 4 の測り直し S8-01 / S2-22): サーバーは行・件数を描かない(タイムゾーンや今日がブラウザと違うと結果が変わり、
  //   Solid のハイドレーションはその食い違いを直さないため)。条件の表示は状態だけで決まるので描く。行と件数はハイドレーションの
  //   後に出る(hydrate.initialState.test.tsx)。React 版はサーバーで件数まで描き、食い違えばクライアントで描き直す。
  it('initialState の条件の表示はサーバーの HTML から出し、行と件数は描かない', () => {
    const text = textOf(server().pages.initialState ?? '');
    expect(text).toContain('並び替え: 数量(降順)');
    expect(text).toContain('絞り込み: 1 列');
    expect(text).not.toMatch(/行 \d+ \/ \d+/);
    for (const name of ['alpha', 'bravo', 'charlie', 'delta']) {
      expect(text).not.toContain(name);
    }
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