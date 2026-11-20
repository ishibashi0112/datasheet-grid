// デモの「サーバーサイド」のサーバーの代わり。ブラウザの中に行を持ち、遅延を付けて返します(実際のアプリでは API の呼び出し)。
//   - 上部バーの検索(globalText)は品名、列フィルターは text の部分一致だけ、並べ替えは 1 つ目の基準だけを見ます。
//   - 検索に「エラー」を含めると取得に失敗します(エラーバーの再試行を試す)。
//   - 品名を「失敗」に書き換えると保存に失敗します(値が戻り、セルの印と保存の失敗のバーが出る)。
import type { ServerSideDataSource } from '@ishibashi0112/spreadsheet-grid-core';

const READ_DELAY_MS = 500;
const SAVE_DELAY_MS = 600;

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export function createFakeDataSource<T extends { id: number; name: string }>(initialRows: readonly T[]): ServerSideDataSource<T> {
  let data = initialRows.slice();
  return {
    blockSize: 100,
    initialRowCount: data.length,
    getRows: async ({ startIndex, endIndex, query, signal }) => {
      await delay(READ_DELAY_MS, signal);
      const text = query.globalText?.trim() ?? '';
      if (text.includes('エラー')) {
        throw new Error('擬似サーバーの失敗');
      }
      let rows = text ? data.filter((row) => row.name.includes(text)) : data;
      for (const [key, filter] of Object.entries(query.columnFilters ?? {})) {
        if (filter.kind === 'text') {
          rows = rows.filter((row) => String((row as Record<string, unknown>)[key] ?? '').includes(filter.value));
        }
      }
      const sort = query.sort?.[0];
      if (sort) {
        const sign = sort.direction === 'asc' ? 1 : -1;
        const valueOf = (row: T) => (row as Record<string, unknown>)[sort.columnKey];
        rows = rows.slice().sort((a, b) => {
          const av = valueOf(a);
          const bv = valueOf(b);
          const diff = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ja');
          return diff * sign || a.id - b.id;
        });
      }
      return { rows: rows.slice(startIndex, endIndex), totalRowCount: rows.length };
    },
    updateRows: async ({ updates }) => {
      await delay(SAVE_DELAY_MS);
      if (updates.some((update) => update.row.name === '失敗')) {
        throw new Error('擬似サーバーの保存の失敗');
      }
      const byKey = new Map(updates.map((update) => [update.rowKey, update.row]));
      data = data.map((row) => byKey.get(row.id) ?? row);
    },
  };
}