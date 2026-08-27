// 追加(date-picker B): dateSet フィルター条件の内製日付フィールドです。
//   ネイティブ <input type="date">(ブラウザ依存で見た目・使い勝手が悪い)を置き換える
//   「自由入力テキスト + カレンダーボタン + ドリルアップカレンダー(日 → 月 → 年)」の
//   複合フィールドです(密度プレビューで合意したオプション B)。
//   - テキストは '2026/7/1' 等の表記ゆれを受け付け、Enter / blur で 'YYYY-MM-DD' へ正規化して
//     onCommit します(解釈できない入力は赤枠表示のまま確定しません)。
//   - カレンダーはフィールド直下に絶対配置で開きます(filter popover の DOM 内のため
//     外側クリック判定に影響しません)。日クリック / 今日 / クリア で確定して閉じます。
//   - renderFilterDateInput(利用側スロット)指定時は本フィールドは使われません。
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { cx } from '../logic/cx';
import { toDateKey } from '../logic/filtering';
import {
  CALENDAR_DOW_LABELS,
  CALENDAR_MONTH_LABELS,
  buildCalendarDayCells,
  buildYearGrid,
  formatCalendarTitle,
  formatFilterDateDisplay,
  yearGridStart,
} from '../logic/datePickerCalendar';

// ドリルアップの表示段です(日 → 月 → 年)。
type CalendarView = 'days' | 'months' | 'years';

type FilterDateFieldProps = {
  // 'YYYY-MM-DD' か ''(未入力)です。
  value: string;
  // 正規化済みの確定通知です('' = クリア。dateSet は即時適用のため親がそのまま dispatch します)。
  onCommit: (value: string) => void;
  ariaLabel: string;
  // autofocus 対象(controller の textInputRef)。範囲の先頭フィールドのみ割り当てます。
  inputRef?: RefObject<HTMLInputElement | null>;
  // カレンダーが閉じている状態での Escape です(popover ごと閉じる従来挙動へ配線)。
  onRequestClose: () => void;
  // カレンダーパネルの寄せです(範囲の右側フィールドは右寄せで popover 内に収めます)。
  align?: 'left' | 'right';
};

export function FilterDateField({
  value,
  onCommit,
  ariaLabel,
  inputRef,
  onRequestClose,
  align = 'left',
}: FilterDateFieldProps) {
  // 編集中テキストです。null = 未編集(表示は value 由来)。編集開始で raw を保持し、
  //   確定(commit)で null へ戻します(props 同期の effect を持たないための導出パターン)。
  const [editingText, setEditingText] = useState<string | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<CalendarView>('days');
  // カレンダーの表示年月です(パネルを開くたびに value / 今日から初期化します)。
  const [visibleYear, setVisibleYear] = useState(() => new Date().getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date().getMonth());

  const rootRef = useRef<HTMLDivElement | null>(null);

  const displayText = editingText ?? formatFilterDateDisplay(value);
  const todayKey = toDateKey(new Date()) ?? '';

  // ── テキスト確定(Enter / blur) ──────────────────────
  const commitText = () => {
    if (editingText === null) {
      return;
    }
    const raw = editingText.trim();
    if (raw === '') {
      onCommit('');
      setEditingText(null);
      setIsInvalid(false);
      return;
    }
    const key = toDateKey(raw);
    if (key === null) {
      // 解釈できない入力は確定しません(赤枠のまま編集継続)。
      setIsInvalid(true);
      return;
    }
    onCommit(key);
    setEditingText(null);
    setIsInvalid(false);
  };

  // ── カレンダー開閉 ──────────────────────────────────
  const openPanel = () => {
    const seed = value !== '' ? value : todayKey;
    const [yearText, monthText] = seed.split('-');
    setVisibleYear(Number(yearText));
    setVisibleMonth(Number(monthText) - 1);
    setView('days');
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
  };

  const commitAndClose = (nextValue: string) => {
    onCommit(nextValue);
    setEditingText(null);
    setIsInvalid(false);
    closePanel();
  };

  // パネル表示中は、フィールド外の pointerdown(popover 内の別要素含む)で閉じます。
  //   popover root が bubble を遮断するため、capture 相の document リスナで拾います。
  useEffect(() => {
    if (!panelOpen) {
      return;
    }
    const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) {
        return;
      }
      setPanelOpen(false);
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleDocumentPointerDown,
        true,
      );
    };
  }, [panelOpen]);

  // ── キーボード(input) ──────────────────────────────
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // grid 側へは流しません(他の popover 内入力と同じ規則)。
    event.stopPropagation();
    if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();
      commitText();
      closePanel();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (panelOpen) {
        closePanel();
        return;
      }
      onRequestClose();
    }
  };

  // ── パネル内ボタン共通(pointerdown で発火・フォーカスを奪わない) ──
  const pressHandler =
    (action: () => void) => (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    };

  // ── ナビゲーション ──────────────────────────────────
  const stepVisible = (direction: 1 | -1) => {
    if (view === 'days') {
      const next = new Date(visibleYear, visibleMonth + direction, 1);
      setVisibleYear(next.getFullYear());
      setVisibleMonth(next.getMonth());
      return;
    }
    if (view === 'months') {
      setVisibleYear((current) => current + direction);
      return;
    }
    setVisibleYear((current) => current + direction * 12);
  };

  const drillUp = () => {
    setView((current) => (current === 'days' ? 'months' : 'years'));
  };

  // 追加(0.28.1): 月・年ビューから 1 段下へ戻ります(年 → 月 → 日)。年を押した後に
  //   「月を選ばないと日ビューへ戻れない」ことに気付きにくいため、明示の戻る動線を
  //   フッターへ出します(選択せずに戻れる)。
  const drillDown = () => {
    setView((current) => (current === 'years' ? 'months' : 'days'));
  };

  const navTitle =
    view === 'days'
      ? formatCalendarTitle(visibleYear, visibleMonth)
      : view === 'months'
        ? `${visibleYear}年`
        : `${yearGridStart(visibleYear)} – ${yearGridStart(visibleYear) + 11}`;

  return (
    <div ref={rootRef} className="ssg-dp-root">
      <div
        className={cx(
          'ssg-dp-field',
          panelOpen && 'ssg-dp-field--open',
          isInvalid && 'ssg-dp-field--invalid',
        )}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayText}
          placeholder="yyyy/mm/dd"
          aria-label={ariaLabel}
          aria-invalid={isInvalid || undefined}
          className="ssg-dp-input"
          onChange={(event) => {
            setEditingText(event.target.value);
            setIsInvalid(false);
          }}
          onKeyDown={handleInputKeyDown}
          onBlur={commitText}
        />
        <button
          type="button"
          className="ssg-dp-cal-btn"
          aria-label={panelOpen ? 'カレンダーを閉じる' : 'カレンダーを開く'}
          onPointerDown={pressHandler(() => {
            if (panelOpen) {
              closePanel();
            } else {
              openPanel();
            }
          })}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="12"
              rx="1.5"
              fill="none"
              stroke="currentColor"
            />
            <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" />
            <line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" />
            <line x1="11" y1="1" x2="11" y2="4" stroke="currentColor" />
          </svg>
        </button>
      </div>

      {panelOpen && (
        <div
          className={cx(
            'ssg-dp-panel',
            align === 'right' && 'ssg-dp-panel--right',
          )}
        >
          <div className="ssg-dp-nav">
            <button
              type="button"
              className="ssg-dp-nav-btn"
              aria-label="前へ"
              onPointerDown={pressHandler(() => stepVisible(-1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="ssg-dp-nav-title"
              // 年ビューが最上段のため、これ以上のドリルアップはありません。
              disabled={view === 'years'}
              aria-label="表示単位を切り替える"
              onPointerDown={pressHandler(drillUp)}
            >
              {navTitle}
            </button>
            <button
              type="button"
              className="ssg-dp-nav-btn"
              aria-label="次へ"
              onPointerDown={pressHandler(() => stepVisible(1))}
            >
              ›
            </button>
          </div>

          {view === 'days' && (
            <>
              <div className="ssg-dp-dow">
                {CALENDAR_DOW_LABELS.map((label, index) => (
                  <span
                    key={label}
                    className={cx(
                      index === 0 && 'ssg-dp-dow--sun',
                      index === 6 && 'ssg-dp-dow--sat',
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="ssg-dp-days">
                {buildCalendarDayCells(visibleYear, visibleMonth).map(
                  (cell) => (
                    <button
                      key={cell.key}
                      type="button"
                      className={cx(
                        'ssg-dp-day',
                        !cell.inCurrentMonth && 'ssg-dp-day--out',
                        cell.key === todayKey && 'ssg-dp-day--today',
                        cell.key === value && 'ssg-dp-day--selected',
                      )}
                      aria-label={cell.key}
                      onPointerDown={pressHandler(() => commitAndClose(cell.key))}
                    >
                      {cell.day}
                    </button>
                  ),
                )}
              </div>
            </>
          )}

          {view === 'months' && (
            <div className="ssg-dp-grid">
              {CALENDAR_MONTH_LABELS.map((label, monthIndex) => (
                <button
                  key={label}
                  type="button"
                  className={cx(
                    'ssg-dp-cell',
                    monthIndex === visibleMonth && 'ssg-dp-cell--selected',
                  )}
                  onPointerDown={pressHandler(() => {
                    setVisibleMonth(monthIndex);
                    setView('days');
                  })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === 'years' && (
            <div className="ssg-dp-grid">
              {buildYearGrid(visibleYear).map((year) => (
                <button
                  key={year}
                  type="button"
                  className={cx(
                    'ssg-dp-cell',
                    year === visibleYear && 'ssg-dp-cell--selected',
                  )}
                  onPointerDown={pressHandler(() => {
                    setVisibleYear(year);
                    setView('months');
                  })}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          <div className="ssg-dp-foot">
            {/* 追加(0.28.1): 月・年ビューの明示的な戻る動線です(選択せずに 1 段戻る)。 */}
            {view !== 'days' && (
              <button
                type="button"
                className="ssg-dp-foot-btn"
                onPointerDown={pressHandler(drillDown)}
              >
                ← 戻る
              </button>
            )}
            <button
              type="button"
              className="ssg-dp-foot-btn"
              onPointerDown={pressHandler(() => commitAndClose(todayKey))}
            >
              今日
            </button>
            <button
              type="button"
              className="ssg-dp-foot-btn ssg-dp-foot-btn--muted"
              onPointerDown={pressHandler(() => commitAndClose(''))}
            >
              クリア
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterDateField;
