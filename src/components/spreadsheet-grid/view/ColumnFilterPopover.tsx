import { createPortal } from 'react-dom';
import { cx } from '../logic/cx';
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

type ColumnFilterPopoverProps = {
  isOpen: boolean;
  // 追加(TH-DK-2): ダークテーマ修飾子クラス('ssg-theme-dark' | undefined)。ポータルは
  //   .ssg-root 外のため、root と同じ修飾子を自身の root 要素へ直接付与します。
  themeClassName?: string;
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

// 追加: 列フィルター popover の view component です。
export function ColumnFilterPopover({
  isOpen,
  themeClassName,
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
  onSetReplaceSelection,
  isServerSide = false,
}: ColumnFilterPopoverProps) {
  if (typeof document === 'undefined' || !isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    top: layout.top,
    left: layout.left,
    width: layout.width,
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

      {(isSetFilter || filterType === 'select') &&
      optionsStatus === 'collecting' ? (
        // 追加(DS-4 #1): 大規模列(>閾値)の候補収集中です。universe 未確定のため操作 UI は出さず、
        //   進捗のみ表示します(収集完了 = ready で本来の set / select UI へ切り替わります)。
        <div className="ssg-filter-collecting">
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
          onReplaceSelection={onSetReplaceSelection}
          onRequestClose={onRequestClose}
          isServerSide={isServerSide}
        />
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
        <>
          <div className="ssg-filter-hint">
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
            className="ssg-filter-input"
          />
          <div className="ssg-filter-meta ssg-filter-meta--ellipsis">
            {filterType === 'number'
              ? '数量系は =, >, >=, <, <=, .. が使えます'
              : 'text は部分一致検索です'}
          </div>
        </>
      )}

      {/* 変更(12-A): set フィルターは即時適用のため現在値テキスト行を出しません
          (選択件数カウンタを SetFilterBody 側で表示します)。 */}
      {!isSetFilter && (
        <div className="ssg-filter-meta ssg-filter-meta--ellipsis">
          現在値: {currentValueText}
        </div>
      )}

      <div className="ssg-filter-footer">
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