// 追加(フィルハンドル): 埋める元の値(1 列 / 1 行ぶん)から、続きの値を決める純ロジックです。
//   - 値は「連続データ(series)」か「セルのコピー(copy)」で埋めます。既定(auto)は Excel と同じく、
//     続き方が分かる値は連続データ、数値 1 つ・数字だけの文字列 1 つ・続き方の無い値はコピーです。
//     Ctrl(Mac は ⌘)を押しながらのドラッグ(toggled)はこれを入れ替えます(数値 1 つは +1 ずつ)。
//   - 元の値は「埋める向きの順」で渡します。上 / 左へ埋めるときは呼び出し側で逆順にしてから渡し、
//     同じ式で続けます(1, 2, 3 を上へ埋めると 0, -1, … / コピーは周期がそろう)。元の値が 1 つのときは
//     向きが分からないため、上 / 左へは backward を渡して 1 ずつ戻します(Excel と同じ。1 つの日付を上へ引くと前の日)。
//   - 連続データの規則:
//     - 数値: 2 つ以上は最小二乗の直線(等差ならその差)で続けます。浮動小数の誤差は 15 桁で丸めます。
//     - 日付: Date と 'YYYY-MM-DD' / 'YYYY/MM/DD' の文字列(形式を保ちます)。日が同じで月の差が一定なら
//       月単位(月末は丸める)、それ以外は日単位(2 つ以上は日数の最小二乗)。
//     - 曜日 / 月の名前(日本語 / 英語の短縮・正式。英語は大文字小文字を最後の値に合わせます)。差が一定のとき。
//     - 末尾が数字の文字列(P-001 など): 前置きが同じとき末尾の数を進めます。負になる位置は絶対値
//       (Excel と同じ)、0 埋めは最後の値が 0 で始まるときだけ桁数を保ちます。
//     - 数値の文字列('1.5' / '-3'): 数値と同じ規則で文字列を返します(数字だけの文字列は末尾の数の規則)。
//   - 空(null / undefined / '')を含む元の値、型の混在、真偽値などはコピーです。

export type FillKind = 'series' | 'copy';
// 'auto' = 既定の決め方 / 'toggled' = Ctrl で入れ替え / 'series' | 'copy' = 埋めたあとのボタンで選び直し。
export type FillRequest = 'auto' | 'toggled' | FillKind;

export type FillLineAnalysis = {
  // 既定(auto)の埋め方。
  defaultKind: FillKind;
  // 連続データで埋めるときの値(埋める向きの 0 始まりの位置 → 値)。続き方が無い値は null(常にコピー)。
  series: ((index: number) => unknown) | null;
};

const isEmptyFillValue = (value: unknown): boolean =>
  value === null || value === undefined || value === '';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// 浮動小数の誤差(0.1 + 0.2 = 0.30000000000000004)を丸めます。整数はそのまま(大きな整数の桁を落とさない)。
const cleanNumber = (value: number): number =>
  Number.isInteger(value) ? value : Number(value.toPrecision(15));

// 最小二乗の直線(x = 0..n-1)。n = 1 のときは傾き 0。
const fitLine = (values: readonly number[]): ((x: number) => number) => {
  const n = values.length;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const value of values) {
    meanY += value;
  }
  meanY /= n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (index - meanX) * (values[index] - meanY);
    denominator += (index - meanX) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  return (x) => intercept + slope * x;
};

// 差が一定ならその差、そうでなければ null。
const constantStep = (values: readonly number[]): number | null => {
  if (values.length < 2) {
    return null;
  }
  const step = values[1] - values[0];
  for (let index = 2; index < values.length; index += 1) {
    if (values[index] - values[index - 1] !== step) {
      return null;
    }
  }
  return step;
};

// 元の値が 1 つのときの増分(下 / 右へは +1、上 / 左へは -1)。
type SingleStep = 1 | -1;

// 数値列の続き(index 0 = 元の値の直後)。1 つのときは singleStep ずつ。
const numericSeries = (values: readonly number[], singleStep: SingleStep): ((index: number) => number) => {
  const n = values.length;
  const last = values[n - 1];
  if (n === 1) {
    return (index) => cleanNumber(last + singleStep * (index + 1));
  }
  const step = constantStep(values);
  if (step !== null) {
    return (index) => cleanNumber(last + step * (index + 1));
  }
  const line = fitLine(values);
  return (index) => cleanNumber(line(n + index));
};

// ---- 日付 ----

const DATE_TEXT_RE = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/;
const DAY_MS = 86_400_000;

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

type CalendarDate = { year: number; monthIndex: number; day: number };

type DateTextParts = CalendarDate & { separator: string; padded: boolean };

const parseDateText = (value: string): DateTextParts | null => {
  const match = DATE_TEXT_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) {
    return null;
  }
  return {
    year,
    monthIndex: month - 1,
    day,
    separator: match[2],
    padded: match[3].length === 2 && match[4].length === 2,
  };
};

const toDaySerial = ({ year, monthIndex, day }: CalendarDate): number =>
  Math.round(Date.UTC(year, monthIndex, day) / DAY_MS);

const fromDaySerial = (serial: number): CalendarDate => {
  const date = new Date(serial * DAY_MS);
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth(), day: date.getUTCDate() };
};

// 月を進めます(日はその月の末日で丸める = Excel の EDATE と同じ)。
const addMonths = (base: CalendarDate, months: number): CalendarDate => {
  const total = base.year * 12 + base.monthIndex + months;
  const year = Math.floor(total / 12);
  const monthIndex = total - year * 12;
  return { year, monthIndex, day: Math.min(base.day, daysInMonth(year, monthIndex)) };
};

// 日付列の続き(暦日を返す)。月単位(日が同じ・月の差が一定)→ 日単位(最小二乗を日へ丸める)の順。
const calendarSeries = (
  dates: readonly CalendarDate[],
  singleStep: SingleStep,
): ((index: number) => CalendarDate) => {
  const n = dates.length;
  const last = dates[n - 1];
  if (n >= 2 && dates.every((date) => date.day === last.day)) {
    const monthStep = constantStep(dates.map((date) => date.year * 12 + date.monthIndex));
    if (monthStep !== null && monthStep !== 0) {
      return (index) => addMonths(last, monthStep * (index + 1));
    }
  }
  const serials = dates.map(toDaySerial);
  const nextSerial = numericSeries(serials, singleStep);
  return (index) => fromDaySerial(Math.round(nextSerial(index)));
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatDateText = (date: CalendarDate, separator: string, padded: boolean): string => {
  const month = date.monthIndex + 1;
  return padded
    ? `${date.year}${separator}${pad2(month)}${separator}${pad2(date.day)}`
    : `${date.year}${separator}${month}${separator}${date.day}`;
};

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

// ---- 曜日 / 月の名前 ----

const NAME_LISTS: readonly (readonly string[])[] = [
  ['月', '火', '水', '木', '金', '土', '日'],
  ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'],
  ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'],
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
];

const NAME_LIST_LOOKUPS = NAME_LISTS.map(
  (list) => new Map(list.map((name, position) => [name.toLowerCase(), position])),
);

// 英語の大文字 / 小文字を最後の値に合わせます(日本語はそのまま)。
const matchCase = (name: string, sample: string): string => {
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return name.toUpperCase();
  }
  if (sample === sample.toLowerCase() && sample !== sample.toUpperCase()) {
    return name.toLowerCase();
  }
  return name;
};

const nameListSeries = (values: readonly string[], singleStep: SingleStep): ((index: number) => string) | null => {
  for (let listIndex = 0; listIndex < NAME_LISTS.length; listIndex += 1) {
    const lookup = NAME_LIST_LOOKUPS[listIndex];
    const positions: number[] = [];
    for (const value of values) {
      const position = lookup.get(value.toLowerCase());
      if (position === undefined) {
        break;
      }
      positions.push(position);
    }
    if (positions.length !== values.length) {
      continue;
    }
    const list = NAME_LISTS[listIndex];
    const size = list.length;
    let step: number = singleStep;
    if (positions.length >= 2) {
      const first = (positions[1] - positions[0] + size) % size;
      for (let index = 2; index < positions.length; index += 1) {
        if ((positions[index] - positions[index - 1] + size) % size !== first) {
          return null;
        }
      }
      step = first;
    }
    const lastPosition = positions[positions.length - 1];
    const sample = values[values.length - 1];
    return (index) => matchCase(list[(((lastPosition + step * (index + 1)) % size) + size) % size], sample);
  }
  return null;
};

// ---- 末尾が数字の文字列 / 数値の文字列 ----

const TRAILING_NUMBER_RE = /^(.*?)(\d+)$/;
const DIGITS_ONLY_RE = /^\d+$/;
const NUMERIC_TEXT_RE = /^-?\d+(?:\.\d+)?$/;
// 末尾の数がこれより長いと Number で桁が落ちるため、続き方の無い値として扱います。
const MAX_SAFE_DIGITS = 15;

const trailingNumberSeries = (values: readonly string[], singleStep: SingleStep): ((index: number) => string) | null => {
  const parts: { prefix: string; digits: string }[] = [];
  for (const value of values) {
    const match = TRAILING_NUMBER_RE.exec(value);
    if (!match || match[2].length > MAX_SAFE_DIGITS) {
      return null;
    }
    parts.push({ prefix: match[1], digits: match[2] });
  }
  const { prefix, digits: lastDigits } = parts[parts.length - 1];
  if (parts.some((part) => part.prefix !== prefix)) {
    return null;
  }
  const width = lastDigits.length > 1 && lastDigits.startsWith('0') ? lastDigits.length : 0;
  const next = numericSeries(parts.map((part) => Number(part.digits)), singleStep);
  return (index) => `${prefix}${String(Math.abs(Math.round(next(index)))).padStart(width, '0')}`;
};

// 元の値(埋める向きの順)を調べ、既定の埋め方と連続データの作り方を返します。
//   backward = 上 / 左へ埋める(元の値が 1 つのときに 1 ずつ戻す。2 つ以上は並び順で向きが決まる)。
export const analyzeFillLine = (
  source: readonly unknown[],
  options: { backward?: boolean } = {},
): FillLineAnalysis => {
  const copyOnly: FillLineAnalysis = { defaultKind: 'copy', series: null };
  if (source.length === 0 || source.some(isEmptyFillValue)) {
    return copyOnly;
  }
  const single = source.length === 1;
  const singleStep: SingleStep = options.backward ? -1 : 1;

  if (source.every(isFiniteNumber)) {
    // 数値 1 つは既定コピー(Ctrl で +1)。
    return { defaultKind: single ? 'copy' : 'series', series: numericSeries(source, singleStep) };
  }

  if (source.every(isValidDate)) {
    const last = source[source.length - 1];
    const hours = last.getHours();
    const minutes = last.getMinutes();
    const seconds = last.getSeconds();
    const milliseconds = last.getMilliseconds();
    const next = calendarSeries(
      source.map((date) => ({ year: date.getFullYear(), monthIndex: date.getMonth(), day: date.getDate() })),
      singleStep,
    );
    return {
      defaultKind: 'series',
      series: (index) => {
        const date = next(index);
        // 年 0〜99 を 1900 年代に読み替えないよう setFullYear で作ります。
        const result = new Date(2000, 0, 1, hours, minutes, seconds, milliseconds);
        result.setFullYear(date.year, date.monthIndex, date.day);
        return result;
      },
    };
  }

  if (!source.every((value): value is string => typeof value === 'string')) {
    return copyOnly;
  }
  const texts = source;

  const dateParts = texts.map(parseDateText);
  if (dateParts.every((part): part is DateTextParts => part !== null)) {
    const last = dateParts[dateParts.length - 1];
    const padded = dateParts.every((part) => part.padded);
    const next = calendarSeries(dateParts, singleStep);
    return {
      defaultKind: 'series',
      series: (index) => formatDateText(next(index), last.separator, padded),
    };
  }

  if (texts.every((text) => NUMERIC_TEXT_RE.test(text)) && !texts.every((text) => DIGITS_ONLY_RE.test(text))) {
    // '1.5' / '-3' など: 数値と同じ規則で、文字列で返します。
    const next = numericSeries(texts.map(Number), singleStep);
    return { defaultKind: single ? 'copy' : 'series', series: (index) => String(next(index)) };
  }

  const names = nameListSeries(texts, singleStep);
  if (names) {
    return { defaultKind: 'series', series: names };
  }

  const trailing = trailingNumberSeries(texts, singleStep);
  if (trailing) {
    // 数字だけの文字列 1 つは数値と同じく既定コピー。
    const digitsOnly = texts.every((text) => DIGITS_ONLY_RE.test(text));
    return { defaultKind: single && digitsOnly ? 'copy' : 'series', series: trailing };
  }

  return copyOnly;
};

// 要求(auto / toggled / 選び直し)からこの列 / 行の埋め方を決めます。続き方の無い値は常にコピー。
export const resolveFillLineKind = (analysis: FillLineAnalysis, request: FillRequest): FillKind => {
  if (analysis.series === null || request === 'copy') {
    return 'copy';
  }
  if (request === 'series') {
    return 'series';
  }
  if (request === 'toggled') {
    return analysis.defaultKind === 'series' ? 'copy' : 'series';
  }
  return analysis.defaultKind;
};

// 埋める値(index 0 = 元の値の直後)を返す関数を作ります。
export const createFillLineValues = (
  source: readonly unknown[],
  analysis: FillLineAnalysis,
  kind: FillKind,
): ((index: number) => unknown) => {
  if (kind === 'series' && analysis.series !== null) {
    return analysis.series;
  }
  // Date は書き換えられる値のため、行ごとに別の実体にします(同じ参照を複数行で共有しない)。
  return (index) => {
    const value = source[index % source.length];
    return value instanceof Date ? new Date(value.getTime()) : value;
  };
};