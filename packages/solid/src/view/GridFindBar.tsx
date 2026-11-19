// セル内検索のバー(find prop。機能 features/find の部品)。React 版の view/GridFindBar.tsx と同じ DOM と class。
//   グリッドの右上(見出しの直下)に浮きます。入力 → findController.setQuery、Enter / ↓ で次、Shift+Enter / ↑ で前、
//   Esc / × で閉じる(閉じたらグリッドの本体へフォーカスを戻すのは呼ぶ側)。件数は aria-live で読み上げます。
//   - 入力欄の値は検索の文字(命令的 API の openFind(query) でも変わる)。今の値と違うときだけ書きます(式で渡すと、同じ要素の
//     別の属性が変わるたびに Solid が value を書き直し、変換中の文字が消える)。
//   - 開いたときに入力欄へフォーカス(描き終わった後に 1 回。autofocus は後から足した要素には効かない)。
import { createRenderEffect, createSignal, onSettled, untrack } from 'solid-js';
import type { FindSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/findController';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import type { DEFAULT_FIND_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useFeatureLocaleText } from '../context/localeText';
import { px } from '../primitives/style';

type GridFindBarProps = {
  snapshot: FindSnapshot;
  headerHeight: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  slot?: GridResolvedSlot | undefined;
};

export function GridFindBar(props: GridFindBarProps) {
  const texts = useFeatureLocaleText<typeof DEFAULT_FIND_LOCALE_TEXT>();
  const [input, setInput] = createSignal<HTMLInputElement>();
  const initialQuery = untrack(() => props.snapshot.query);
  onSettled(() => {
    const element = untrack(input);
    element?.focus();
    element?.select();
  });
  createRenderEffect(
    () => [input(), props.snapshot.query] as const,
    ([element, query]) => {
      if (element && element.value !== query) {
        element.value = query;
      }
    },
  );

  const count = () => props.snapshot.matches.length;
  const countLabel = () => {
    const snapshot = props.snapshot;
    const localeTexts = texts();
    if (snapshot.query.length === 0) {
      return '';
    }
    if (snapshot.scanning) {
      return localeTexts.findSearching;
    }
    if (count() === 0) {
      return localeTexts.findNoResults;
    }
    return `${(snapshot.currentIndex ?? 0) + 1} / ${count()}${snapshot.truncated ? '+' : ''}`;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isImeComposingKeyEvent(event)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        props.onPrev();
      } else {
        props.onNext();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      props.onNext();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      props.onPrev();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    }
    // グリッドの本体のショートカット(矢印でのセルの移動など)へ伝えない。
    event.stopPropagation();
  };

  return (
    <div
      class={['ssg-find-bar', props.slot?.className]}
      style={{ ...props.slot?.style, top: px(props.headerHeight + 6) }}
      role="search"
      aria-label={texts().findLabel}
      // バーの中のポインタの操作をグリッドの本体(選択の始まり / 外側のクリックの判定)へ伝えない。
      onPointerDown={(event) => event.stopPropagation()}
      data-ssg-find-bar=""
    >
      <span class="ssg-find-bar-icon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="20" y1="20" x2="16.5" y2="16.5" />
        </svg>
      </span>
      <input
        ref={setInput}
        class="ssg-find-bar-input"
        type="text"
        value={initialQuery}
        placeholder={texts().findPlaceholder}
        aria-label={texts().findInput}
        onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <span
        class={[
          'ssg-find-bar-count',
          { 'ssg-find-bar-count--none': props.snapshot.query.length > 0 && !props.snapshot.scanning && count() === 0 },
        ]}
        aria-live="polite"
      >
        {countLabel()}
      </span>
      <button
        type="button"
        class="ssg-find-bar-btn"
        onClick={() => props.onPrev()}
        disabled={count() === 0}
        aria-label={texts().findPrevious}
        data-ssg-tooltip={texts().findPreviousHint}
      >
        ↑
      </button>
      <button
        type="button"
        class="ssg-find-bar-btn"
        onClick={() => props.onNext()}
        disabled={count() === 0}
        aria-label={texts().findNext}
        data-ssg-tooltip={texts().findNextHint}
      >
        ↓
      </button>
      <button
        type="button"
        class="ssg-find-bar-btn"
        onClick={() => props.onClose()}
        aria-label={texts().findClose}
        data-ssg-tooltip={texts().findCloseHint}
      >
        ×
      </button>
    </div>
  );
}