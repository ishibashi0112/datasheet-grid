// dateSet の列フィルターの条件の日付の入力欄(自由入力 + カレンダーのボタン + 日 → 月 → 年のカレンダー)。React 版の
//   view/FilterDateField.tsx と同じ DOM と class。
//   - 文字は '2026/7/1' などの書き方を受け、Enter / フォーカスが外れたときに 'YYYY-MM-DD' へそろえて知らせます(読めない入力は
//     赤い枠のまま確定しない)。
//   - カレンダーは入力欄の下に開き(ポップオーバーの中)、日 / 今日 / クリアで確定して閉じます。開いている間は、入力欄の外の
//     押下で閉じます(ポップオーバーが押下の伝播を止めるので、document の capture 相で見る)。
//   - renderFilterDateInput(利用側の部品)を渡したときは使いません。
import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { toDateKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import { parseFilterDateText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorValues';
import {
  buildCalendarDayCells,
  buildYearGrid,
  formatFilterDateDisplay,
  yearGridStart,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/datePickerCalendar';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { usePopupLocaleText } from '../context/localeText';
import { createInputValue } from '../primitives/inputValue';
import { getEventTarget } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/shadowDom';

// カレンダーの段(日 → 月 → 年)。
type CalendarView = 'days' | 'months' | 'years';

type FilterDateFieldProps = {
  // 'YYYY-MM-DD' か ''(未入力)。
  value: string;
  // そろえた値の確定('' = クリア)。
  onCommit: (value: string) => void;
  ariaLabel: string;
  // 開いた後のフォーカスの先(コントローラの textInputRef。範囲の先頭の欄だけ)。
  inputRef?: { current: HTMLInputElement | null } | undefined;
  // カレンダーを閉じているときの Escape(ポップオーバーを閉じる)。
  onRequestClose: () => void;
  // カレンダーの寄せ(範囲の右側の欄は右に寄せてポップオーバーの中に収める)。
  align?: 'left' | 'right' | undefined;
};

export function FilterDateField(props: FilterDateFieldProps) {
  const texts = usePopupLocaleText();
  // 編集中の文字。null = 編集していない(表示は value から)。
  const [editingText, setEditingText] = createSignal<string | null>(null);
  const [isInvalid, setIsInvalid] = createSignal(false);
  const [panelOpen, setPanelOpen] = createSignal(false);
  const [view, setView] = createSignal<CalendarView>('days');
  // カレンダーの表示の年月(開くたびに value / 今日から決める)。
  const [visibleYear, setVisibleYear] = createSignal(new Date().getFullYear());
  const [visibleMonth, setVisibleMonth] = createSignal(new Date().getMonth());
  let rootElement: HTMLDivElement | undefined;
  // 消えた後(ポップオーバーを閉じた)のフォーカスの外れでは確定しません(React 版は消えた部品のイベントを呼ばない)。
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    if (props.inputRef && props.inputRef.current === inputElement) {
      props.inputRef.current = null;
    }
  });
  let inputElement: HTMLInputElement | undefined;

  const displayText = createMemo(() => editingText() ?? formatFilterDateDisplay(props.value));
  const todayKey = () => toDateKey(new Date()) ?? '';
  const bindValue = createInputValue<HTMLInputElement>(displayText);

  // ── 文字の確定(Enter / フォーカスが外れた) ──
  const commitText = () => {
    const text = untrack(editingText);
    if (text === null) {
      return;
    }
    const raw = text.trim();
    if (raw === '') {
      props.onCommit('');
      setEditingText(null);
      setIsInvalid(false);
      return;
    }
    // 変更(1.3.0 / S8-02): セルの date エディタと同じ読み方(全角・年月日・ドット)。
    const key = parseFilterDateText(raw);
    if (key === null) {
      // 読めない入力は確定しません(赤い枠のまま編集を続ける)。
      setIsInvalid(true);
      return;
    }
    props.onCommit(key);
    setEditingText(null);
    setIsInvalid(false);
  };

  // ── カレンダーの開閉 ──
  const openPanel = () => {
    const seed = props.value !== '' ? props.value : todayKey();
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
    props.onCommit(nextValue);
    setEditingText(null);
    setIsInvalid(false);
    closePanel();
  };

  // カレンダーを開いている間は、この欄の外の押下(ポップオーバーの中の別の要素を含む)で閉じます。
  createEffect(panelOpen, (open) => {
    if (!open) {
      return undefined;
    }
    const handleDocumentPointerDown = (event: PointerEvent) => {
      // 変更(1.3.0 / S11-05): Shadow root の中で押したときの target は host なので、押した要素は composedPath の先頭で見ます。
      const target = getEventTarget(event) as Node | null;
      if (target && rootElement?.contains(target)) {
        return;
      }
      setPanelOpen(false);
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, { name: 'dateFieldOutsidePress' });

  // ── 入力欄のキー ──
  const handleInputKeyDown = (event: KeyboardEvent) => {
    // グリッドへは流しません(ほかのポップオーバーの中の入力欄と同じ)。
    event.stopPropagation();
    if (event.key === 'Enter') {
      if (isImeComposingKeyEvent(event)) {
        return;
      }
      event.preventDefault();
      commitText();
      closePanel();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (untrack(panelOpen)) {
        closePanel();
        return;
      }
      props.onRequestClose();
    }
  };

  // ── カレンダーの中のボタン(pointerdown で押す = フォーカスを奪わない。Enter / Space でも押せる) ──
  const press = (action: () => void) => ({
    onPointerDown: (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    },
    onKeyDown: (event: KeyboardEvent & { currentTarget: HTMLElement }) => {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
        return;
      }
      // ボタンにフォーカスがあるときの Escape: カレンダーが開いていればカレンダーだけ閉じて入力欄へフォーカスを戻し、閉じて
      //   いればポップオーバーを閉じます(入力欄と同じ)。
      if (event.key === 'Escape') {
        event.preventDefault();
        if (untrack(panelOpen)) {
          closePanel();
          event.currentTarget.closest('.ssg-dp-root')?.querySelector<HTMLInputElement>('.ssg-dp-input')?.focus();
          return;
        }
        props.onRequestClose();
      }
    },
  });

  // ── 前後へ / 上の段へ / 下の段へ ──
  const stepVisible = (direction: 1 | -1) => {
    const current = untrack(view);
    if (current === 'days') {
      const next = new Date(untrack(visibleYear), untrack(visibleMonth) + direction, 1);
      setVisibleYear(next.getFullYear());
      setVisibleMonth(next.getMonth());
      return;
    }
    if (current === 'months') {
      setVisibleYear((year) => year + direction);
      return;
    }
    setVisibleYear((year) => year + direction * 12);
  };
  const drillUp = () => {
    setView((current) => (current === 'days' ? 'months' : 'years'));
  };
  // 月・年の段から 1 段下へ(選ばずに戻る)。
  const drillDown = () => {
    setView((current) => (current === 'years' ? 'months' : 'days'));
  };

  const navTitle = () => {
    const current = view();
    if (current === 'days') {
      return formatLocaleText(texts().calendarTitle, { year: visibleYear(), month: visibleMonth() + 1 });
    }
    if (current === 'months') {
      return formatLocaleText(texts().calendarYear, { year: visibleYear() });
    }
    return `${yearGridStart(visibleYear())} – ${yearGridStart(visibleYear()) + 11}`;
  };

  return (
    <div ref={(node) => (rootElement = node)} class="ssg-dp-root">
      <div class={['ssg-dp-field', { 'ssg-dp-field--open': panelOpen(), 'ssg-dp-field--invalid': isInvalid() }]}>
        <input
          ref={(node) => {
            inputElement = node;
            if (props.inputRef) {
              props.inputRef.current = node;
            }
            bindValue(node);
          }}
          type="text"
          inputmode="numeric"
          placeholder="yyyy/mm/dd"
          aria-label={props.ariaLabel}
          aria-invalid={isInvalid() ? 'true' : undefined}
          class="ssg-dp-input"
          onInput={(event) => {
            setEditingText(event.currentTarget.value);
            setIsInvalid(false);
          }}
          onKeyDown={handleInputKeyDown}
          onBlur={() => {
            if (!disposed) {
              commitText();
            }
          }}
        />
        <button
          type="button"
          class="ssg-dp-cal-btn"
          aria-label={panelOpen() ? texts().calendarClose : texts().calendarOpen}
          {...press(() => {
            if (untrack(panelOpen)) {
              closePanel();
            } else {
              openPanel();
            }
          })}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" />
            <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" />
            <line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" />
            <line x1="11" y1="1" x2="11" y2="4" stroke="currentColor" />
          </svg>
        </button>
      </div>

      <Show when={panelOpen()}>
        <div class={['ssg-dp-panel', { 'ssg-dp-panel--right': props.align === 'right' }]}>
          <div class="ssg-dp-nav">
            <button type="button" class="ssg-dp-nav-btn" aria-label={texts().calendarPrevious} {...press(() => stepVisible(-1))}>
              ‹
            </button>
            <button
              type="button"
              class="ssg-dp-nav-title"
              // 年の段が一番上なので、それより上へは行けません。
              disabled={view() === 'years'}
              aria-label={texts().calendarChangeView}
              {...press(drillUp)}
            >
              {navTitle()}
            </button>
            <button type="button" class="ssg-dp-nav-btn" aria-label={texts().calendarNext} {...press(() => stepVisible(1))}>
              ›
            </button>
          </div>

          <Show when={view() === 'days'}>
            <div class="ssg-dp-dow">
              <For each={texts().calendarWeekdays}>
                {(label, index) => (
                  <span class={{ 'ssg-dp-dow--sun': index() === 0, 'ssg-dp-dow--sat': index() === 6 }}>{label}</span>
                )}
              </For>
            </div>
            <div class="ssg-dp-days">
              <For each={buildCalendarDayCells(visibleYear(), visibleMonth())}>
                {(cell) => (
                  <button
                    type="button"
                    class={[
                      'ssg-dp-day',
                      {
                        'ssg-dp-day--out': !cell.inCurrentMonth,
                        'ssg-dp-day--today': cell.key === todayKey(),
                        'ssg-dp-day--selected': cell.key === props.value,
                      },
                    ]}
                    aria-label={cell.key}
                    {...press(() => commitAndClose(cell.key))}
                  >
                    {cell.day}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={view() === 'months'}>
            <div class="ssg-dp-grid">
              <For each={texts().calendarMonths}>
                {(label, monthIndex) => (
                  <button
                    type="button"
                    class={['ssg-dp-cell', { 'ssg-dp-cell--selected': monthIndex() === visibleMonth() }]}
                    {...press(() => {
                      setVisibleMonth(untrack(monthIndex));
                      setView('days');
                    })}
                  >
                    {label}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={view() === 'years'}>
            <div class="ssg-dp-grid">
              <For each={buildYearGrid(visibleYear())}>
                {(year) => (
                  <button
                    type="button"
                    class={['ssg-dp-cell', { 'ssg-dp-cell--selected': year === visibleYear() }]}
                    {...press(() => {
                      setVisibleYear(year);
                      setView('months');
                    })}
                  >
                    {year}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <div class="ssg-dp-foot">
            {/* 月・年の段から 1 段戻る(選ばずに)。 */}
            <Show when={view() !== 'days'}>
              <button type="button" class="ssg-dp-foot-btn" {...press(drillDown)}>
                {texts().calendarBack}
              </button>
            </Show>
            <button type="button" class="ssg-dp-foot-btn" {...press(() => commitAndClose(todayKey()))}>
              {texts().calendarToday}
            </button>
            <button type="button" class="ssg-dp-foot-btn ssg-dp-foot-btn--muted" {...press(() => commitAndClose(''))}>
              {texts().clear}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}