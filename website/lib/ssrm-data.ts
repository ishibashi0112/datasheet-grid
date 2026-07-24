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
      // 追加(filter-ext A): blank / notBlank(空白 / 空白でない)。ライブラリ本体と同じく
      //   null / undefined / trim 後空文字を「空白」とみなします。
      if (parsed.mode === 'blank' || parsed.mode === 'notBlank') {
        const isBlank =
          value === null || value === undefined || String(value).trim() === '';
        return isBlank === (parsed.mode === 'blank');
      }
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
          // 追加(filter-ext A): 等しくない(非数値セルは上の isFinite ガードで不一致)。
          case '!=':
            return num !== parsed.value;
        }
      }
      return num >= parsed.min && num <= parsed.max;
    }
    // 追加(filter-ext B): 条件 AND 選択の複合(デモには numberSet 列は無いが、
    //   ColumnFilterValue の網羅 switch として number / set と同じ規則で解釈する)。
    case 'numberSet': {
      if (filter.condition) {
        const conditionPass = matchFilter(value, {
          kind: 'number',
          raw: '',
          parsed: filter.condition,
        });
        if (!conditionPass) return false;
      }
      if (filter.set) {
        const hit = filter.set.values.includes(String(value ?? ''));
        return filter.set.mode === 'exclude' ? !hit : hit;
      }
      return true;
    }
    // 追加(filter-ext D): 日付版の複合。デモデータは常に 'YYYY-MM-DD' なので文字列比較で判定し、
    //   相対プリセットは受信時点の「今日」を基準に解決する(ライブラリ本体と同規則)。
    case 'dateSet': {
      const key = /^\d{4}-\d{2}-\d{2}/.test(String(value ?? '').trim())
        ? String(value ?? '').trim().slice(0, 10)
        : null;
      if (filter.condition) {
        const condition = filter.condition;
        if (condition.mode === 'blank' || condition.mode === 'notBlank') {
          const isBlank =
            value === null || value === undefined || String(value).trim() === '';
          if (isBlank !== (condition.mode === 'blank')) return false;
        } else {
          if (key === null) return false;
          let from = '';
          let to = '9999-12-31';
          if (condition.mode === 'preset') {
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const fmt = (d: Date) =>
              `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            if (condition.preset === 'today') {
              from = to = fmt(now);
            } else if (condition.preset === 'thisMonth') {
              from = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
              to = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            } else {
              from = fmt(
                new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29),
              );
              to = fmt(now);
            }
            if (key < from || key > to) return false;
          } else if (condition.mode === 'range') {
            if (key < condition.from || key > condition.to) return false;
          } else if (condition.mode === 'onOrAfter') {
            if (key < condition.value) return false;
          } else if (condition.mode === 'onOrBefore') {
            if (key > condition.value) return false;
          } else if (condition.mode === 'equals') {
            if (key !== condition.value) return false;
          } else if (key === condition.value) {
            return false; // notEquals
          }
        }
      }
      if (filter.set) {
        // set.values は正規化済み日付キー(空白 = '' / 非日付 = 生値)。
        const setKey = key ?? (String(value ?? '').trim() === '' ? '' : String(value));
        const hit = filter.set.values.includes(setKey);
        return filter.set.mode === 'exclude' ? !hit : hit;
      }
      return true;
    }
    // 追加(filter-ext C): テキスト版の複合(判定は大文字小文字無視。ライブラリ本体と同規則)。
    case 'textSet': {
      if (filter.condition) {
        const condition = filter.condition;
        if (condition.mode === 'blank' || condition.mode === 'notBlank') {
          const isBlank =
            value === null || value === undefined || String(value).trim() === '';
          if (isBlank !== (condition.mode === 'blank')) return false;
        } else {
          const cell = String(value ?? '').toLowerCase();
          const needle = condition.value.toLowerCase();
          const pass =
            condition.mode === 'equals'
              ? cell === needle
              : condition.mode === 'startsWith'
                ? cell.startsWith(needle)
                : condition.mode === 'endsWith'
                  ? cell.endsWith(needle)
                  : cell.includes(needle);
          if (!pass) return false;
        }
      }
      if (filter.set) {
        const hit = filter.set.values.includes(String(value ?? ''));
        return filter.set.mode === 'exclude' ? !hit : hit;
      }
      return true;
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