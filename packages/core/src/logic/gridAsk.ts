import type {
  ColumnFilterUiType,
  ColumnFilterValue,
  GridColumn,
  GridColumnState,
  GridSortEntry,
  GridState,
  ParsedDateFilter,
  ParsedNumberFilter,
  ParsedTextFilter,
} from '../model/gridTypes.unbound';
import { normalizeDateFilterPresets, type NormalizedDateFilterPreset } from './dateFilterPresets';
import { parseNumberText } from './editorValues';
import { describeColumnFilterValue } from './filterSummary';
import { formatDateKey, toDateKey } from './filtering';
import { cloneColumnFilterValue, isSameColumnFilterValue, isSameFilterState, isSameSortState } from './gridState';
import { formatParsedNumberFilter } from './numberFilterCondition';

// 追加(ことばで絞り込み): 利用者の文(「東京の在庫が 10 個以下を高い順に」)を AI に渡す頼みへ組み立て、
//   AI の答えを検査して GridState(フィルター / 並び / 検索 / 列の表示)へ変える純ロジックです。
//   グリッドは AI を呼びません。利用側の ask(自分のサーバー → 好きな AI)が頼みを受けて答えを返します。
//   - 送るのは列の key / title / 使える条件 / 列定義にある候補 / 今の条件 / 利用者の文だけ(行のデータは送らない)。
//   - AI が使える条件は、その列のフィルター画面で手で入れられる条件と同じ(列の filterType で決まる)。
//     filterType の無い列と custom の列は絞り込めない(並び替えと表示の切り替えだけ)。
//   - 答えはすべて検査し、無い列・その列で使えない条件・候補に無い値は捨てて、捨てた理由を日本語で返す。
//   React 版の入口 `/ai`(GridAskBar / useGridAsk)が使い、サーバー側や他のフレームワークからも使えます。

// AI が答えに書く条件の種類です(列ごとに使えるものは filterType で決まります)。
export type GridAskOp =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'between'
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'onOrAfter'
  | 'onOrBefore'
  | 'notEquals'
  | 'preset'
  | 'blank'
  | 'notBlank'
  | 'in'
  | 'notIn'
  | 'clear';

// 答えの 1 件のフィルターです。使わない欄は null。数と日付も文字列で書きます('10000' / '2026-10-01')。
export type GridAskFilter = {
  column: string;
  op: GridAskOp;
  value: string | null;
  values: string[] | null;
  to: string | null;
};

export type GridAskSort = {
  column: string;
  direction: 'asc' | 'desc';
};

// AI の答えの形です(request.schema の JSON Schema と同じ)。
export type GridAskAnswer = {
  mode: 'replace' | 'refine';
  filters: GridAskFilter[];
  sort: GridAskSort[] | null;
  search: string | null;
  hide: string[];
  show: string[];
  unsupported: string | null;
};

// ask に渡す頼みです。system はいつも同じ文、prompt は列の説明と今の条件と利用者の文、
//   schema は答えの形(JSON Schema。Claude の構造化出力 / OpenAI の strict な出力にそのまま渡せる形)、
//   text は利用者が書いた文そのものです(ログや回数の制限に使えます)。
export type GridAskRequest = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  text: string;
};

export type GridAskOptions<T> = {
  // グリッドと同じ列定義です。AI に見せるのは key / title / filterType / 候補(filterOptions / select エディタの
  //   選択肢)/ dateSet のプリセットだけです。
  columns: readonly GridColumn<T>[];
  // 列ごとの補足(単位や値の書き方)。false でその列を AI に見せません(その列の条件も変えません)。
  columnHints?: Readonly<Record<string, string | false>>;
  // 列の条件(フィルター)を変えてよいか(既定 true)。グリッドの enableColumnFilter を false にしているときは
  //   false にします(表の見出しから外せない条件を入れないため)。
  allowFilter?: boolean;
  // 並びを変えてよいか(既定 true)。グリッドの enableSorting を false にしているときは false にします。
  allowSort?: boolean;
  // グローバル検索の文字を変えてよいか(既定 true)。enableGlobalFilter を false にしているときは false にします。
  allowSearch?: boolean;
  // 列を隠す・見せるのを許すか(既定 false)。列の表示の反映には onColumnsChange が要るため opt-in です。
  allowColumnVisibility?: boolean;
  // 「今日」です(既定 new Date())。プロンプトの日付と、テストで日付を固定するために使います。
  now?: Date;
};

export type GridAskResult =
  | {
      ok: true;
      // 反映する状態です(columnWidths は今の値のまま。columns は今の列メタに表示の変更を足したもの)。
      state: GridState;
      // 今の状態からフィルター / 並び / 検索 / 列の表示のどれかが変わるか。
      changed: boolean;
      // 使えなかった部分(日本語)。
      dropped: string[];
      // AI が「できなかった」と書いてきた文(無ければ null)。
      unsupported: string | null;
    }
  | {
      ok: false;
      message: string;
    };

// 反映した条件の表示(チップ)1 件です。id は removeGridAskItem に渡します。
export type GridAskItem = {
  id: string;
  label: string;
  text: string;
};

// ── 列ごとの条件 ──

const COMPARISON_OPS = ['=', '!=', '>', '>=', '<', '<='] as const;
type ComparisonOp = (typeof COMPARISON_OPS)[number];

const ALL_OPS: readonly GridAskOp[] = [
  ...COMPARISON_OPS,
  'between',
  'contains',
  'equals',
  'startsWith',
  'endsWith',
  'onOrAfter',
  'onOrBefore',
  'notEquals',
  'preset',
  'blank',
  'notBlank',
  'in',
  'notIn',
  'clear',
];

type AskFilterType = Exclude<ColumnFilterUiType, 'custom'>;

// filterType ごとに AI が使える条件です(フィルター画面の演算子と同じ並び)。
const OPS_BY_TYPE: Record<AskFilterType, readonly GridAskOp[]> = {
  text: ['contains', 'clear'],
  date: ['contains', 'clear'],
  select: ['equals', 'clear'],
  set: ['in', 'notIn', 'clear'],
  number: [...COMPARISON_OPS, 'between', 'blank', 'notBlank', 'clear'],
  numberSet: [...COMPARISON_OPS, 'between', 'blank', 'notBlank', 'in', 'notIn', 'clear'],
  textSet: ['contains', 'equals', 'startsWith', 'endsWith', 'blank', 'notBlank', 'in', 'notIn', 'clear'],
  dateSet: ['between', 'onOrAfter', 'onOrBefore', 'equals', 'notEquals', 'preset', 'blank', 'notBlank', 'in', 'notIn', 'clear'],
};

// プロンプトに書く列の種類です。
const TYPE_WORDS: Record<AskFilterType, string> = {
  text: 'text',
  textSet: 'text',
  number: 'number',
  numberSet: 'number',
  date: 'date written as text',
  dateSet: 'date',
  select: 'choice (one value)',
  set: 'choice',
};

// 使えなかった理由に出す条件の名前です。
const OP_LABELS: Record<GridAskOp, string> = {
  '=': 'に等しい',
  '!=': 'に等しくない',
  '>': 'より大きい',
  '>=': '以上',
  '<': '未満',
  '<=': '以下',
  between: '範囲',
  contains: 'を含む',
  equals: 'に等しい',
  startsWith: 'で始まる',
  endsWith: 'で終わる',
  onOrAfter: '以降',
  onOrBefore: '以前',
  notEquals: 'に等しくない',
  preset: '今日・今月など',
  blank: '空白',
  notBlank: '空白でない',
  in: '値を選ぶ',
  notIn: '値を除く',
  clear: '外す',
};

// プロンプトに並べる候補の上限です(残りは件数だけ書きます。検査は全候補で行います)。
const LISTED_OPTION_LIMIT = 50;
// 答えの大きさの上限です(長すぎる答えでグリッドの状態を膨らませないため。切り詰めずに、超えた分は理由を出して捨てる)。
//   TEXT_LIMIT は条件と検索の文字、VALUE_TEXT_LIMIT は選ぶ値 1 つ、VALUES_LIMIT は 1 列で選ぶ値の数です。
const TEXT_LIMIT = 200;
const VALUE_TEXT_LIMIT = 1000;
const VALUES_LIMIT = 1000;
const UNSUPPORTED_LIMIT = 300;
// Current view に並べる今の選択の上限です(残りは "more": 件数。AI が同じ op のまま言い直したときは残りも残す)。
const VIEW_VALUES_LIMIT = 500;
// 列の key を enum にする列数の上限です(enum の総数に上限がある AI がある。超えたら文字列にして検査で守る)。
const COLUMN_ENUM_LIMIT = 100;
// 使えなかった理由の件数と、理由に引く答えの文字の上限です。
const DROPPED_LIMIT = 20;
const QUOTE_LIMIT = 40;

type AskOption = { value: string; label: string };

type AskColumn<T> = {
  column: GridColumn<T>;
  key: string;
  title: string;
  hint: string | null;
  // null = 絞り込めない列(filterType なし / custom)。
  filterType: AskFilterType | null;
  ops: readonly GridAskOp[];
  // null = 候補が列定義に無い(行から集める列。値は検査せずに受け取ります)。
  options: AskOption[] | null;
  presets: NormalizedDateFilterPreset[];
};

// 'auto' の列の種類です。フィルター画面と同じく適用中の記述子の kind を優先し、無ければ editor の種類
//   (number → numberSet / date → dateSet)、それも無ければ 'text'(含む だけ)。行のデータは見ません
//   (値からの推定は serverSide でもしない規則と揃え、AI が入れた kind がそのまま画面の種類になるようにします)。
const resolveAutoFilterType = <T,>(
  column: GridColumn<T>,
  current: ColumnFilterValue | undefined,
): AskFilterType => {
  if (
    current?.kind === 'numberSet' ||
    current?.kind === 'textSet' ||
    current?.kind === 'dateSet' ||
    current?.kind === 'text'
  ) {
    return current.kind;
  }
  if (column.editor?.type === 'number') {
    return 'numberSet';
  }
  if (column.editor?.type === 'date') {
    return 'dateSet';
  }
  return 'text';
};

const resolveFilterType = <T,>(
  column: GridColumn<T>,
  current: ColumnFilterValue | undefined,
): AskFilterType | null => {
  const filterType = column.filterType;
  if (filterType === undefined || filterType === 'custom') {
    return null;
  }
  return filterType === 'auto' ? resolveAutoFilterType(column, current) : filterType;
};

// 候補は filterOptions、無ければ select エディタの静的な選択肢です(行から集める候補は送りません)。
//   空の配列はグリッドと同じく「行から集める」= 候補なしです。
const resolveOptions = <T,>(column: GridColumn<T>): AskOption[] | null => {
  const editor = column.editor;
  const source =
    column.filterOptions && column.filterOptions.length > 0
      ? column.filterOptions
      : editor?.type === 'select' && Array.isArray(editor.options)
        ? editor.options
        : [];
  return source.length > 0 ? source.map((option) => ({ value: option.value, label: option.label })) : null;
};

// 自分のキーだけを引きます(列の key が '__proto__' などでも prototype の値を返さない)。
const ownValue = <V,>(record: Readonly<Record<string, V>> | undefined, key: string): V | undefined =>
  record !== undefined && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

const resolveAskColumns = <T,>(
  options: GridAskOptions<T>,
  state: GridState,
): AskColumn<T>[] => {
  const allowFilter = isAllowed(options.allowFilter, true);
  const result: AskColumn<T>[] = [];
  for (const column of options.columns) {
    const hint = ownValue(options.columnHints, column.key);
    if (hint === false) {
      continue;
    }
    const filterType = allowFilter ? resolveFilterType(column, ownValue(state.filters.columnFilters, column.key)) : null;
    const presets = filterType === 'dateSet' ? normalizeDateFilterPresets(column.dateFilterPresets) : [];
    const ops = filterType === null
      ? []
      : filterType === 'dateSet' && presets.length === 0
        ? OPS_BY_TYPE.dateSet.filter((op) => op !== 'preset')
        : OPS_BY_TYPE[filterType];
    result.push({
      column,
      key: column.key,
      title: column.title || column.key,
      hint: typeof hint === 'string' && hint.trim() !== '' ? hint.trim() : null,
      filterType,
      ops,
      options: filterType === null || filterType === 'text' || filterType === 'date' || filterType === 'number'
        ? null
        : resolveOptions(column),
      presets,
    });
  }
  return result;
};

const isAllowed = (flag: boolean | undefined, fallback: boolean): boolean => flag ?? fallback;

// ── 今の条件を答えと同じ形で書く(プロンプトの Current view) ──

const toItem = (
  column: string,
  op: GridAskOp,
  extra: { value?: string; values?: string[]; to?: string } = {},
): GridAskFilter => ({
  column,
  op,
  value: extra.value ?? null,
  values: extra.values ?? null,
  to: extra.to ?? null,
});

const numberConditionToItems = (key: string, parsed: ParsedNumberFilter): GridAskFilter[] => {
  switch (parsed.mode) {
    case 'comparison':
      return [toItem(key, parsed.operator, { value: String(parsed.value) })];
    case 'range':
      return [toItem(key, 'between', { value: String(parsed.min), to: String(parsed.max) })];
    default:
      return [toItem(key, parsed.mode)];
  }
};

const textConditionToItems = (key: string, parsed: ParsedTextFilter): GridAskFilter[] =>
  parsed.mode === 'blank' || parsed.mode === 'notBlank'
    ? [toItem(key, parsed.mode)]
    : [toItem(key, parsed.mode, { value: parsed.value })];

const dateConditionToItems = (key: string, parsed: ParsedDateFilter): GridAskFilter[] => {
  switch (parsed.mode) {
    case 'range':
      return [toItem(key, 'between', { value: parsed.from, to: parsed.to })];
    case 'preset':
      return [toItem(key, 'preset', { value: parsed.preset })];
    case 'blank':
    case 'notBlank':
      return [toItem(key, parsed.mode)];
    default:
      return [toItem(key, parsed.mode, { value: parsed.value })];
  }
};

// 今の選択が長いときは先頭の VIEW_VALUES_LIMIT 件だけを書き、残りの件数を more に書きます。
const setToItems = (
  key: string,
  set: { mode?: 'include' | 'exclude'; values: string[] } | null,
): GridAskFilter[] => {
  if (!set) {
    return [];
  }
  const item: GridAskFilter & { more?: number } = toItem(key, set.mode === 'exclude' ? 'notIn' : 'in', {
    values: set.values.slice(0, VIEW_VALUES_LIMIT),
  });
  if (set.values.length > VIEW_VALUES_LIMIT) {
    item.more = set.values.length - VIEW_VALUES_LIMIT;
  }
  return [item];
};

const filterValueToItems = (key: string, value: ColumnFilterValue): GridAskFilter[] => {
  switch (value.kind) {
    case 'text':
    case 'date':
      return [toItem(key, 'contains', { value: value.value })];
    case 'select':
      return [toItem(key, 'equals', { value: value.value })];
    case 'set':
      return setToItems(key, value);
    case 'number':
      return value.parsed ? numberConditionToItems(key, value.parsed) : [];
    case 'numberSet':
      return [...(value.condition ? numberConditionToItems(key, value.condition) : []), ...setToItems(key, value.set)];
    case 'textSet':
      return [...(value.condition ? textConditionToItems(key, value.condition) : []), ...setToItems(key, value.set)];
    case 'dateSet':
      return [...(value.condition ? dateConditionToItems(key, value.condition) : []), ...setToItems(key, value.set)];
    case 'custom':
      return [];
  }
};

// 列メタから visible を外します(未指定 = 表示)。
const withoutVisible = (entry: GridColumnState): GridColumnState => {
  const next = { ...entry };
  delete next.visible;
  return next;
};

const hiddenKeysOf = (columns: GridColumnState[] | undefined): string[] =>
  (columns ?? []).filter((entry) => entry.visible === false).map((entry) => entry.key);

// ── 頼みの組み立て ──

/**
 * ask の system に渡す文です(いつも同じ文)。`createGridAskRequest` の結果の `system` と同じです。
 */
export const gridAskSystemPrompt = [
  'You set how a data table is viewed, from one request by its user. You choose filters (which rows to show), the sort order, a quick text search and hidden columns. You never see or change the data.',
  '- Use only the listed columns (by key) and, for each column, only its listed ops. A column without ops cannot be filtered.',
  '- A filter is {column, op, value, values, to}. Comparison ops (=, !=, >, >=, <, <=) and contains, equals, startsWith, endsWith, onOrAfter, onOrBefore, notEquals use "value". "between" uses "value" (from) and "to"; both ends are included. "in" (show only these values) and "notIn" (hide these values) use "values"; pick from the column\'s listed values when it has them (a list ending in "more (not listed)" is cut short). "" in values stands for blank cells. "preset" puts one of the column\'s preset ids in "value". blank, notBlank and clear use none of them. Unused fields are null.',
  '- "values" is always the whole list after the change: in refine mode, repeat the current values you keep. A current list with "more": N shows only part of its values; the rest stay as long as the column keeps the same op (in or notIn).',
  '- Write numbers as plain digits without units or separators (for example "10000"), and dates as YYYY-MM-DD, except in columns of type "date written as text", where value is text to find as the cells write it.',
  '- Read amounts by their meaning: 「X しない」「X 未満」「X を切る」「under X」 are < X; 「X 以下」 is <= X; 「X 以上」 is >= X; 「X を超える」「X より多い」「over X」 are > X. Use != only for "not equal to" (〜ではない, 〜以外).',
  '- Use at most one filter per column, except that a column whose ops include in/notIn may have one in/notIn and one other op.',
  '- mode "replace" starts from an empty view (no filters, sort or search; hidden columns stay). mode "refine" keeps the current view and changes only what the request mentions; op "clear" removes a column\'s filter. Use refine only when the request clearly builds on what is shown now (for example: also, too, さらに, それと, そのうえで, その中で, 〜も). A request that describes on its own the rows it wants uses replace, even when it is short.',
  '- sort lists columns in priority order; null keeps the current sort in refine mode. search is a word to find in any column; use it only when no column fits. In refine mode null keeps the current search; "" clears it.',
  '- Change filters, the sort, the search and hidden columns only when the prompt says it is allowed. hide and show list column keys.',
  '- If any part of the request cannot be done with these columns and ops, do the rest and say briefly what you could not do in "unsupported", in the language of the request. Otherwise unsupported is null. Never invent a column.',
].join('\n');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatOptions = (options: AskOption[]): string => {
  const listed = options.slice(0, LISTED_OPTION_LIMIT).map((option) =>
    option.label && option.label !== option.value
      ? `${JSON.stringify(option.value)} (${option.label})`
      : JSON.stringify(option.value),
  );
  const rest = options.length - listed.length;
  return rest > 0 ? `${listed.join(', ')} and ${rest} more (not listed)` : listed.join(', ');
};

const describeColumnLine = <T,>(column: AskColumn<T>): string => {
  const head = `- ${column.key} ${JSON.stringify(column.title)}${column.hint ? ` (${column.hint})` : ''}`;
  if (column.filterType === null) {
    return `${head}: no ops.`;
  }
  let line = `${head}: ${TYPE_WORDS[column.filterType]}.`;
  // select の値 '' は「すべて」(条件なし)と同じなので並べません(選ばれても検査で捨てる)。
  const listed = column.filterType === 'select' ? column.options?.filter((option) => option.value !== '') : column.options;
  if (listed && listed.length > 0) {
    line += ` values: ${formatOptions(listed)}.`;
  }
  const ops = column.ops.map((op) =>
    op === 'preset'
      ? `preset (${column.presets.map((preset) => `${preset.id} = ${preset.label}`).join(', ')})`
      : op,
  );
  return `${line} ops: ${ops.join(', ')}`;
};

// 答えの形(JSON Schema)です。列の key だけが列定義で変わり、ほかはいつも同じです(構造化出力のスキーマの
//   キャッシュが効くように、条件の一覧は列ごとに絞らず全部を並べ、列ごとの制限はプロンプトと検査で守ります)。
//   列の key の enum は 4 か所に入るので、列が多い表では enum を外します(無い列は検査で捨てる)。
const buildSchema = (keys: string[]): Record<string, unknown> => {
  const columnKey =
    keys.length > 0 && keys.length <= COLUMN_ENUM_LIMIT ? { type: 'string', enum: keys } : { type: 'string' };
  const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'filters', 'sort', 'search', 'hide', 'show', 'unsupported'],
    properties: {
      mode: { type: 'string', enum: ['replace', 'refine'] },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['column', 'op', 'value', 'values', 'to'],
          properties: {
            column: columnKey,
            op: { type: 'string', enum: [...ALL_OPS] },
            value: nullableString,
            values: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
            to: nullableString,
          },
        },
      },
      sort: {
        anyOf: [
          {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['column', 'direction'],
              properties: {
                column: columnKey,
                direction: { type: 'string', enum: ['asc', 'desc'] },
              },
            },
          },
          { type: 'null' },
        ],
      },
      search: nullableString,
      hide: { type: 'array', items: columnKey },
      show: { type: 'array', items: columnKey },
      unsupported: nullableString,
    },
  };
};

/**
 * 利用者の文と今の状態(`getState()`)から、ask に渡す頼みを組み立てます。行のデータは入りません。
 */
export const createGridAskRequest = <T,>(
  text: string,
  state: GridState,
  options: GridAskOptions<T>,
): GridAskRequest => {
  const columns = resolveAskColumns(options, state);
  const allowFilter = isAllowed(options.allowFilter, true);
  const allowSort = isAllowed(options.allowSort, true);
  const allowSearch = isAllowed(options.allowSearch, true);
  const allowColumnVisibility = isAllowed(options.allowColumnVisibility, false);
  const now = options.now ?? new Date();
  const visibleKeys = new Set(columns.map((column) => column.key));
  // AI が変えられる列(見せていて絞り込める列)の条件だけを書きます(ほかの条件は答えに関係なく残ります)。
  const filterableKeys = new Set(columns.filter((column) => column.filterType !== null).map((column) => column.key));

  const current: Record<string, unknown> = {};
  if (allowFilter) {
    current.filters = Object.entries(state.filters.columnFilters)
      .filter(([key]) => filterableKeys.has(key))
      .flatMap(([key, value]) => filterValueToItems(key, value));
  }
  if (allowSort) {
    current.sort = state.sort
      .filter((entry) => visibleKeys.has(entry.columnKey))
      .map((entry) => ({ column: entry.columnKey, direction: entry.direction }));
  }
  if (allowSearch) {
    current.search = state.filters.globalText === '' ? null : state.filters.globalText;
  }
  if (allowColumnVisibility) {
    current.hidden = hiddenKeysOf(state.columns).filter((key) => visibleKeys.has(key));
  }

  const prompt = [
    `Today: ${formatDateKey(now)} (${WEEKDAYS[now.getDay()]})`,
    'Columns:',
    ...columns.map(describeColumnLine),
    `Filters: ${allowFilter ? 'allowed (by each column\'s ops)' : 'not allowed'}.`,
    `Sort: ${allowSort ? 'allowed (any column above)' : 'not allowed'}.`,
    `Search: ${allowSearch ? 'allowed' : 'not allowed'}.`,
    `Hide or show columns: ${allowColumnVisibility ? 'allowed' : 'not allowed'}.`,
    `Current view: ${JSON.stringify(current)}`,
    `Request: ${text.trim()}`,
  ].join('\n');

  return {
    system: gridAskSystemPrompt,
    prompt,
    schema: buildSchema(columns.map((column) => column.key)),
    text: text.trim(),
  };
};

// ── 答えの検査 ──

type Built<V> = { value: V } | { error: string };

const ok = <V,>(value: V): Built<V> => ({ value });
const ng = <V,>(error: string): Built<V> => ({ error });

// 答えの値を文字列にします(数は文字列に。それ以外は '')。前後の空白はそのまま(選ぶ値は完全一致で比べるため)。
const toRawText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
};

const toText = (value: unknown): string => toRawText(value).trim();

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  return typeof value === 'string' && value.length <= TEXT_LIMIT ? parseNumberText(value) : null;
};

// 理由に引く答えの文字です(長い文字は省略。空は「(空)」)。
const quote = (value: unknown): string => {
  const text = toText(value);
  if (text === '') {
    return '(空)';
  }
  return text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT)}…` : text;
};

const quoteList = (values: string[]): string => {
  const head = values.slice(0, 5).map((value) => `「${quote(value)}」`).join('');
  return values.length > 5 ? `${head}ほか ${values.length - 5} 件` : head;
};

const columnLabel = (value: unknown): string => (toText(value) === '' ? '(名前なし)' : quote(value));

const tooLongText = (): string => `探す文字は ${TEXT_LIMIT} 字までです`;

const buildNumberCondition = (op: GridAskOp, filter: Record<string, unknown>): Built<ParsedNumberFilter> => {
  if (op === 'blank' || op === 'notBlank') {
    return ok({ mode: op });
  }
  if (op === 'between') {
    const from = toNumber(filter.value);
    const to = toNumber(filter.to);
    if (from === null || to === null) {
      return ng('範囲の両端の数がありません');
    }
    return ok({ mode: 'range', min: Math.min(from, to), max: Math.max(from, to) });
  }
  const value = toNumber(filter.value);
  if (value === null) {
    return ng(`「${quote(filter.value)}」は数として読めません`);
  }
  return ok({ mode: 'comparison', operator: op as ComparisonOp, value });
};

// 文字の条件は前後の空白を外します(フィルター画面と同じ)。長すぎる文字は切り詰めずに捨てます。
const buildTextCondition = (op: GridAskOp, filter: Record<string, unknown>): Built<ParsedTextFilter> => {
  if (op === 'blank' || op === 'notBlank') {
    return ok({ mode: op });
  }
  const value = toText(filter.value);
  if (value === '') {
    return ng('探す文字がありません');
  }
  if (value.length > TEXT_LIMIT) {
    return ng(tooLongText());
  }
  return ok({ mode: op as 'contains' | 'equals' | 'startsWith' | 'endsWith', value });
};

const buildDateCondition = <T,>(
  column: AskColumn<T>,
  op: GridAskOp,
  filter: Record<string, unknown>,
): Built<ParsedDateFilter> => {
  if (op === 'blank' || op === 'notBlank') {
    return ok({ mode: op });
  }
  if (op === 'preset') {
    const id = toText(filter.value);
    const preset = column.presets.find((entry) => entry.id === id || entry.label === id);
    return preset ? ok({ mode: 'preset', preset: preset.id }) : ng(`「${quote(filter.value)}」という期間は使えません`);
  }
  if (op === 'between') {
    const from = toDateKey(toText(filter.value));
    const to = toDateKey(toText(filter.to));
    if (from === null || to === null) {
      return ng('範囲の両端の日付がありません');
    }
    return ok(from <= to ? { mode: 'range', from, to } : { mode: 'range', from: to, to: from });
  }
  const value = toDateKey(toText(filter.value));
  if (value === null) {
    return ng(`「${quote(filter.value)}」は日付として読めません`);
  }
  return ok({ mode: op as 'onOrAfter' | 'onOrBefore' | 'equals' | 'notEquals', value });
};

// 候補から値を引きます(値 → 表示名 → 大文字小文字と前後の空白を無視、の順)。
const matchOption = (options: AskOption[], text: string): string | null => {
  const byValue = options.find((option) => option.value === text);
  if (byValue) {
    return byValue.value;
  }
  const byLabel = options.find((option) => option.label === text);
  if (byLabel) {
    return byLabel.value;
  }
  const folded = text.trim().toLowerCase();
  const loose = options.find(
    (option) => option.value.trim().toLowerCase() === folded || option.label.trim().toLowerCase() === folded,
  );
  return loose ? loose.value : null;
};

type SetMode = 'include' | 'exclude';
type CompositeValue = Extract<ColumnFilterValue, { kind: 'numberSet' | 'textSet' | 'dateSet' }>;
type CompositeSide = 'condition' | 'set';

// 記述子の選択(set、または複合の選択側)です。
const setOf = (value: ColumnFilterValue | undefined): { mode: SetMode; values: string[] } | null => {
  if (value === undefined) {
    return null;
  }
  if (value.kind === 'set') {
    return { mode: value.mode === 'exclude' ? 'exclude' : 'include', values: value.values };
  }
  if ((value.kind === 'numberSet' || value.kind === 'textSet' || value.kind === 'dateSet') && value.set) {
    return { mode: value.set.mode === 'exclude' ? 'exclude' : 'include', values: value.set.values };
  }
  return null;
};

// 1 列の条件を組み立てるときの手がかりです。original は答えを当てる前のその列の条件(言い直しを見分ける)、
//   base は始めにする記述子(同じ答えで先に決めた値、refine では今の値)、fixed はその列で同じ答えの中で
//   もう決めた側です(複合列の条件と選択は 1 つずつ。今の値の側は上書きします)。
type BuildContext = {
  original: ColumnFilterValue | undefined;
  base: ColumnFilterValue | undefined;
  fixed: ReadonlySet<CompositeSide>;
  refine: boolean;
  dropped: string[];
};

// in / notIn の値を選びます。今の選択にある値は書かれたまま使います(言い直しで '100.00' を '100' に
//   変えない)。'' は空白のセルです。ほかは候補から引くか(候補のある列)、列の種類で揃えます
//   (dateSet は日付キー、numberSet は数を文字列にしたもの。数や日付でない値はそのまま)。
const pickValues = <T,>(
  column: AskColumn<T>,
  raw: unknown,
  mode: SetMode,
  context: BuildContext,
): Built<string[]> => {
  if (!Array.isArray(raw)) {
    return ng('選ぶ値がありません');
  }
  const current = setOf(context.original);
  const echoed = new Set(current?.values ?? []);
  if (raw.length > VALUES_LIMIT) {
    context.dropped.push(
      `${column.title}: 選べる値は ${VALUES_LIMIT} 件までです(${raw.length - VALUES_LIMIT} 件は使いませんでした)`,
    );
  }
  const picked = new Set<string>();
  const unknown: string[] = [];
  let unreadable = 0;
  let tooLong = 0;
  for (const item of raw.slice(0, VALUES_LIMIT)) {
    if (typeof item !== 'string' && !(typeof item === 'number' && Number.isFinite(item))) {
      unreadable += 1;
      continue;
    }
    const text = toRawText(item);
    if (echoed.has(text)) {
      picked.add(text);
      continue;
    }
    const trimmed = text.trim();
    if (trimmed.length > VALUE_TEXT_LIMIT) {
      tooLong += 1;
      continue;
    }
    let value: string | null = trimmed;
    if (trimmed === '' || echoed.has(trimmed)) {
      value = trimmed;
    } else if (column.options) {
      value = matchOption(column.options, text);
    } else if (column.filterType === 'dateSet') {
      value = toDateKey(trimmed) ?? trimmed;
    } else if (column.filterType === 'numberSet') {
      // '1,000' / '１０００' / '1000.0' も同じ数のキーにします(比べる条件と同じく parseNumberText で読む)。
      const number = parseNumberText(trimmed);
      value = number === null ? trimmed : String(number);
    }
    if (value === null) {
      unknown.push(text);
    } else {
      picked.add(value);
    }
  }
  if (unknown.length > 0) {
    context.dropped.push(`${column.title}: ${quoteList(unknown)}は候補にありません`);
  }
  if (tooLong > 0) {
    context.dropped.push(`${column.title}: ${VALUE_TEXT_LIMIT} 字を超える値(${tooLong} 件)は使えません`);
  }
  if (unreadable > 0) {
    context.dropped.push(`${column.title}: 値として読めないもの(${unreadable} 件)は使えません`);
  }
  // Current view に書かなかった今の選択の残りは、AI が見ていないので AI の答えでは消しません。同じ op のまま
  //   refine で言い直したとき、または replace でも見せた値を全部書いてきたとき(言い直し)に残します。
  if (current !== null && current.mode === mode && current.values.length > VIEW_VALUES_LIMIT) {
    const listed = current.values.slice(0, VIEW_VALUES_LIMIT);
    if (context.refine || listed.every((value) => picked.has(value))) {
      for (const value of current.values.slice(VIEW_VALUES_LIMIT)) {
        picked.add(value);
      }
    }
  }
  return picked.size > 0 ? ok([...picked]) : ng('選べる値がありません');
};

const buildFilterValue = <T,>(
  column: AskColumn<T>,
  op: GridAskOp,
  filter: Record<string, unknown>,
  context: BuildContext,
): Built<ColumnFilterValue> => {
  const filterType = column.filterType as AskFilterType;
  const original = context.original;
  switch (filterType) {
    case 'text':
    case 'date': {
      const value = toText(filter.value);
      if (value === '') {
        return ng('探す文字がありません');
      }
      // 前後の空白だけが違う言い直しは今の値のまま(グリッドも前後の空白を外して比べる)。
      if ((original?.kind === 'text' || original?.kind === 'date') && original.kind === filterType && original.value.trim() === value) {
        return ok({ kind: filterType, value: original.value });
      }
      return value.length > TEXT_LIMIT ? ng(tooLongText()) : ok({ kind: filterType, value });
    }
    case 'select': {
      const text = toRawText(filter.value);
      if (text.trim() === '') {
        return ng('選ぶ値がありません');
      }
      if (original?.kind === 'select' && (original.value === text || original.value === text.trim())) {
        return ok({ kind: 'select', value: original.value });
      }
      const value = column.options ? matchOption(column.options, text) : text.trim();
      if (value === null) {
        return ng(`「${quote(text)}」は候補にありません`);
      }
      // '' は「すべて」(条件なし)と同じなので選べません。
      if (value === '') {
        return ng(`「${quote(text)}」では絞り込めません`);
      }
      return value.length > VALUE_TEXT_LIMIT ? ng(`${VALUE_TEXT_LIMIT} 字を超える値は使えません`) : ok({ kind: 'select', value });
    }
    case 'set': {
      const mode: SetMode = op === 'notIn' ? 'exclude' : 'include';
      const picked = pickValues(column, filter.values, mode, context);
      return 'error' in picked ? picked : ok({ kind: 'set', mode, values: picked.value });
    }
    case 'number': {
      const parsed = buildNumberCondition(op, filter);
      if ('error' in parsed) {
        return parsed;
      }
      // 同じ条件の言い直しは、利用者が打った書き方(raw)のまま残します。
      if (original?.kind === 'number' && isSameColumnFilterValue({ kind: 'number', raw: original.raw, parsed: parsed.value }, original)) {
        return ok(cloneColumnFilterValue(original));
      }
      return ok({ kind: 'number', raw: formatParsedNumberFilter(parsed.value), parsed: parsed.value });
    }
    default: {
      // 条件 AND 選択の複合です。同じ答えの中で同じ列に条件と選択が 1 つずつ来たら合わせます。refine で
      //   片方だけ来たときは、今の記述子のもう片方を残します(「さらに 0 は除いて」で「10 以下」を消さない)。
      const base = context.base;
      const next: CompositeValue =
        base && base.kind === filterType
          ? (cloneColumnFilterValue(base) as CompositeValue)
          : ({ kind: filterType, condition: null, set: null } as CompositeValue);
      if (op === 'in' || op === 'notIn') {
        if (context.fixed.has('set')) {
          return ng('値の選択は 1 列に 1 つまでです');
        }
        const mode: SetMode = op === 'notIn' ? 'exclude' : 'include';
        const picked = pickValues(column, filter.values, mode, context);
        if ('error' in picked) {
          return picked;
        }
        next.set = { mode, values: picked.value };
        return ok(next);
      }
      if (context.fixed.has('condition')) {
        return ng('条件は 1 列に 1 つまでです');
      }
      if (next.kind === 'numberSet') {
        const parsed = buildNumberCondition(op, filter);
        if ('error' in parsed) {
          return parsed;
        }
        next.condition = parsed.value;
      } else if (next.kind === 'textSet') {
        const parsed = buildTextCondition(op, filter);
        if ('error' in parsed) {
          return parsed;
        }
        next.condition = parsed.value;
      } else {
        const parsed = buildDateCondition(column, op, filter);
        if ('error' in parsed) {
          return parsed;
        }
        next.condition = parsed.value;
      }
      return ok(next);
    }
  }
};

const READ_ERROR = 'AI の答えを読めませんでした。言い方を変えて、もう一度試してください。';
const SHAPE_ERROR = 'AI の答えが表への指示になっていませんでした。言い方を変えてください。';

// 答えが文字列なら JSON として読みます(```json の囲みや前後の文は外します)。
const parseAnswer = (answer: unknown): unknown => {
  if (typeof answer !== 'string') {
    return answer;
  }
  const body = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return undefined;
    }
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readDirection = (value: unknown): 'asc' | 'desc' | null => {
  const text = toText(value).toLowerCase();
  if (text === 'asc' || text === 'ascending') {
    return 'asc';
  }
  return text === 'desc' || text === 'descending' ? 'desc' : null;
};

// AI に見せていない列の並びは残します(Current view に出していないので AI は書けません)。AI の並びが今の並び
//   (見せた列の分)と同じなら今の並びのまま、変わったときは AI の並びの後ろに足します(頼まれた並びを先にする)。
const withKeptSort = (
  next: GridSortEntry[],
  current: readonly GridSortEntry[],
  isAskable: (key: string) => boolean,
): GridSortEntry[] => {
  const shown = current.filter((entry) => isAskable(entry.columnKey));
  if (isSameSortState(next, shown)) {
    return current.map((entry) => ({ ...entry }));
  }
  return [...next, ...current.filter((entry) => !isAskable(entry.columnKey)).map((entry) => ({ ...entry }))];
};

const limitDropped = (dropped: string[]): string[] =>
  dropped.length > DROPPED_LIMIT
    ? [...dropped.slice(0, DROPPED_LIMIT - 1), `ほか ${dropped.length - DROPPED_LIMIT + 1} 件`]
    : dropped;

/**
 * ask の答えを検査して、反映する状態へ変えます。`state` は頼みを組み立てたときと同じ今の状態(`getState()`)です。
 * 無い列・その列で使えない条件・候補に無い値は捨て、`dropped` に理由を入れます。
 */
export const readGridAskAnswer = <T,>(
  answer: unknown,
  state: GridState,
  options: GridAskOptions<T>,
): GridAskResult => {
  const parsed = parseAnswer(answer);
  if (parsed === undefined) {
    return { ok: false, message: READ_ERROR };
  }
  // 表への指示に見えない答え(サーバーのエラーの { error } など)と mode が違う答えは、表を変えずに読めなかった
  //   ことにします(replace として読むと、表の条件が全部消えるため)。mode が無いだけなら replace、filters が
  //   無いだけ(並びだけを返した答えなど)なら条件なしとして読みます。
  const source = asRecord(parsed);
  const mode = source?.mode;
  const filtersField = source?.filters;
  if (
    !source ||
    (mode !== undefined && mode !== 'replace' && mode !== 'refine') ||
    (filtersField !== undefined && !Array.isArray(filtersField)) ||
    (filtersField === undefined && mode === undefined)
  ) {
    return { ok: false, message: SHAPE_ERROR };
  }
  const rawFilters: unknown[] = Array.isArray(filtersField) ? filtersField : [];
  const columns = resolveAskColumns(options, state);
  const byKey = new Map(columns.map((column) => [column.key, column]));
  // 列は key で引き、無ければ見出し(同じ見出しが 1 列だけのとき)で引きます。
  const byTitle = new Map<string, AskColumn<T> | null>();
  for (const column of columns) {
    byTitle.set(column.title, byTitle.has(column.title) ? null : column);
  }
  const resolveColumn = (raw: unknown): AskColumn<T> | undefined => {
    const text = toText(raw);
    return byKey.get(text) ?? byTitle.get(text) ?? undefined;
  };
  const allowFilter = isAllowed(options.allowFilter, true);
  const allowSort = isAllowed(options.allowSort, true);
  const allowSearch = isAllowed(options.allowSearch, true);
  const allowColumnVisibility = isAllowed(options.allowColumnVisibility, false);
  const refine = mode === 'refine';
  const dropped: string[] = [];

  // replace は AI に見せた列の条件・並び・検索を空にしてから始めます。AI が変えられない条件(見せていない列の
  //   条件と並び、絞り込めない列 = custom などのフィルター)と、隠した列はそのままです。
  //   条件は Map で持ちます(列の key が '__proto__' でも普通のキーとして扱うため)。
  const columnFilters = new Map<string, ColumnFilterValue>();
  for (const [key, value] of Object.entries(state.filters.columnFilters)) {
    const column = byKey.get(key);
    if (refine || !column || column.filterType === null) {
      columnFilters.set(key, cloneColumnFilterValue(value));
    }
  }
  const isAskable = (key: string): boolean => byKey.has(key);
  let sort: GridSortEntry[] =
    refine || !allowSort ? state.sort.map((entry) => ({ ...entry })) : withKeptSort([], state.sort, isAskable);
  let globalText = refine || !allowSearch ? state.filters.globalText : '';

  if (!allowFilter) {
    if (rawFilters.length > 0) {
      dropped.push('列の条件は変えない設定です');
    }
  } else {
    const touched = new Set<string>();
    // 複合列で、同じ答えの中でもう決めた側(条件 / 選択)です。
    const fixedSides = new Map<string, Set<CompositeSide>>();
    for (const rawFilter of rawFilters) {
      const filter = asRecord(rawFilter);
      if (!filter) {
        continue;
      }
      const column = resolveColumn(filter.column);
      if (!column) {
        dropped.push(`「${columnLabel(filter.column)}」という列はありません`);
        continue;
      }
      const opText = typeof filter.op === 'string' ? filter.op.trim() : '';
      if (column.filterType === null) {
        dropped.push(`${column.title}: この列では絞り込めません`);
        continue;
      }
      if (opText === '') {
        dropped.push(`${column.title}: 条件の種類がありません`);
        continue;
      }
      const op = opText as GridAskOp;
      if (!column.ops.includes(op)) {
        // OP_LABELS は自分のキーだけを引きます('toString' などで prototype の値を出さない)。
        const opLabel = Object.prototype.hasOwnProperty.call(OP_LABELS, op) ? OP_LABELS[op] : quote(filter.op);
        dropped.push(`${column.title}: この列では「${opLabel}」の条件は使えません`);
        continue;
      }
      if (op === 'clear') {
        columnFilters.delete(column.key);
        touched.delete(column.key);
        fixedSides.delete(column.key);
        continue;
      }
      const isComposite =
        column.filterType === 'numberSet' || column.filterType === 'textSet' || column.filterType === 'dateSet';
      if (touched.has(column.key) && !isComposite) {
        dropped.push(`${column.title}: 条件は 1 列に 1 つまでです`);
        continue;
      }
      // replace では AI に見せた列の今の条件を消してあるので、base は同じ答えで先に決めた値だけになります。
      const sides = fixedSides.get(column.key) ?? new Set<CompositeSide>();
      const built = buildFilterValue(column, op, filter, {
        original: ownValue(state.filters.columnFilters, column.key),
        base: columnFilters.get(column.key),
        fixed: sides,
        refine,
        dropped,
      });
      if ('error' in built) {
        dropped.push(`${column.title}: ${built.error}`);
        continue;
      }
      columnFilters.set(column.key, built.value);
      touched.add(column.key);
      if (isComposite) {
        sides.add(op === 'in' || op === 'notIn' ? 'set' : 'condition');
        fixedSides.set(column.key, sides);
      }
    }
  }

  if (Array.isArray(source.sort)) {
    if (!allowSort) {
      if (source.sort.length > 0) {
        dropped.push('並びは変えない設定です');
      }
    } else {
      const nextSort: GridSortEntry[] = [];
      for (const rawEntry of source.sort) {
        const entry = asRecord(rawEntry);
        const column = entry ? resolveColumn(entry.column) : undefined;
        if (!entry || !column) {
          dropped.push(`並び: 「${columnLabel(entry?.column)}」という列はありません`);
          continue;
        }
        const direction = readDirection(entry.direction);
        if (direction === null) {
          dropped.push(`並び: ${column.title} の向き「${quote(entry.direction)}」は使えません`);
          continue;
        }
        if (!nextSort.some((item) => item.columnKey === column.key)) {
          nextSort.push({ columnKey: column.key, direction });
        }
      }
      sort = withKeptSort(nextSort, state.sort, isAskable);
    }
  }

  if (typeof source.search === 'string') {
    const search = source.search.trim();
    const currentSearch = state.filters.globalText;
    if (!allowSearch) {
      // 空は replace の「空から始める」どおりに返しただけなので知らせません(検索はそのまま)。
      if (search !== '' && search !== currentSearch.trim()) {
        dropped.push('検索の文字は変えない設定です');
      }
    } else if (search !== '' && search === currentSearch.trim()) {
      // 前後の空白だけが違う言い直しは今の文字のまま。
      globalText = currentSearch;
    } else if (search.length > TEXT_LIMIT) {
      dropped.push(`検索の文字は ${TEXT_LIMIT} 字までです`);
    } else {
      globalText = search;
    }
  }

  let nextColumns = state.columns?.map((entry) => ({ ...entry }));
  const hide = Array.isArray(source.hide) ? source.hide.filter((key) => toText(key) !== '') : [];
  const show = Array.isArray(source.show) ? source.show.filter((key) => toText(key) !== '') : [];
  if (hide.length > 0 || show.length > 0) {
    if (!allowColumnVisibility || !nextColumns) {
      dropped.push('列の表示は変えない設定です');
    } else {
      const present = new Set(nextColumns.map((entry) => entry.key));
      const showSet = new Set<string>();
      const hideSet = new Set<string>();
      for (const [list, target] of [[show, showSet], [hide, hideSet]] as const) {
        for (const raw of list) {
          const column = resolveColumn(raw);
          if (column && present.has(column.key)) {
            target.add(column.key);
          } else {
            dropped.push(`「${columnLabel(raw)}」という列はありません`);
          }
        }
      }
      const applied = nextColumns.map((entry) => {
        if (hideSet.has(entry.key)) {
          return { ...entry, visible: false };
        }
        if (showSet.has(entry.key) && entry.visible === false) {
          return withoutVisible(entry);
        }
        return entry;
      });
      if (applied.length > 0 && applied.every((entry) => entry.visible === false)) {
        dropped.push('すべての列は隠せません');
      } else {
        nextColumns = applied;
      }
    }
  }

  const unsupported =
    typeof source.unsupported === 'string' && source.unsupported.trim() !== ''
      ? source.unsupported.trim().slice(0, UNSUPPORTED_LIMIT)
      : null;
  const nextState: GridState = {
    version: state.version,
    columnWidths: { ...state.columnWidths },
    filters: { globalText, columnFilters: Object.fromEntries(columnFilters) },
    sort,
    columns: nextColumns,
  };
  return {
    ok: true,
    state: nextState,
    changed: !isSameGridAskView(nextState, state),
    dropped: limitDropped(dropped),
    unsupported,
  };
};

// ── 見え方の比べ方とチップ ──

const sameHidden = (a: GridColumnState[] | undefined, b: GridColumnState[] | undefined): boolean => {
  const left = hiddenKeysOf(a).sort();
  const right = hiddenKeysOf(b).sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
};

/**
 * 2 つの状態の「見え方」(フィルター / 並び / 検索 / 隠した列)が同じかを返します(列幅・列の順番・固定は見ません)。
 * 反映したあとに表が手で変えられたか(元に戻してよいか)の判定に使います。
 */
export const isSameGridAskView = (a: GridState, b: GridState): boolean =>
  isSameFilterState(a.filters, b.filters) && isSameSortState(a.sort, b.sort) && sameHidden(a.columns, b.columns);

/**
 * 隠した列が 2 つの状態で違うかを返します。違うときだけ applyState に columns を渡します
 * (同じなら列定義を onColumnsChange で書き直さないため)。
 */
export const isGridAskColumnsChanged = (a: GridState, b: GridState): boolean => !sameHidden(a.columns, b.columns);

/**
 * 状態の見え方をチップ用の一覧にします(フィルター → 並び → 検索 → 隠した列の順)。
 * 隠した列は allowColumnVisibility のときだけ出します。
 */
export const describeGridAskView = <T,>(state: GridState, options: GridAskOptions<T>): GridAskItem[] => {
  const byKey = new Map(options.columns.map((column) => [column.key, column]));
  const titleOf = (key: string): string => byKey.get(key)?.title || key;
  const items: GridAskItem[] = [];
  for (const [key, value] of Object.entries(state.filters.columnFilters)) {
    const column = byKey.get(key);
    const presets = column ? normalizeDateFilterPresets(column.dateFilterPresets) : undefined;
    items.push({ id: `f:${key}`, label: titleOf(key), text: describeColumnFilterValue(value, presets) });
  }
  for (const entry of state.sort) {
    items.push({
      id: `s:${entry.columnKey}`,
      label: '並び',
      text: `${titleOf(entry.columnKey)} ${entry.direction === 'desc' ? '降順' : '昇順'}`,
    });
  }
  if (state.filters.globalText !== '') {
    items.push({ id: 'q', label: '検索', text: `「${state.filters.globalText}」` });
  }
  if (isAllowed(options.allowColumnVisibility, false)) {
    for (const key of hiddenKeysOf(state.columns)) {
      items.push({ id: `h:${key}`, label: '隠した列', text: titleOf(key) });
    }
  }
  return items;
};

/**
 * チップ 1 件を外した状態を返します(id は describeGridAskView の id)。
 */
export const removeGridAskItem = (state: GridState, id: string): GridState => {
  const columnFilters = { ...state.filters.columnFilters };
  let { globalText } = state.filters;
  let sort = state.sort;
  let columns = state.columns;
  if (id.startsWith('f:')) {
    delete columnFilters[id.slice(2)];
  } else if (id.startsWith('s:')) {
    sort = sort.filter((entry) => entry.columnKey !== id.slice(2));
  } else if (id === 'q') {
    globalText = '';
  } else if (id.startsWith('h:')) {
    const key = id.slice(2);
    columns = columns?.map((entry) => (entry.key === key ? withoutVisible(entry) : entry));
  }
  return {
    ...state,
    filters: { globalText, columnFilters },
    sort: sort.map((entry) => ({ ...entry })),
    columns: columns?.map((entry) => ({ ...entry })),
  };
};