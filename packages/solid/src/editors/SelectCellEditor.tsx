// select エディタ(候補の一覧から選ぶ)。React 版の editors/SelectCellEditor.tsx と同じ DOM と class。
//   セルの中は文字の入力欄(フォーカスの置き場 + ハイライト中の名前。スマホのソフトキーボードは inputmode="none" で出さない)、
//   候補の一覧はグリッドの外(既定はグリッドを囲むダイアログの中、無ければ body)へ fixed で置きます(テーマの修飾子とトークンを
//   写す。z-index 1000)。選ぶとすぐ確定する(下書きは無い)ので、フォーカスが外れたときと Escape は取り消しです。
//   - キーの割り当て(上下 / Home / End / PageUp / PageDown / Enter / Tab / Escape / タイプアヘッド)は core logic/selectEditorState
//     の handleSelectEditorKeyDown(React 版は同じ割り当てを展開して持つ)。
//   - IME で確定した文字(日本語の名前など)でも候補を探します(変換が始まるときに表示中の名前を選んで変換の文字に置き換えさせ、
//     確定したらその文字で始まる、無ければ含む候補へ)。変換中でない文字の変更(Backspace など)は受けず、名前のまま。
//   - ハイライトが変わるたびに名前の先頭を見せます(細い列で入力欄が末尾までスクロールしていた)。
//   - Solid 2.0 は signal への書き込みが次のマイクロタスクまで読めないので、イベントの中で続けて読むハイライトと変換中の文字は
//     手元の変数にも持ちます(同じタスクの中で続けて届いたキーが古い値から動かないように)。
//   - 入力欄の value は JSX の式では結ばず、今の値と違うときだけ書きます(React 版の制御された入力欄と同じ。式で結ぶと同じ要素の
//     描き直しのたびに同じ値でも書き直し、IME の変換中にも書いてしまう)。
//   - エディタが外れるときのブラウザの blur では取り消しません(text エディタと同じ。列を固定してペインが変わったときは、新しい
//     ペインで開き直す = React 版と同じ)。
import {
  For,
  Show,
  createEffect,
  createRenderEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onSettled,
  untrack,
} from 'solid-js';
import { Portal } from '@solidjs/web';
import type { EditorCommitDirection, EditorEnterMove, GridSelectEditorOption } from '@ishibashi0112/spreadsheet-grid-core';
import {
  computeSelectPopoverPlacement,
  createTypeaheadState,
  findOptionByComposedText,
  handleSelectEditorKeyDown,
  resolveSelectEditorStart,
  resolveSelectOptionRowHeight,
  typeaheadJump,
  type SelectPopoverPlacement,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectEditorState';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import { useGridPortal } from '../context/portal';
import { createPortalTokens } from '../primitives/portalTokens';
import { createTopAlignedInput } from '../primitives/topAlignedInput';
import { px } from '../primitives/style';
import { CellEditorError } from './CellEditorErrorBubble';
import type { EditorCommit } from './TextCellEditor';
import { toEditorKeyEvent } from '../primitives/eventKey';

type SelectCellEditorProps = {
  ariaLabel?: string | undefined;
  options: GridSelectEditorOption[];
  // 編集を始めたときのセルの値(開いたときのハイライトと、候補に無い値の表示に使う)。
  value: unknown;
  onCommit: EditorCommit;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right' | undefined;
  // 候補の一覧へ付けるテーマ / モーションの修飾子。
  themeClassName?: string | undefined;
  // classNames.popover(候補の一覧)。
  popoverSlot?: GridResolvedSlot | undefined;
  enterMove?: EditorEnterMove | undefined;
  // 印字キー / IME 確定で編集を始めたときの文字列。開いた時点でタイプアヘッドに 1 回使います。
  initialText?: string | undefined;
  cellHeight?: number | undefined;
  alignTop?: boolean | undefined;
  // 編集しているセルの置き場所(ペインの中の座標)。開いたまま並びが変わって動いたら候補の一覧を測り直す(1.3.0 / S8-05)。
  cellTop?: number | undefined;
  cellLeft?: number | undefined;
};

export function SelectCellEditor(props: SelectCellEditorProps) {
  const texts = useGridLocaleText();
  const portal = useGridPortal();
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [list, setList] = createSignal<HTMLDivElement>();
  createTopAlignedInput(input, () => props.alignTop ?? false, () => props.cellHeight ?? 0);
  // 候補の一覧と候補の id(aria-controls / aria-activedescendant)。
  const listId = createUniqueId();
  const start = untrack(() => resolveSelectEditorStart(props.options, props.value, props.initialText, Date.now()));
  let typeahead = start.typeahead;
  const [highlight, setHighlight] = createSignal(start.highlight);
  let currentHighlight = start.highlight;
  const updateHighlight = (next: number | ((current: number) => number)) => {
    currentHighlight = typeof next === 'function' ? next(currentHighlight) : next;
    setHighlight(currentHighlight);
  };
  const [placement, setPlacement] = createSignal<SelectPopoverPlacement | null>(null);
  // 候補の行の高さ(タッチが主の端末は 44px)。開いたときに 1 回だけ決めます。
  const optionRowHeight = resolveSelectOptionRowHeight();
  // 入力の検査の NG の文言(出ている間も選び直せる)。
  const [error, setError] = createSignal<string | null>(null);
  // IME の変換中の入力欄の文字(変換中でなければ null = ハイライト中の名前を出す)。
  const [composing, setComposing] = createSignal<string | null>(null);
  let composingNow: string | null = null;
  const updateComposing = (next: string | null) => {
    composingNow = next;
    setComposing(next);
  };

  // 測るのは描き終わった後 / ウィンドウのイベント / 候補の数が変わったときで、どれも追従させない読み取り(untrack)。
  const measure = () => {
    const element = untrack(input);
    if (!element) {
      return;
    }
    setPlacement(
      computeSelectPopoverPlacement(
        element.getBoundingClientRect(),
        untrack(() => props.options.length),
        window.innerWidth,
        window.innerHeight,
        optionRowHeight,
      ),
    );
  };
  // 描き終わった後にフォーカスして一覧の位置を測り、ウィンドウの大きさ / スクロール(capture: グリッドの中のスクロールにも)で
  //   測り直します。
  onSettled(() => {
    untrack(input)?.focus();
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  });
  // 候補の数が変わったら(行で決まる候補)フォーカスし直して測り直します(React 版は ref のコールバックを付け直す)。
  createEffect(
    () => props.options.length,
    (_length, previous) => {
      if (previous !== undefined) {
        untrack(input)?.focus();
        measure();
      }
    },
    { name: 'selectEditorOptionsRefocus' },
  );
  // 開いたまま並びが変わってセルが動いたら(applyState でソートを外す・URL の戻る など)、候補の一覧を測り直してエディタに
  //   付いていかせます(1.3.0 / S8-05。元の位置に残ってエディタに重なっていた。React 版と同じ)。
  createEffect(
    () => `${props.cellTop ?? 0}:${props.cellLeft ?? 0}`,
    (position, previous) => {
      if (previous !== undefined && previous !== position) {
        measure();
      }
    },
    { name: 'selectEditorFollowCell' },
  );
  // 描く場所は開いている間だけ決めます(ダイアログを後から開いたときも、開いた時点の場所になる)。
  const mount = () => (placement() !== null ? portal.container() : null);

  // ハイライトが変わったら候補を見える範囲へ(jsdom は scrollIntoView が無いので、あれば呼ぶ)。
  createEffect(
    () => [highlight(), list()] as const,
    ([index, element]) => {
      const option = element?.children[index] as HTMLElement | undefined;
      option?.scrollIntoView?.({ block: 'nearest' });
    },
    { name: 'selectEditorScrollHighlight' },
  );

  // rejected はエラーの吹き出しを出して選び直しを続けます。
  const commitValue = (optionValue: string, direction?: EditorCommitDirection) => {
    const result = props.onCommit(optionValue, direction);
    if (result && result.status === 'rejected') {
      setError(result.message);
    }
  };
  const commitHighlighted = (direction?: EditorCommitDirection) => {
    const option = props.options[currentHighlight];
    if (!option) {
      props.onCancel();
      return;
    }
    commitValue(option.value, direction);
  };

  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    // IME の変換中の操作は扱いません。変換が始まる前に表示中の名前を選び、変換の文字で置き換えさせます。
    if (isImeComposingKeyEvent(event)) {
      if (composingNow === null) {
        event.currentTarget.select();
      }
      return;
    }
    handleSelectEditorKeyDown(toEditorKeyEvent(event), {
      optionCount: props.options.length,
      enterMove: props.enterMove,
      onMove: (next) => {
        updateHighlight(next);
        setError(null);
      },
      onCommit: commitHighlighted,
      onCancel: () => props.onCancel(),
      onTypeahead: (key) => {
        const result = typeaheadJump(typeahead, key, Date.now(), props.options);
        typeahead = result.state;
        if (result.index !== null) {
          updateHighlight(result.index);
          setError(null);
        }
      },
    });
  };

  const highlightedOption = () => props.options[highlight()];
  const shownText = () => highlightedOption()?.label ?? String(props.value ?? '');
  const initialShownText = untrack(shownText);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const view = (
    <>
      <input
        ref={setInput}
        type="text"
        inputmode="none"
        value={initialShownText}
        onInput={(event) => {
          // 変換中だけ文字を受けます(それ以外の変更 = Backspace など は受けず、名前のまま)。
          if (event.isComposing) {
            updateComposing(event.currentTarget.value);
          } else {
            event.currentTarget.value = composingNow ?? untrack(shownText);
          }
        }}
        // 変換の始まりでは入力欄の文字を変えません(変えると変換が止まるブラウザがある)。
        onCompositionStart={(event) => updateComposing(event.currentTarget.value)}
        onCompositionEnd={(event) => {
          updateComposing(null);
          const index = findOptionByComposedText(props.options, event.data);
          typeahead = createTypeaheadState();
          if (index !== null) {
            updateHighlight(index);
            setError(null);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!disposed) {
            props.onCancel();
          }
        }}
        // 選ぶだけの combobox(WAI-ARIA の select-only combobox)。候補の一覧を aria-controls で指し、ハイライト中の候補を
        //   aria-activedescendant で読ませます。
        role="combobox"
        aria-label={props.ariaLabel}
        aria-expanded={placement() !== null ? 'true' : 'false'}
        aria-controls={placement() !== null ? listId : undefined}
        aria-activedescendant={placement() !== null && highlightedOption() ? `${listId}-${highlight()}` : undefined}
        aria-invalid={error() !== null ? 'true' : undefined}
        class={[
          'ssg-cell-editor-input',
          'ssg-cell-editor-input--select',
          { 'ssg-cell-editor-input--invalid': error() !== null },
        ]}
        style={props.align ? { 'text-align': props.align } : undefined}
      />
      <CellEditorError message={error()} />
      <Show when={mount()}>
        {(container) => (
          <Portal mount={container()}>
            <div
              ref={setList}
              role="listbox"
              id={listId}
              aria-label={props.ariaLabel}
              class={['ssg-select-editor-popover', props.themeClassName, props.popoverSlot?.className]}
              style={{
                ...props.popoverSlot?.style,
                left: px(placement()?.left ?? 0),
                top: px(placement()?.top ?? 0),
                width: px(placement()?.width ?? 0),
                'max-height': px(placement()?.maxHeight ?? 0),
              }}
              // 候補を押したときにセルの中の入力欄の blur(= 取り消し)が先に起きないよう、一覧の中の pointerdown はフォーカスを
              //   動かしません(一覧のスクロールバーの操作でも blur させない)。
              onPointerDown={(event) => event.preventDefault()}
            >
              <Show
                when={props.options.length > 0}
                fallback={<div class="ssg-select-editor-empty">{texts().noOptions}</div>}
              >
                {/* 候補の要素は位置で使い回します(行で決まる候補の関数が新しい配列を返しても作り直さない。React 版の
                    key={`${value}-${index}`} に近い) */}
                <For each={props.options} keyed={false}>
                  {(option, index) => (
                    <div
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === highlight() ? 'true' : 'false'}
                      class={[
                        'ssg-select-editor-option',
                        { 'ssg-select-editor-option--highlighted': index === highlight() },
                      ]}
                      onClick={() => commitValue(option().value)}
                      onPointerEnter={() => updateHighlight(index)}
                    >
                      {option().label}
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
  // 表で決まったトークン(--ssg-*)を候補の一覧へ写します(グリッドの外なので継承で届かない)。一覧の class(テーマの修飾子)を
  //   書く描画の後に測るよう、JSX を作った後に作ります(先に作ると、開いたままテーマを変えたときに古い class のまま測っていた)。
  createPortalTokens(list, () => props.themeClassName, placement);
  // 入力欄の値はハイライト中の名前(変換中はその文字)。今の値と違うときだけ書きます。
  createRenderEffect(
    () => [input(), composing() ?? shownText()] as const,
    ([element, text]) => {
      if (element && element.value !== text) {
        element.value = text;
      }
    },
    { name: 'selectEditorInputText' },
  );
  // 名前の先頭を見せます(細い列で入力欄が末尾までスクロールしていた)。変換中は触りません。入力欄の値を書く描画の後に
  //   動くよう、JSX を作った後に作ります(同じ更新の中では作った順に動く)。
  createRenderEffect(
    () => [input(), shownText(), composing()] as const,
    ([element, , composingText]) => {
      if (!element || composingText !== null) {
        return;
      }
      element.setSelectionRange(0, 0);
      element.scrollLeft = 0;
    },
    { name: 'selectEditorInputScroll' },
  );
  return view;
}