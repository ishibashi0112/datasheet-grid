// シフト表のデータ(生成)。部署ごとの見出し行(ラベル行)と職員の行を 1 つの配列に混在させる。

export type Shift = '早' | '遅' | '夜' | '休';
export const SHIFTS: Shift[] = ['早', '遅', '夜', '休'];

export const DEPTS = ['内科病棟', '外科病棟', 'ICU', '救急外来', '外来'] as const;
export type Dept = (typeof DEPTS)[number];

export type Staff = {
  kind: 'staff';
  id: string;
  name: string;
  dept: Dept;
  employment: '常勤' | 'パート';
  /** index 0 = 1 日。長さ = その月の日数 */
  shifts: (Shift | null)[];
};

export type DeptLabel = {
  kind: 'label';
  id: string;
  dept: Dept;
};

export type Row = Staff | DeptLabel;

export type MonthKey = '2026-11' | '2026-12' | '2027-01' | '2027-02';
export const MONTHS: { key: MonthKey; label: string }[] = [
  { key: '2026-11', label: '2026年11月' },
  { key: '2026-12', label: '2026年12月' },
  { key: '2027-01', label: '2027年1月' },
  { key: '2027-02', label: '2027年2月' },
];

// 祝日(該当月だけ)
const HOLIDAYS: Record<string, string> = {
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
};

export type DayInfo = {
  day: number;
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = 日
  holiday?: string;
};

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function daysOf(month: MonthKey): DayInfo[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  const out: DayInfo[] = [];
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    out.push({ day: d, date, weekday: new Date(y, m - 1, d).getDay(), holiday: HOLIDAYS[date] });
  }
  return out;
}

// 乱数(再現できるように)
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAMILY = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'];
const GIVEN = ['花子', '美咲', '陽菜', '結衣', '健太', '翔太', '彩', '真由美', '直樹', '恵', '大輔', '由美', '拓也', 'さくら', '亮', '理恵', '智子', '和也', '愛', '誠'];

const DEPT_SIZES: Record<Dept, number> = { 内科病棟: 30, 外科病棟: 30, ICU: 20, 救急外来: 20, 外来: 20 };

export function makeStaffList(): Omit<Staff, 'shifts'>[] {
  const rand = mulberry32(42);
  const list: Omit<Staff, 'shifts'>[] = [];
  let n = 0;
  for (const dept of DEPTS) {
    for (let i = 0; i < DEPT_SIZES[dept]; i++) {
      n++;
      list.push({
        kind: 'staff',
        id: `S${String(n).padStart(3, '0')}`,
        name: `${FAMILY[Math.floor(rand() * FAMILY.length)]} ${GIVEN[Math.floor(rand() * GIVEN.length)]}`,
        dept,
        employment: rand() < 0.2 ? 'パート' : '常勤',
      });
    }
  }
  return list;
}

/** その月のシフト表(ラベル行 + 職員行)を作る。外来は夜勤なし。 */
export function makeMonthRows(month: MonthKey, staff = makeStaffList()): Row[] {
  const days = daysOf(month);
  const rand = mulberry32(month.split('-').map(Number).reduce((a, b) => a * 100 + b, 7));
  const rows: Row[] = [];
  for (const dept of DEPTS) {
    rows.push({ kind: 'label', id: `L-${dept}`, dept });
    for (const s of staff.filter((x) => x.dept === dept)) {
      const shifts: (Shift | null)[] = [];
      for (const d of days) {
        const prev = shifts[shifts.length - 1];
        let v: Shift;
        if (prev === '夜') v = '休'; // 夜勤明けは休み
        else {
          const r = rand();
          if (dept === '外来') v = d.weekday === 0 || d.holiday ? '休' : r < 0.75 ? '早' : '休';
          else v = r < 0.35 ? '早' : r < 0.6 ? '遅' : r < 0.75 ? '夜' : '休';
        }
        // 少しだけ未入力を残す
        shifts.push(rand() < 0.03 ? null : v);
      }
      rows.push({ ...s, shifts });
    }
  }
  return rows;
}
