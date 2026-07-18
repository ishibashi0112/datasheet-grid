// SSRM デモ用のモックデータセットとクエリ適用ロジック(サーバ側)。
// サーバレス関数はステートレスのため、シード固定の決定的生成でリクエスト間の一貫性を担保する。
import type {
  ColumnFilterValue,
  ServerSideQuery,
} from '@ishibashi0112/spreadsheet-grid';

export type OrderRow = {
  id: number;
  code: string;
  customer: string;
  category: string;
  status: string;
  qty: number;
  price: number;
  orderedAt: string;
};

const ROW_COUNT = 50_000;

export const SSRM_CATEGORIES = ['家電', '食品', '衣料', '書籍', '雑貨'];
export const SSRM_STATUSES = ['受注', '出荷準備', '出荷済', 'キャンセル'];

const CUSTOMERS = [
  '山田商事', '鈴木物産', '佐藤工業', '田中電機', '高橋製作所',
  '伊藤商店', '渡辺興業', '中村流通', '小林貿易', '加藤マテリアル',
  '吉田システム', '斎藤ホールディングス',
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ウォーム済みインスタンス内での再生成を避けるためのモジュールスコープキャッシュ。
// (決定的生成のため、インスタンスが違っても内容は同一)
let cache: OrderRow[] | null = null;

export function getDataset(): OrderRow[] {
  if (!cache) {
    const rand = mulberry32(20260718);
    const rows: OrderRow[] = new Array(ROW_COUNT);
    for (let i = 0; i < ROW_COUNT; i++) {
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);
      rows[i] = {
        id: i + 1,
        code: `ORD-${String(1000000 + i)}`,
        customer: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
        category: SSRM_CATEGORIES[Math.floor(rand() * SSRM_CATEGORIES.length)],
        status: SSRM_STATUSES[Math.floor(rand() * SSRM_STATUSES.length)],
        qty: 1 + Math.floor(rand() * 200),
        price: (1 + Math.floor(rand() * 1000)) * 100,
        orderedAt: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
    cache = rows;
  }
  return cache;
}

function matchFilter(value: unknown, filter: ColumnFilterValue): boolean {
  switch (filter.kind) {
    case 'text':
    case 'date':
      return String(value ?? '')
        .toLowerCase()
        .includes(String(filter.value).toLowerCase());
    case 'select':
      return String(value ?? '') === filter.value;
    case 'set': {
      const hit = filter.values.includes(String(value ?? ''));
      return filter.mode === 'exclude' ? !hit : hit;
    }
    case 'number': {
      const parsed = filter.parsed;
      if (!parsed) return String(value ?? '').includes(filter.raw);
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return false;
      if (parsed.mode === 'comparison') {
        switch (parsed.operator) {
          case '>':
            return num > parsed.value;
          case '>=':
            return num >= parsed.value;
          case '<':
            return num < parsed.value;
          case '<=':
            return num <= parsed.value;
          case '=':
            return num === parsed.value;
        }
      }
      return num >= parsed.min && num <= parsed.max;
    }
    case 'custom':
      // デモに custom フィルター列は無い(記述子の解釈は利用側責務のため素通し)
      return true;
  }
}

export function applyQuery(
  rows: OrderRow[],
  query: ServerSideQuery | undefined,
): OrderRow[] {
  let result = rows;

  const globalText = query?.globalText?.trim().toLowerCase();
  if (globalText) {
    result = result.filter((row) =>
      Object.values(row).some((v) =>
        String(v).toLowerCase().includes(globalText),
      ),
    );
  }

  const filters = query?.columnFilters;
  if (filters) {
    for (const [key, filter] of Object.entries(filters)) {
      result = result.filter((row) =>
        matchFilter((row as Record<string, unknown>)[key], filter),
      );
    }
  }

  const sort = query?.sort;
  if (sort && sort.length > 0) {
    result = [...result].sort((a, b) => {
      for (const entry of sort) {
        const av = (a as Record<string, unknown>)[entry.columnKey];
        const bv = (b as Record<string, unknown>)[entry.columnKey];
        let cmp: number;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'ja');
        }
        if (cmp !== 0) return entry.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  return result;
}