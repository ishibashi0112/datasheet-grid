import { createPortal } from 'react-dom';
import { cx } from '../logic/cx';
// 追加(filter-ext E): 'auto' を解決した後の実効フィルター種別です。
import type { ColumnFilterUiType } from '../model/gridTypes';
// 変更(12-A): set フィルター(検索 + Select All + チェックボックス一覧)用に
//             hooks と useVirtualizer を追加 import します。
//             候補リストは品番のように 5,000 件規模になり得るため、
//             本体グリッドと同じ @tanstack/react-virtual で行仮想化します。
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
// 追加(SF-ENTER): set フィルター検索の一致関数と Enter 確定の振る舞い判定です(純関数)。
//   view ファイルからの非コンポーネント export は react-refresh 制約(eslint baseline)に
//   触れるため、logic/setFilterSearch.ts に置いて共有しています。
import {
  filterSetOptionsBySearch,
  resolveSetFilterEnterAction,
} from '../logic/setFilterSearch';
// 追加(LINT-1): set 選択状態 { mode, values } 型と mode 判定ヘルパです。react-refresh 制約
//   (view からの非コンポーネント export)解消のため logic/setFilterSelection.ts へ移設しました。
import {
  isSetValueSelected,
  type ColumnFilterSetSelection,
} from '../logic/setFilterSelection';
// 追加(filter-ext A): number フィルターの演算子セレクト UI 用の純ロジックです
//   (演算子一覧 / 値入力の個数 / 既定 draft)。draft の合成・復元は親(SpreadsheetGrid /
//   useFilterPopoverController)側の責務で、本 view は draft の表示と編集通知だけを行います。
// 変更(filter-ext B): numberSet(条件 AND 選択)の候補連動 ── 条件 draft から parsed を
//   合成し、Set 候補一覧を絞る ── のためのヘルパを追加 import します。
import {
  DEFAULT_NUMBER_FILTER_DRAFT,
  NUMBER_FILTER_OPERATOR_OPTIONS,
  buildParsedNumberFilterFromDraft,
  filterOptionsByNumberCondition,
  numberFilterOperandCount,
  type NumberFilterConditionDraft,
  type NumberFilterOperator,
} from '../logic/numberFilterCondition';
// 追加(filter-ext C): textSet のテキスト条件エディタ用の純ロジックです(数値版と同型)。
import {
  DEFAULT_TEXT_FILTER_DRAFT,
  TEXT_FILTER_OPERATOR_OPTIONS,
  buildParsedTextFilterFromDraft,
  filterOptionsByTextCondition,
  textFilterOperandCount,
  type TextFilterConditionDraft,
  type TextFilterOperator,
} from '../logic/textFilterCondition';
// 追加(filter-ext D): dateSet の日付条件エディタ(プリセットチップ含む)用の純ロジックです。
import {
  DATE_FILTER_OPERATOR_OPTIONS,
  DATE_FILTER_PRESET_OPTIONS,
  DEFAULT_DATE_FILTER_DRAFT,
  buildParsedDateFilterFromDraft,
  dateFilterOperandCount,
  filterOptionsByDateCondition,
  type DateFilterConditionDraft,
  type DateFilterOperator,
} from '../logic/dateFilterCondition';
// 追加(filter-ext D): dateSet の年月日ツリー(平坦化された可視行)です。
import {
  buildDateTreeRows,
  type DateTreeRow,
} from '../logic/dateFilterTree';

// 追加: popover のレイアウト情報です。
// 追加(FIT-1): maxHeight(viewport 内へ収める上限)。指定時は popover の flex 化と併せて
//   候補リストが縮んで内部スクロールになります(画面外はみ出しの防止)。
export type ColumnFilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
  maxHeight?: number;
};

// 追加: select / set フィルター候補の最小型です。
export type ColumnFilterPopoverOption = {
  label: string;
  value: string;
};

type ColumnFilterPopoverProps = {
  isOpen: boolean;
  // 追加(TH-DK-2): ダークテーマ修飾子クラス('ssg-theme-dark' | undefined)。ポータルは
  //   .ssg-root 外のため、root と同じ修飾子を自身の root 要素へ直接付与します。
  themeClassName?: string;
  title: string;
  // 変更(12-A): 'set' を追加します。
  // 変更(filter-ext E): 'auto' を含まない「解決済み」種別を受けます(解決は controller の責務)。
  filterType: ColumnFilterUiType;
  draftValue: string;
  // 追加(filter-ext A): number 列の構造化条件 draft です(number / numberSet 以外は null)。
  //   旧「>=10」式テキストに代わり、演算子セレクト + 値入力(0〜2 個)で編集します。
  numberConditionDraft: NumberFilterConditionDraft | null;
  onNumberConditionDraftChange: (draft: NumberFilterConditionDraft) => void;
  // 追加(filter-ext C): textSet のテキスト条件 draft です(textSet 以外は null)。
  textConditionDraft: TextFilterConditionDraft | null;
  onTextConditionDraftChange: (draft: TextFilterConditionDraft) => void;
  // 追加(filter-ext D): dateSet の日付条件 draft です(dateSet 以外は null)。
  dateConditionDraft: DateFilterConditionDraft | null;
  onDateConditionDraftChange: (draft: DateFilterConditionDraft) => void;
  // 追加(filter-ext B/C): 複合(numberSet / textSet)の個別クリアです(条件のみ / 値のみ。
  //   フッターの「クリア」は全消し ── クリアの 3 粒度は合意仕様 §4-2)。
  onComboConditionClear: () => void;
  onComboSelectionClear: () => void;
  // 追加(filter-ext B/C): 複合のフッター上に出すサマリーです
  //   (「10 以上 かつ 3 件を選択」。即時適用のため適用済み記述子から親が生成します)。
  comboSummaryText: string;
  currentValueText: string;
  layout: ColumnFilterPopoverLayout | null;
  selectOptions: ColumnFilterPopoverOption[];
  // 追加(DS-4 #1): 候補収集の状態です。'collecting' の間は universe(総数 / 全値集合)が未確定の
  //   ため、set / select の操作 UI を出さず「収集中」を表示します(部分集合での誤確定を防ぐ)。
  optionsStatus: 'idle' | 'collecting' | 'ready';
  optionsProgress: number;
  // 変更(反転set): set 選択状態を { mode, values }(小さい側のみ)で受けます。null = 全選択。
  setSelection: ColumnFilterSetSelection | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  // 注記(12-A): set フィルターでは検索ボックスへこの ref を割り当て、
  //             useFilterPopoverController の autofocus をそのまま流用します。
  textInputRef: RefObject<HTMLInputElement | null>;
  selectRef: RefObject<HTMLSelectElement | null>;
  onRequestClose: () => void;
  onDraftChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  // 追加(12-A): set フィルターのチェックボックス 1 件トグルです(即時適用)。
  onSetValueToggle: (value: string) => void;
  // 追加(12-A): (Select All) の一括トグルです。検索中は「表示中の候補のみ」を
  //             対象にするため、対象 values を popover 側から渡します(AG Grid と同挙動)。
  // 変更(反転set): scope='all'(非検索=全候補) か 表示中候補の values(検索中=小さい側)。
  //   非検索の全選択/全解除で 30 万件配列を作らないため 'all' を区別します。
  onSetSelectAllChange: (
    scope: 'all' | string[],
    nextSelected: boolean,
  ) => void;
  // 追加(12-A): set フィルターの「クリア」です。popover を閉じずに全選択へ戻します
  //             (即時適用のため、結果を見ながら操作を続けられるようにします)。
  onSetClear: () => void;
  // 追加(SF-ENTER): 検索 Enter 確定です。選択を「検索一致値のみ」へ置換します
  //   (Excel の検索 → OK 相当。0 件一致は popover 側で no-op 済みです)。
  onSetReplaceSelection: (values: string[]) => void;
  // 追加(stage ②): serverSide か否か。set/select で候補が空のとき、空表示の文言を
  //   「検索ヒット無し」と「候補未供給(serverSide では filterOptions / サーバ供給が必要)」で
  //   出し分けるために使います(既定 false = clientSide で従来表示)。
  isServerSide?: boolean;
};

// 追加(12-A): set フィルター候補リストの行高です(仮想化の estimateSize と一致させます)。
const SET_FILTER_OPTION_ROW_HEIGHT = 28;

// ── set フィルター本体 ──────────────────────────────────
// 追加(12-A): set フィルターの検索 state / 仮想化は popover 全体とライフサイクルが
//             異なる(開閉でリセットしたい・親 SpreadsheetGrid を再レンダーさせたくない)
//             ため、独立した子 component に切り出して hooks を持たせます。
//             検索テキストはこのローカル state に閉じるため、タイピングしても
//             再レンダーは popover 内部のみで完結します(本体 5,000 行は無関係)。
type SetFilterBodyProps = {
  options: ColumnFilterPopoverOption[];
  // 変更(反転set): { mode, values }(小さい側のみ)。null = 全選択(フィルターなし)です。
  setSelection: ColumnFilterSetSelection | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onValueToggle: (value: string) => void;
  onSelectAllChange: (scope: 'all' | string[], nextSelected: boolean) => void;
  // 追加(SF-ENTER): 検索 Enter 確定です。選択を「一致値のみ」へ置換します(親側で
  //   include 集合として commit され、全候補一致は clear へ正規化されます)。
  onReplaceSelection: (values: string[]) => void;
  onRequestClose: () => void;
  // 追加(stage ②): 候補空時の空表示文言を出し分けるために親から受けます。
  isServerSide: boolean;
  // 追加(filter-ext B): (すべて選択) を常に明示リスト(表示中候補の values)で通知します。
  //   numberSet では options が条件絞り後のため、'all'(universe)スコープだと候補外の値の
  //   選択保持(合意仕様 §4-1)が壊れます。set 列は従来どおり非検索時 'all'
  //   (30 万件規模で巨大配列を作らない反転set 最適化)を使います。
  selectAllUsesExplicitScope?: boolean;
};

function SetFilterBody({
  options,
  setSelection,
  searchInputRef,
  onValueToggle,
  onSelectAllChange,
  onReplaceSelection,
  onRequestClose,
  isServerSide,
  selectAllUsesExplicitScope = false,
}: SetFilterBodyProps) {
  const [searchText, setSearchText] = useState('');
  // 追加(12-A): 候補 5,000 件規模での連続タイピングに備え、絞り込み計算は
  //             低優先度レンダーへ遅延します(11-B7 のグローバルフィルタと同型)。
  const deferredSearchText = useDeferredValue(searchText);

  // 変更(SF-ENTER): 絞り込みを filterSetOptionsBySearch へ共通化します(Enter 確定の
  //   再マッチと一致基準を共有するため。挙動は従来と同一です)。
  const visibleOptions = useMemo(
    () => filterSetOptionsBySearch(options, deferredSearchText),
    [options, deferredSearchText],
  );

  const isSearching = deferredSearchText.trim().length > 0;

  // 追加(12-A): 候補リストの行仮想化です。表示領域ぶん + overscan のみ DOM 化します。
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const optionVirtualizer = useVirtualizer({
    count: visibleOptions.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => SET_FILTER_OPTION_ROW_HEIGHT,
    overscan: 10,
  });

  // ── (Select All) の 3 状態判定(表示中候補が対象) ──
  const visibleSelectedCount = useMemo(() => {
    if (setSelection === null) {
      return visibleOptions.length;
    }
    let count = 0;
    for (const option of visibleOptions) {
      if (isSetValueSelected(setSelection, option.value)) {
        count += 1;
      }
    }
    return count;
  }, [setSelection, visibleOptions]);

  const isAllVisibleSelected =
    visibleOptions.length > 0 && visibleSelectedCount === visibleOptions.length;
  const isSomeVisibleSelected =
    visibleSelectedCount > 0 && !isAllVisibleSelected;

  // 変更(反転set): mode から算出します(巨大側を materialize しません)。
  // 変更(filter-ext B): 候補連動で options が絞られている場合、selection.values には候補外の
  //   値(保持中の選択状態)が含まれ得るため、「現在の候補に含まれる値」だけを数えます。
  //   values は常に小さい側の規約なので O(values)。set 列(options = universe)では
  //   従来の O(1) 計算と同値です。
  const optionValueSet = useMemo(
    () => new Set(options.map((option) => option.value)),
    [options],
  );
  const totalSelectedCount = useMemo(() => {
    if (setSelection === null) {
      return options.length;
    }
    let inListCount = 0;
    for (const value of setSelection.values) {
      if (optionValueSet.has(value)) {
        inListCount += 1;
      }
    }
    return setSelection.mode === 'include'
      ? inListCount
      : options.length - inListCount;
  }, [setSelection, optionValueSet, options.length]);

  const handleSelectAllToggle = () => {
    // 変更(反転set): 非検索時は scope='all' を渡し、30 万件の values 配列を作りません。
    //   検索中のみ表示中候補(=小さい側)の values を渡します。
    // 変更(filter-ext B): 明示スコープ指定時(numberSet)は常に表示中候補を渡します。
    onSelectAllChange(
      isSearching || selectAllUsesExplicitScope
        ? visibleOptions.map((option) => option.value)
        : 'all',
      !isAllVisibleSelected,
    );
  };

  return (
    <>
      <input
        ref={searchInputRef}
        type="text"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        onKeyDown={(event) => {
          // 追加: 検索ボックス内入力を grid 側へ伝播させません。
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onRequestClose();
          }
          // 追加(SF-ENTER): Enter で「検索一致値のみ」へ置換確定して閉じます
          //   (Excel の検索 → OK と同挙動。積み増しは(検索結果をすべて選択)チェックで)。
          if (event.key === 'Enter') {
            // IME 変換確定の Enter では発火させません(日本語入力で必須のガードです)。
            if (event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            // 注記: visibleOptions は useDeferredValue 由来で高速タイプ直後は古い結果を
            //   指しうるため、確定は「現在の searchText」からの同期再マッチで行います
            //   (全候補走査は Enter 1 回きりのため、候補数が大きくても許容します)。
            const action = resolveSetFilterEnterAction(options, searchText);
            if (action.kind === 'none') {
              return;
            }
            if (action.kind === 'replace') {
              onReplaceSelection(action.values);
            }
            onRequestClose();
          }
        }}
        placeholder="検索（Enter で確定）"
        className="ssg-filter-input"
      />

      {/* (Select All) 行: 検索中は表示中候補のみが対象です(AG Grid と同挙動) */}
      <label className="ssg-filter-selectall">
        <input
          type="checkbox"
          checked={isAllVisibleSelected}
          ref={(element) => {
            // 追加(12-A): 一部のみ選択中は indeterminate 表示にします。
            if (element) {
              element.indeterminate = isSomeVisibleSelected;
            }
          }}
          onChange={handleSelectAllToggle}
        />
        <span className="ssg-filter-selectall-label">
          {isSearching ? '（検索結果をすべて選択）' : '（すべて選択）'}
        </span>
      </label>

      {/* 候補リスト(仮想化) */}
      <div ref={listScrollRef} className="ssg-filter-list">
        {visibleOptions.length === 0 ? (
          <div className="ssg-filter-empty">
            {options.length === 0
              ? isServerSide
                ? '候補が未指定です（serverSide では列に filterOptions などの候補供給が必要）'
                : '候補がありません'
              : '一致する候補がありません'}
          </div>
        ) : (
          <div
            className="ssg-filter-virt"
            style={{ height: optionVirtualizer.getTotalSize() }}
          >
            {optionVirtualizer.getVirtualItems().map((virtualItem) => {
              const option = visibleOptions[virtualItem.index];
              if (!option) {
                return null;
              }
              const isChecked = isSetValueSelected(setSelection, option.value);
              return (
                <label
                  key={option.value}
                  className="ssg-filter-option"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                    height: virtualItem.size,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onValueToggle(option.value)}
                  />
                  <span className="ssg-filter-option-label">
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="ssg-filter-meta">
        選択中: {totalSelectedCount} / {options.length} 件
        {isSearching ? `（表示中 ${visibleOptions.length} 件）` : ''}
      </div>
    </>
  );
}

// ── number 条件エディタ(filter-ext A/B 共有) ──────────
// 追加(filter-ext B): 演算子セレクト + 値入力(0〜2 個)です。kind:'number' の popover と
//   numberSet の条件セクションが共有します。Enter / Escape の意味づけ(適用 or 閉じる)は
//   親が onKeyDown で渡します。
type NumberConditionEditorProps = {
  draft: NumberFilterConditionDraft;
  // autofocus 対象(controller の textInputRef)。値入力なしの演算子では未割り当てになります。
  valueInputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: NumberFilterConditionDraft) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
  ) => void;
};

function NumberConditionEditor({
  draft,
  valueInputRef,
  onDraftChange,
  onKeyDown,
}: NumberConditionEditorProps) {
  const operandCount = numberFilterOperandCount(draft.operator);
  return (
    <>
      <select
        value={draft.operator}
        onChange={(event) =>
          onDraftChange({
            ...draft,
            operator: event.target.value as NumberFilterOperator,
          })
        }
        onKeyDown={onKeyDown}
        className="ssg-filter-select"
        aria-label="条件の演算子"
      >
        {NUMBER_FILTER_OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {operandCount > 0 ? (
        <div className="ssg-filter-cond-values">
          {/* 注記: type="number" ではなく text + inputMode を使います(controller の
              autofocus が setSelectionRange を呼ぶため。number input は例外を投げます)。
              数値化は commit 時の parse(buildParsedNumberFilterFromDraft)の責務です。 */}
          <input
            ref={valueInputRef}
            type="text"
            inputMode="decimal"
            value={draft.value1}
            onChange={(event) =>
              onDraftChange({ ...draft, value1: event.target.value })
            }
            onKeyDown={onKeyDown}
            placeholder={operandCount === 2 ? '下限' : '値'}
            className="ssg-filter-input"
            aria-label={operandCount === 2 ? '下限' : '条件の値'}
          />
          {operandCount === 2 && (
            <>
              <span className="ssg-filter-cond-tilde">〜</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.value2}
                onChange={(event) =>
                  onDraftChange({ ...draft, value2: event.target.value })
                }
                onKeyDown={onKeyDown}
                placeholder="上限"
                className="ssg-filter-input"
                aria-label="上限"
              />
            </>
          )}
        </div>
      ) : (
        <div className="ssg-filter-meta">この演算子は値入力を使いません</div>
      )}
    </>
  );
}

// ── text 条件エディタ(filter-ext C) ────────────────────
// 追加(filter-ext C): 演算子セレクト + テキスト入力(0〜1 個)です。textSet の条件セクションが
//   使います(数値版 NumberConditionEditor と同型。値入力は最大 1 個なので範囲行はありません)。
type TextConditionEditorProps = {
  draft: TextFilterConditionDraft;
  valueInputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: TextFilterConditionDraft) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
  ) => void;
};

function TextConditionEditor({
  draft,
  valueInputRef,
  onDraftChange,
  onKeyDown,
}: TextConditionEditorProps) {
  const operandCount = textFilterOperandCount(draft.operator);
  return (
    <>
      <select
        value={draft.operator}
        onChange={(event) =>
          onDraftChange({
            ...draft,
            operator: event.target.value as TextFilterOperator,
          })
        }
        onKeyDown={onKeyDown}
        className="ssg-filter-select"
        aria-label="条件の演算子"
      >
        {TEXT_FILTER_OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {operandCount > 0 ? (
        <div className="ssg-filter-cond-values">
          <input
            ref={valueInputRef}
            type="text"
            value={draft.value}
            onChange={(event) =>
              onDraftChange({ ...draft, value: event.target.value })
            }
            onKeyDown={onKeyDown}
            placeholder="値"
            className="ssg-filter-input"
            aria-label="条件の値"
          />
        </div>
      ) : (
        <div className="ssg-filter-meta">この演算子は値入力を使いません</div>
      )}
    </>
  );
}

// ── 日付条件エディタ(filter-ext D) ─────────────────────
// 追加(filter-ext D): 演算子セレクト + <input type="date">(0〜2 個)+ 相対プリセットチップ
//   (今日 / 今月 / 過去 30 日)です。プリセット選択中は演算子・値より優先され(値入力は
//   非表示)、演算子や値を編集するとプリセットは解除されます。プリセットは相対のまま
//   保存され、フィルター評価のたびに解決されます(合意済み仕様)。
type DateConditionEditorProps = {
  draft: DateFilterConditionDraft;
  valueInputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: DateFilterConditionDraft) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
  ) => void;
};

function DateConditionEditor({
  draft,
  valueInputRef,
  onDraftChange,
  onKeyDown,
}: DateConditionEditorProps) {
  const operandCount =
    draft.preset !== null ? 0 : dateFilterOperandCount(draft.operator);
  return (
    <>
      <select
        value={draft.operator}
        onChange={(event) =>
          onDraftChange({
            ...draft,
            operator: event.target.value as DateFilterOperator,
            preset: null,
          })
        }
        onKeyDown={onKeyDown}
        className="ssg-filter-select"
        aria-label="条件の演算子"
      >
        {DATE_FILTER_OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {operandCount > 0 ? (
        <div className="ssg-filter-cond-values">
          <input
            ref={valueInputRef}
            type="date"
            value={draft.value1}
            onChange={(event) =>
              onDraftChange({ ...draft, value1: event.target.value, preset: null })
            }
            onKeyDown={onKeyDown}
            className="ssg-filter-input"
            aria-label={operandCount === 2 ? '開始日' : '条件の日付'}
          />
          {operandCount === 2 && (
            <>
              <span className="ssg-filter-cond-tilde">〜</span>
              <input
                type="date"
                value={draft.value2}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    value2: event.target.value,
                    preset: null,
                  })
                }
                onKeyDown={onKeyDown}
                className="ssg-filter-input"
                aria-label="終了日"
              />
            </>
          )}
        </div>
      ) : draft.preset === null ? (
        <div className="ssg-filter-meta">この演算子は値入力を使いません</div>
      ) : null}
      <div className="ssg-filter-presets">
        {DATE_FILTER_PRESET_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              // 同じチップの再クリックは解除(トグル)です。
              onDraftChange({
                ...draft,
                preset: draft.preset === option.value ? null : option.value,
              });
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            className={cx(
              'ssg-filter-preset-chip',
              draft.preset === option.value && 'ssg-filter-preset-chip--active',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ── dateSet の年月日ツリー本体(filter-ext D) ───────────
// 追加(filter-ext D): SetFilterBody のフラット一覧に代わる 3 階層ツリーです(日付は
//   ユニーク値が行数に比例するため。Excel と同じ構造)。検索中はフラット表示に切り替え、
//   一致関数・Enter 確定は SetFilterBody と共有します。親(年 / 月)は 3 状態チェックで、
//   トグルは配下リーフの一括選択 / 解除(onSelectAllChange の明示スコープ)として通知します。
type DateSetFilterBodyProps = {
  // 正規化済み日付キー候補です(normalizeDateSetOptions 済み・条件絞り後)。
  options: ColumnFilterPopoverOption[];
  setSelection: ColumnFilterSetSelection | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onValueToggle: (value: string) => void;
  onSelectAllChange: (scope: 'all' | string[], nextSelected: boolean) => void;
  onReplaceSelection: (values: string[]) => void;
  onRequestClose: () => void;
  isServerSide: boolean;
};

function DateSetFilterBody({
  options,
  setSelection,
  searchInputRef,
  onValueToggle,
  onSelectAllChange,
  onReplaceSelection,
  onRequestClose,
  isServerSide,
}: DateSetFilterBodyProps) {
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  // 展開状態(年 / 月ノードのキー集合)。既定は全て畳み(年のみ表示)です。
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const isSearching = deferredSearchText.trim().length > 0;
  const flatMatches = useMemo(
    () => filterSetOptionsBySearch(options, deferredSearchText),
    [options, deferredSearchText],
  );
  const treeRows = useMemo(
    () => buildDateTreeRows(options, expandedKeys),
    [options, expandedKeys],
  );

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const rowCount = isSearching ? flatMatches.length : treeRows.length;
  // 注記(filter-ext D): TanStack Virtual は React Compiler 非互換(メモ化スキップの情報警告)。
  //   SetFilterBody / 本体グリッドの useVirtualizer と同種の既知事象のため、eslint baseline を
  //   増やさないようここでは明示的に抑止します(挙動への影響はありません)。
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => SET_FILTER_OPTION_ROW_HEIGHT,
    overscan: 10,
  });

  // (すべて選択) の 3 状態(対象 = 検索中は一致リーフ / 非検索は全リーフ)。
  const selectAllScopeValues = useMemo(
    () =>
      (isSearching ? flatMatches : options).map((option) => option.value),
    [isSearching, flatMatches, options],
  );
  const selectAllSelectedCount = useMemo(() => {
    let count = 0;
    for (const value of selectAllScopeValues) {
      if (isSetValueSelected(setSelection, value)) {
        count += 1;
      }
    }
    return count;
  }, [selectAllScopeValues, setSelection]);
  const isAllVisibleSelected =
    selectAllScopeValues.length > 0 &&
    selectAllSelectedCount === selectAllScopeValues.length;
  const isSomeVisibleSelected =
    selectAllSelectedCount > 0 && !isAllVisibleSelected;

  // 選択中メタ(SetFilterBody と同じ規則: 候補内の選択数を数えます)。
  const optionValueSet = useMemo(
    () => new Set(options.map((option) => option.value)),
    [options],
  );
  const totalSelectedCount = useMemo(() => {
    if (setSelection === null) {
      return options.length;
    }
    let inListCount = 0;
    for (const value of setSelection.values) {
      if (optionValueSet.has(value)) {
        inListCount += 1;
      }
    }
    return setSelection.mode === 'include'
      ? inListCount
      : options.length - inListCount;
  }, [setSelection, optionValueSet, options.length]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // group(年 / 月)行の 3 状態と一括トグルです(配下リーフ基準)。
  const countSelectedLeaves = (leafKeys: string[]): number => {
    let count = 0;
    for (const key of leafKeys) {
      if (isSetValueSelected(setSelection, key)) {
        count += 1;
      }
    }
    return count;
  };

  const renderTreeRow = (row: DateTreeRow) => {
    const selectedLeafCount = countSelectedLeaves(row.leafKeys);
    const isChecked =
      row.leafKeys.length > 0 && selectedLeafCount === row.leafKeys.length;
    const isIndeterminate = selectedLeafCount > 0 && !isChecked;
    return (
      <>
        {row.type === 'group' ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleExpanded(row.key);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            className="ssg-filter-tree-toggle"
            aria-label={row.expanded ? '折りたたむ' : '展開する'}
          >
            {row.expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="ssg-filter-tree-toggle ssg-filter-tree-toggle--placeholder" />
        )}
        <input
          type="checkbox"
          checked={isChecked}
          ref={(element) => {
            if (element) {
              element.indeterminate = isIndeterminate;
            }
          }}
          onChange={() => {
            if (row.type === 'leaf') {
              onValueToggle(row.key);
              return;
            }
            // 親は配下リーフの一括トグルです(全選択なら解除 / それ以外は全選択)。
            onSelectAllChange(row.leafKeys, !isChecked);
          }}
        />
        <span className="ssg-filter-option-label">{row.label}</span>
      </>
    );
  };

  return (
    <>
      <input
        ref={searchInputRef}
        type="text"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onRequestClose();
          }
          // 検索 Enter 確定(SetFilterBody と同じ規則。IME 変換確定ガード付き)。
          if (event.key === 'Enter') {
            if (event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            const action = resolveSetFilterEnterAction(options, searchText);
            if (action.kind === 'none') {
              return;
            }
            if (action.kind === 'replace') {
              onReplaceSelection(action.values);
            }
            onRequestClose();
          }
        }}
        placeholder="検索（Enter で確定）"
        className="ssg-filter-input"
      />

      <label className="ssg-filter-selectall">
        <input
          type="checkbox"
          checked={isAllVisibleSelected}
          ref={(element) => {
            if (element) {
              element.indeterminate = isSomeVisibleSelected;
            }
          }}
          onChange={() =>
            onSelectAllChange(selectAllScopeValues, !isAllVisibleSelected)
          }
        />
        <span className="ssg-filter-selectall-label">
          {isSearching ? '（検索結果をすべて選択）' : '（すべて選択）'}
        </span>
      </label>

      <div ref={listScrollRef} className="ssg-filter-list">
        {rowCount === 0 ? (
          <div className="ssg-filter-empty">
            {options.length === 0
              ? isServerSide
                ? '候補が未指定です（serverSide では列に filterOptions などの候補供給が必要）'
                : '候補がありません'
              : '一致する候補がありません'}
          </div>
        ) : (
          <div
            className="ssg-filter-virt"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              if (isSearching) {
                const option = flatMatches[virtualItem.index];
                if (!option) {
                  return null;
                }
                return (
                  <label
                    key={option.value}
                    className="ssg-filter-option"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                      height: virtualItem.size,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSetValueSelected(setSelection, option.value)}
                      onChange={() => onValueToggle(option.value)}
                    />
                    <span className="ssg-filter-option-label">
                      {option.label}
                    </span>
                  </label>
                );
              }
              const row = treeRows[virtualItem.index];
              if (!row) {
                return null;
              }
              return (
                <div
                  key={row.key}
                  className="ssg-filter-option"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                    height: virtualItem.size,
                    paddingLeft: 8 + row.depth * 16,
                  }}
                >
                  {renderTreeRow(row)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ssg-filter-meta">
        選択中: {totalSelectedCount} / {options.length} 件
        {isSearching ? `（表示中 ${flatMatches.length} 件）` : ''}
      </div>
    </>
  );
}

// ── 複合フィルター(条件 AND 選択)の共通レイアウト(filter-ext B/C/D) ──
// 追加(filter-ext C): numberSet / textSet / dateSet が共有するセクション構造です
//   (条件ヘッダ + エディタ + 区切り + 値ヘッダ + Set 本体 + サマリー)。
//   条件エディタと Set 本体(フラット一覧 / 日付ツリー)が型ごとに異なるため、
//   エディタは ReactNode、Set 本体は children で受けます。
type ComboFilterLayoutProps = {
  conditionEditor: ReactNode;
  conditionActive: boolean;
  onConditionClear: () => void;
  // 条件絞り後の候補です(候補連動 §2.3。conditionActive で「一致 / 全」表示を切替)。
  options: ColumnFilterPopoverOption[];
  setSelection: ColumnFilterSetSelection | null;
  onSelectionClear: () => void;
  summaryText: string;
  children: ReactNode;
};

function ComboFilterLayout({
  conditionEditor,
  conditionActive,
  onConditionClear,
  options,
  setSelection,
  onSelectionClear,
  summaryText,
  children,
}: ComboFilterLayoutProps) {
  return (
    <>
      <div className="ssg-filter-sec-head">
        <span className="ssg-filter-sec-label">条件</span>
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onConditionClear();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          className="ssg-filter-sec-clear"
          disabled={!conditionActive}
        >
          クリア
        </button>
      </div>
      {conditionEditor}
      <div className="ssg-filter-sep" />
      <div className="ssg-filter-sec-head">
        <span className="ssg-filter-sec-label">値</span>
        <span className="ssg-filter-sec-meta">
          {conditionActive ? `一致 ${options.length} 件` : `全 ${options.length} 件`}
        </span>
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectionClear();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          className="ssg-filter-sec-clear"
          disabled={setSelection === null}
        >
          クリア
        </button>
      </div>
      {children}
      <div className="ssg-filter-summary">🔽 {summaryText}</div>
    </>
  );
}

// 追加: 列フィルター popover の view component です。
export function ColumnFilterPopover({
  isOpen,
  themeClassName,
  title,
  filterType,
  draftValue,
  numberConditionDraft,
  onNumberConditionDraftChange,
  textConditionDraft,
  onTextConditionDraftChange,
  dateConditionDraft,
  onDateConditionDraftChange,
  onComboConditionClear,
  onComboSelectionClear,
  comboSummaryText,
  currentValueText,
  layout,
  selectOptions,
  optionsStatus,
  optionsProgress,
  setSelection,
  popoverRef,
  textInputRef,
  selectRef,
  onRequestClose,
  onDraftChange,
  onApply,
  onClear,
  onSetValueToggle,
  onSetSelectAllChange,
  onSetClear,
  onSetReplaceSelection,
  isServerSide = false,
}: ColumnFilterPopoverProps) {
  // 追加(filter-ext B/C): 複合(numberSet / textSet / dateSet)の検索ボックス用ローカル ref です。
  //   複合では controller の textInputRef(autofocus 対象)を条件の値入力へ割り当てるため、
  //   Set 本体の検索ボックスにはこちらを渡します(early return より前に置くこと)。
  const comboSearchInputRef = useRef<HTMLInputElement | null>(null);
  // 追加(filter-ext D): 相対プリセットの候補絞り(表示)用の解決基準時刻です。マウント時に
  //   1 回だけ確保します(表示用途のみ。行の判定本体は filtering 側が再計算のたびに解決します。
  //   日付を跨いで開きっぱなしのケースは表示のみ僅かに stale になりますが許容します)。
  const [comboNow] = useState(() => new Date());

  if (typeof document === 'undefined' || !isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    top: layout.top,
    left: layout.left,
    width: layout.width,
    // 追加(FIT-1): viewport 内へ収める上限です(未指定は従来どおり内容なり)。
    maxHeight: layout.maxHeight,
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard イベントを React ツリー上の parent へ流しません。
    // 変更(SF-ENTER fix): capture 相(onKeyDownCapture)→ bubble 相(onKeyDown)へ変更します。
    // 変更理由: React 合成イベントで capture 相の stopPropagation() はネイティブ伝播ごと
    //   停止するため、popover 内部要素の bubble 相 onKeyDown ── 検索ボックスの
    //   Enter 確定(SF-ENTER)/ Escape close / text フィルターの Enter 適用 ── が
    //   一切発火しませんでした(文字入力は input イベント経由のため絞り込みだけ動く)。
    //   bubble 相なら「内部要素のハンドラが先に処理 → 最後にここで外側(React ツリー上の
    //   grid root / App)への合成バブリングだけを遮断」となり、本来の意図を保てます。
    //   なお grid root 側の onKeyDown は popup 開放中 undefined にゲート済みのため、
    //   capture で先回りする必要はもともとありません。
    event.stopPropagation();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: popover 内 pointer 操作を外側へ伝播させません。
    event.stopPropagation();
  };

  const isSetFilter = filterType === 'set';
  const isNumberSetFilter = filterType === 'numberSet';
  const isTextSetFilter = filterType === 'textSet';
  const isDateSetFilter = filterType === 'dateSet';
  const isComboFilter = isNumberSetFilter || isTextSetFilter || isDateSetFilter;
  // 追加(filter-ext B/C): set / 複合は即時適用 UI(適用ボタンなし・フッターは
  //   クリア + 閉じる・現在値テキスト行なし)を共有します。
  const isImmediateFilter = isSetFilter || isComboFilter;

  // 追加(filter-ext A/C/D): 条件 UI の draft です。draft は親(controller)管理ですが、
  //   万一 null が来ても表示が壊れないよう既定 draft でフォールバックします。
  const numberDraft = numberConditionDraft ?? DEFAULT_NUMBER_FILTER_DRAFT;
  const textDraft = textConditionDraft ?? DEFAULT_TEXT_FILTER_DRAFT;
  const dateDraft = dateConditionDraft ?? DEFAULT_DATE_FILTER_DRAFT;

  // 追加(filter-ext B/C/D): 候補連動(合意仕様 §2.3)── 条件 draft から parsed を合成し、
  //   Set 候補一覧を条件を満たす値だけに絞ります(条件なしは同一参照で素通し)。
  //   収集は全候補 1 回きり(collector)で、ここは表示時の軽量フィルタです。
  //   条件の型(数値 / テキスト / 日付)が違うため合成と絞りは kind 別に持ち、UI 判定
  //   (conditionActive)だけを共通化します。
  const numberComboCondition = isNumberSetFilter
    ? buildParsedNumberFilterFromDraft(numberDraft)
    : null;
  const textComboCondition = isTextSetFilter
    ? buildParsedTextFilterFromDraft(textDraft)
    : null;
  const dateComboCondition = isDateSetFilter
    ? buildParsedDateFilterFromDraft(dateDraft)
    : null;
  const comboConditionActive =
    numberComboCondition !== null ||
    textComboCondition !== null ||
    dateComboCondition !== null;
  const comboOptions = isNumberSetFilter
    ? filterOptionsByNumberCondition(selectOptions, numberComboCondition)
    : isTextSetFilter
      ? filterOptionsByTextCondition(selectOptions, textComboCondition)
      : isDateSetFilter
        ? filterOptionsByDateCondition(selectOptions, dateComboCondition, comboNow)
        : selectOptions;

  // 追加(filter-ext A): number 条件 UI(演算子 select / 値 input)共通の keyboard 操作です
  //   (Enter = 適用 / Escape = 閉じる。text フィルター入力と同じ規則)。
  const handleConditionKeyDown = (
    event: KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
  ) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      onApply();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onRequestClose();
    }
  };

  return createPortal(
    <div
      ref={popoverRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onPasteCapture={(event) => {
        // 追加: portal 内 paste も grid 側へ流しません。
        event.stopPropagation();
      }}
      className={cx('ssg-filter-popover', themeClassName)}
      style={wrapperStyle}
    >
      <div className="ssg-filter-title">列フィルター: {title}</div>

      {(isImmediateFilter || filterType === 'select') &&
      optionsStatus === 'collecting' ? (
        // 追加(DS-4 #1): 大規模列(>閾値)の候補収集中です。universe 未確定のため操作 UI は出さず、
        //   進捗のみ表示します(収集完了 = ready で本来の set / select UI へ切り替わります)。
        <div className="ssg-filter-collecting">
          候補を収集中… {Math.round(optionsProgress * 100)}%
        </div>
      ) : isComboFilter ? (
        // 追加(filter-ext B/C/D): 条件 AND 選択の複合フィルターです。条件(述語)と値(Set)を
        //   縦に並べ、AND で結合します。チェック操作は即時適用・条件も編集で即時適用です。
        //   条件を適用すると値の候補が連動して絞られます(候補外の選択状態は破棄せず保持)。
        //   レイアウトは ComboFilterLayout(共有)。条件エディタと Set 本体
        //   (フラット一覧 / 日付ツリー)だけが型ごとに異なります。
        <ComboFilterLayout
          conditionEditor={
            isNumberSetFilter ? (
              <NumberConditionEditor
                draft={numberDraft}
                valueInputRef={textInputRef}
                onDraftChange={onNumberConditionDraftChange}
                onKeyDown={handleConditionKeyDown}
              />
            ) : isTextSetFilter ? (
              <TextConditionEditor
                draft={textDraft}
                valueInputRef={textInputRef}
                onDraftChange={onTextConditionDraftChange}
                onKeyDown={handleConditionKeyDown}
              />
            ) : (
              <DateConditionEditor
                draft={dateDraft}
                valueInputRef={textInputRef}
                onDraftChange={onDateConditionDraftChange}
                onKeyDown={handleConditionKeyDown}
              />
            )
          }
          conditionActive={comboConditionActive}
          onConditionClear={onComboConditionClear}
          options={comboOptions}
          setSelection={setSelection}
          onSelectionClear={onComboSelectionClear}
          summaryText={comboSummaryText}
        >
          {isDateSetFilter ? (
            <DateSetFilterBody
              options={comboOptions}
              setSelection={setSelection}
              searchInputRef={comboSearchInputRef}
              onValueToggle={onSetValueToggle}
              onSelectAllChange={onSetSelectAllChange}
              onReplaceSelection={onSetReplaceSelection}
              onRequestClose={onRequestClose}
              isServerSide={isServerSide}
            />
          ) : (
            <SetFilterBody
              options={comboOptions}
              setSelection={setSelection}
              searchInputRef={comboSearchInputRef}
              onValueToggle={onSetValueToggle}
              onSelectAllChange={onSetSelectAllChange}
              onReplaceSelection={onSetReplaceSelection}
              onRequestClose={onRequestClose}
              isServerSide={isServerSide}
              selectAllUsesExplicitScope
            />
          )}
        </ComboFilterLayout>
      ) : isSetFilter ? (
        // 追加(12-A): AG Grid の Set Filter 相当 UI です(チェック操作は即時適用)。
        <SetFilterBody
          options={selectOptions}
          setSelection={setSelection}
          searchInputRef={textInputRef}
          onValueToggle={onSetValueToggle}
          onSelectAllChange={onSetSelectAllChange}
          onReplaceSelection={onSetReplaceSelection}
          onRequestClose={onRequestClose}
          isServerSide={isServerSide}
        />
      ) : filterType === 'number' ? (
        // 変更(filter-ext A): 旧「>=10 / 10..20」式テキスト入力を演算子セレクト + 値入力へ
        //   刷新します(保存形式 kind:'number' は不変)。演算子で値入力の個数が決まります
        //   (範囲 = 2 / 空白・空白でない = 0 / 他 = 1)。適用は従来どおりフッター / Enter です。
        // 変更(filter-ext B): エディタ本体は NumberConditionEditor へ抽出しました(numberSet と共有)。
        <>
          <div className="ssg-filter-hint">フィルター種別: number</div>
          <NumberConditionEditor
            draft={numberDraft}
            valueInputRef={textInputRef}
            onDraftChange={onNumberConditionDraftChange}
            onKeyDown={handleConditionKeyDown}
          />
        </>
      ) : filterType === 'select' ? (
        <>
          <div className="ssg-filter-hint">フィルター種別: select</div>
          <select
            ref={selectRef}
            value={draftValue}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // 追加: select 内操作を grid 側へ伝播させません。
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                onApply();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onRequestClose();
              }
            }}
            className="ssg-filter-select"
          >
            <option value="">（すべて）</option>
            {selectOptions.map((option) => (
              <option key={`${title}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="ssg-filter-meta">候補数: {selectOptions.length}</div>
        </>
      ) : (
        // 変更(filter-ext A): number が専用分岐(演算子セレクト)へ独立したため、
        //   ここは text / date / custom の部分一致テキスト入力だけになりました。
        <>
          <div className="ssg-filter-hint">フィルター種別: {filterType}</div>
          <input
            ref={textInputRef}
            type="text"
            value={draftValue}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // 追加: filter input 内入力を grid 側へ伝播させません。
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                onApply();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onRequestClose();
              }
            }}
            placeholder="部分一致で絞り込み"
            className="ssg-filter-input"
          />
          <div className="ssg-filter-meta ssg-filter-meta--ellipsis">
            部分一致検索です
          </div>
        </>
      )}

      {/* 変更(12-A): set フィルターは即時適用のため現在値テキスト行を出しません
          (選択件数カウンタを SetFilterBody 側で表示します)。
          変更(filter-ext B): numberSet も同様(複合サマリー行を上に表示済み)。 */}
      {!isImmediateFilter && (
        <div className="ssg-filter-meta ssg-filter-meta--ellipsis">
          現在値: {currentValueText}
        </div>
      )}

      <div className="ssg-filter-footer">
        {isImmediateFilter ? (
          // 変更(12-A): set フィルターは即時適用のため「適用」を持ちません。
          //             クリアは popover を閉じず全選択へ戻し、閉じるで終了します。
          <>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSetClear();
              }}
              onKeyDown={(event) => {
                // 追加: popover 内 button の key 操作を grid 側へ流しません。
                event.stopPropagation();
              }}
              className="ssg-filter-btn-secondary"
            >
              クリア
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRequestClose();
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              className="ssg-filter-btn-primary"
            >
              閉じる
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }}
              onKeyDown={(event) => {
                // 追加: popover 内 button の key 操作を grid 側へ流しません。
                event.stopPropagation();
              }}
              className="ssg-filter-btn-secondary"
            >
              クリア
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onApply();
              }}
              onKeyDown={(event) => {
                // 追加: popover 内 button の key 操作を grid 側へ流しません。
                event.stopPropagation();
              }}
              className="ssg-filter-btn-primary"
            >
              適用
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default ColumnFilterPopover;