import { createPortal } from 'react-dom';
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
  type RefObject,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// 追加: popover のレイアウト情報です。
export type ColumnFilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
};

// 追加: select / set フィルター候補の最小型です。
export type ColumnFilterPopoverOption = {
  label: string;
  value: string;
};

// 追加(反転set): set フィルターの選択状態です。null = 全選択(フィルターなし)。
//   巨大側を作らないため「選択集合」ではなく { mode, values } で持ち、values は常に
//   小さい側のみ(include=選択値 / exclude=非選択値)。判定は mode で行います。
export type ColumnFilterSetSelection = {
  mode: 'include' | 'exclude';
  values: ReadonlySet<string>;
};

// 追加(反転set): ある候補値が「選択中」かを mode 適用で判定します(巨大側を materialize しません)。
export const isSetValueSelected = (
  selection: ColumnFilterSetSelection | null,
  value: string,
): boolean =>
  selection === null
    ? true
    : selection.mode === 'include'
      ? selection.values.has(value)
      : !selection.values.has(value);

type ColumnFilterPopoverProps = {
  isOpen: boolean;
  title: string;
  // 変更(12-A): 'set' を追加します。
  filterType: 'text' | 'number' | 'date' | 'select' | 'set' | 'custom';
  draftValue: string;
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
};

// ── 共通スタイル ────────────────────────────────────────
const SECONDARY_BUTTON_STYLE: CSSProperties = {
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#475569',
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  border: '1px solid #2563eb',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const TEXT_INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  outline: 'none',
  marginBottom: 8,
};

// 追加(12-A): set フィルター候補リストの行高です(仮想化の estimateSize と一致させます)。
const SET_FILTER_OPTION_ROW_HEIGHT = 28;
// 追加(12-A): 候補リストの表示領域高です。
const SET_FILTER_LIST_HEIGHT = 208;

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
  onRequestClose: () => void;
};

function SetFilterBody({
  options,
  setSelection,
  searchInputRef,
  onValueToggle,
  onSelectAllChange,
  onRequestClose,
}: SetFilterBodyProps) {
  const [searchText, setSearchText] = useState('');
  // 追加(12-A): 候補 5,000 件規模での連続タイピングに備え、絞り込み計算は
  //             低優先度レンダーへ遅延します(11-B7 のグローバルフィルタと同型)。
  const deferredSearchText = useDeferredValue(searchText);

  const visibleOptions = useMemo(() => {
    const normalized = deferredSearchText.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalized),
    );
  }, [options, deferredSearchText]);

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

  // 変更(反転set): mode から O(1) 算出します(巨大側を materialize しません)。
  const totalSelectedCount =
    setSelection === null
      ? options.length
      : setSelection.mode === 'include'
        ? setSelection.values.size
        : options.length - setSelection.values.size;

  const handleSelectAllToggle = () => {
    // 変更(反転set): 非検索時は scope='all' を渡し、30 万件の values 配列を作りません。
    //   検索中のみ表示中候補(=小さい側)の values を渡します。
    onSelectAllChange(
      isSearching ? visibleOptions.map((option) => option.value) : 'all',
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
        }}
        placeholder="検索..."
        style={TEXT_INPUT_STYLE}
      />

      {/* (Select All) 行: 検索中は表示中候補のみが対象です(AG Grid と同挙動) */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: SET_FILTER_OPTION_ROW_HEIGHT,
          padding: '0 8px',
          cursor: 'pointer',
          fontSize: 12,
          color: '#334155',
          borderBottom: '1px solid #e2e8f0',
          userSelect: 'none',
        }}
      >
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
        <span style={{ fontWeight: 600 }}>
          {isSearching ? '（検索結果をすべて選択）' : '（すべて選択）'}
        </span>
      </label>

      {/* 候補リスト(仮想化) */}
      <div
        ref={listScrollRef}
        style={{
          height: SET_FILTER_LIST_HEIGHT,
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          marginBottom: 8,
        }}
      >
        {visibleOptions.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: '#94a3b8',
              textAlign: 'center',
            }}
          >
            一致する候補がありません
          </div>
        ) : (
          <div
            style={{
              height: optionVirtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    height: virtualItem.size,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 8px',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#334155',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onValueToggle(option.value)}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 11,
          color: '#64748b',
          marginBottom: 10,
        }}
      >
        選択中: {totalSelectedCount} / {options.length} 件
        {isSearching ? `（表示中 ${visibleOptions.length} 件）` : ''}
      </div>
    </>
  );
}

// 追加: 列フィルター popover の view component です。
export function ColumnFilterPopover({
  isOpen,
  title,
  filterType,
  draftValue,
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
}: ColumnFilterPopoverProps) {
  if (typeof document === 'undefined' || !isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    width: layout.width,
    padding: 12,
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
    zIndex: 1000,
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard イベントを React ツリー上の parent へ流しません。
    event.stopPropagation();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: popover 内 pointer 操作を外側へ伝播させません。
    event.stopPropagation();
  };

  const isSetFilter = filterType === 'set';

  return createPortal(
    <div
      ref={popoverRef}
      onPointerDown={handlePointerDown}
      onKeyDownCapture={handleKeyDownCapture}
      onPasteCapture={(event) => {
        // 追加: portal 内 paste も grid 側へ流しません。
        event.stopPropagation();
      }}
      style={wrapperStyle}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#334155',
          marginBottom: 8,
        }}
      >
        列フィルター: {title}
      </div>

      {(isSetFilter || filterType === 'select') &&
      optionsStatus === 'collecting' ? (
        // 追加(DS-4 #1): 大規模列(>閾値)の候補収集中です。universe 未確定のため操作 UI は出さず、
        //   進捗のみ表示します(収集完了 = ready で本来の set / select UI へ切り替わります)。
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            fontSize: 12,
            color: '#64748b',
          }}
        >
          候補を収集中… {Math.round(optionsProgress * 100)}%
        </div>
      ) : isSetFilter ? (
        // 追加(12-A): AG Grid の Set Filter 相当 UI です(チェック操作は即時適用)。
        <SetFilterBody
          options={selectOptions}
          setSelection={setSelection}
          searchInputRef={textInputRef}
          onValueToggle={onSetValueToggle}
          onSelectAllChange={onSetSelectAllChange}
          onRequestClose={onRequestClose}
        />
      ) : filterType === 'select' ? (
        <>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 8,
            }}
          >
            フィルター種別: select
          </div>
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
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
              marginBottom: 8,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">（すべて）</option>
            {selectOptions.map((option) => (
              <option key={`${title}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 10,
            }}
          >
            候補数: {selectOptions.length}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 8,
            }}
          >
            フィルター種別: {filterType === 'number' ? 'number' : 'text'}
          </div>
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
            placeholder={
              filterType === 'number'
                ? '例: >=10 / <20 / 10..20 / =5'
                : '部分一致で絞り込み'
            }
            style={TEXT_INPUT_STYLE}
          />
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 10,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {filterType === 'number'
              ? '数量系は =, >, >=, <, <=, .. が使えます'
              : 'text は部分一致検索です'}
          </div>
        </>
      )}

      {/* 変更(12-A): set フィルターは即時適用のため現在値テキスト行を出しません
          (選択件数カウンタを SetFilterBody 側で表示します)。 */}
      {!isSetFilter && (
        <div
          style={{
            fontSize: 11,
            color: '#64748b',
            marginBottom: 10,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          現在値: {currentValueText}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        {isSetFilter ? (
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
              style={SECONDARY_BUTTON_STYLE}
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
              style={PRIMARY_BUTTON_STYLE}
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
              style={SECONDARY_BUTTON_STYLE}
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
              style={PRIMARY_BUTTON_STYLE}
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