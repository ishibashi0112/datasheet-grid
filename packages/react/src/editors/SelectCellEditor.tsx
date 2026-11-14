// 追加(editor: select): 候補リストから選ぶ select エディタです。
//   インセルは readOnly の text input(フォーカスアンカー + 現在ハイライトの label 表示)、
//   候補リストは document.body 直下のポータル(.ssg-root 外)へ fixed 配置で描画します
//   (ポップオーバー規約: themeClassName を root へ直接付与 / トークンは styles.css の
//   セレクタリストで供給 / z-index 1000)。
//   確定規則: 選択 = 即 commit(ドラフト概念なし)。そのため blur / Escape は cancel(値不変)
//   です(text エディタの blur=commit と非対称。API_REFERENCE に明記)。
// 変更(1.0.2 / 2026-11-09 実アプリの総点検 E-08): IME で確定した文字(日本語の名前など)でも候補を探します。インセルの
//   input は readOnly をやめ(readOnly では IME の変換が始まらない)、印字キーはこれまでどおりタイプアヘッドで止め、
//   変換が始まるときだけ表示中の名前を選んで変換の文字に置き換えさせ、確定したら(compositionend)その文字で始まる
//   (無ければ含む)候補へ移ります。スマホのソフトキーボードは inputMode="none" で出しません(readOnly と同じ)。
// 変更(1.0.2 / C-05): 細い列でインセルの名前の末尾が見えて先頭が欠けていた(入力欄が末尾までスクロール)ので、
//   ハイライトが変わるたびに先頭を見せます。
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
  GridSelectEditorOption,
} from '../model/gridTypes';
import { resolveEnterDirection } from './editorKeyBindings';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import { usePortalTokens } from '../hooks/usePortalTokens';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import {
  computeSelectPopoverPlacement,
  createTypeaheadState,
  findOptionByComposedText,
  moveHighlight,
  resolveInitialHighlight,
  typeaheadJump,
  type SelectPopoverPlacement,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectEditorState';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import type { GridResolvedSlot } from '../model/gridTypes';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import { useGridLocaleText } from '../hooks/useGridLocaleText';

// 追加(dogfood DF-13): PageUp / PageDown で動かす候補の数です。
const SELECT_PAGE_STEP = 8;

type SelectCellEditorProps = {
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-34): 入力欄の読み上げの名前(「(列名) を編集」。枠の group と同じ)。
  ariaLabel?: string;
  options: GridSelectEditorOption[];
  // 編集開始時のセル生値です(初期ハイライトの解決に使用)。
  value: unknown;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
  // ポータル root へ直接付与するテーマ修飾子('ssg-theme-dark' | 'ssg-theme-class' | undefined)です。
  themeClassName?: string;
  // 追加(slot-props): classNames.popover の解決済みスロット(候補リストのポータル root へ)。
  popoverSlot?: GridResolvedSlot;
  // 追加(enter-move ②): Enter 確定後の移動先です(未指定 = 'down')。
  enterMove?: EditorEnterMove;
  // 追加(audit RD-9): 印字キー / IME 確定で編集を始めたときの文字列です。開いた時点でタイプアヘッドに 1 回
  //   使い、label がその文字列で始まる最初の候補をハイライトします(一致が無ければ現在値のまま)。
  initialText?: string;
};

export function SelectCellEditor({
  ariaLabel,
  options,
  value,
  onCommit,
  onCancel,
  align,
  themeClassName,
  popoverSlot,
  enterMove,
  initialText,
}: SelectCellEditorProps) {
  // 追加(英語対応): 文言(localeText)。
  const texts = useGridLocaleText();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 追加(1.0.1 / AP-34): 候補の一覧と候補の id(aria-controls / aria-activedescendant)。
  const listId = useId();
  // 修正(audit RD-9): 開始文字列があればタイプアヘッドを 1 回適用した状態から始めます(続けて打つと前方一致を
  //   伸ばせるよう、タイプアヘッドのバッファも引き継ぎます)。
  const [initialState] = useState(() => {
    const fallback = resolveInitialHighlight(options, value);
    if (!initialText) {
      return { highlight: fallback, typeahead: createTypeaheadState() };
    }
    const result = typeaheadJump(createTypeaheadState(), initialText, Date.now(), options);
    return { highlight: result.index ?? fallback, typeahead: result.state };
  });
  const typeaheadRef = useRef(initialState.typeahead);
  const [highlight, setHighlight] = useState(initialState.highlight);
  const [placement, setPlacement] = useState<SelectPopoverPlacement | null>(null);
  // 追加(DevBI の報告): 表で決まったトークン(--ssg-*)を候補のリストへ写します(body 直下のため継承で届かない)。
  usePortalTokens(listRef, placement !== null, themeClassName);
  // 追加(validation): reject 列の検証 NG メッセージです(表示中も選択操作は継続できます)。
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 追加(1.0.2 / E-08): IME の変換中の入力欄の文字(変換中でなければ null = ハイライト中の名前を出す)。
  const [composingText, setComposingText] = useState<string | null>(null);

  // アンカー(インセル input)の callback ref です。マウント時にフォーカスし初期配置を計測します
  //   (effect 冒頭 setState の lint 制約を避けるため、計測は ref callback とイベントリスナ内
  //   でのみ行います。ref callback は commit 後 = レイアウト確定後に呼ばれます)。
  const anchorRefCallback = useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      if (element) {
        element.focus();
        setPlacement(
          computeSelectPopoverPlacement(
            element.getBoundingClientRect(),
            options.length,
            window.innerWidth,
            window.innerHeight,
          ),
        );
      }
    },
    [options.length],
  );

  // resize / scroll(capture: グリッド内部の仮想スクロールにも追従)で配置を再計算します。
  useEffect(() => {
    const update = () => {
      const element = inputRef.current;
      if (!element) {
        return;
      }
      setPlacement(
        computeSelectPopoverPlacement(
          element.getBoundingClientRect(),
          options.length,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [options.length]);

  // ハイライト移動時に候補を可視範囲へスクロールします(jsdom は scrollIntoView 未実装のため
  //   optional call)。
  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const optionElement = list.children[highlight] as HTMLElement | undefined;
    optionElement?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight]);

  // 追加(validation): rejected はエラーバブルを表示して選択を継続します。
  const commitValue = (optionValue: string, direction?: EditorCommitDirection) => {
    const result = onCommit(optionValue, direction);
    if (result && result.status === 'rejected') {
      setErrorMessage(result.message);
    }
  };

  const commitHighlighted = (direction?: EditorCommitDirection) => {
    const option = options[highlight];
    if (!option) {
      onCancel();
      return;
    }
    commitValue(option.value, direction);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中の操作は無視します(editorKeyBindings と同じガード)。
    if (isImeComposingKeyEvent(event.nativeEvent)) {
      // 追加(1.0.2 / E-08): 変換が始まる前に表示中の名前を選び、変換の文字で置き換えさせます。
      if (composingText === null) {
        event.currentTarget.select();
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => moveHighlight(current, delta, options.length));
      setErrorMessage(null);
      return;
    }

    // 追加(dogfood DF-13): Home / End は先頭 / 末尾の候補、PageUp / PageDown は SELECT_PAGE_STEP 件ずつ(端で止まる)。
    //   これまではブラウザの既定の動作でグリッドがスクロールし、エディタが画面の外へ出ていました。
    if (event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const key = event.key;
      if (options.length > 0) {
        setHighlight((current) => {
          if (key === 'Home') return 0;
          if (key === 'End') return options.length - 1;
          const base = current < 0 ? 0 : current;
          const step = key === 'PageDown' ? SELECT_PAGE_STEP : -SELECT_PAGE_STEP;
          return Math.min(Math.max(base + step, 0), options.length - 1);
        });
        setErrorMessage(null);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      // 変更(enter-move ②): 方向は editorEnterMove に従います(既定 'down')。
      commitHighlighted(resolveEnterDirection(enterMove));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitHighlighted(event.shiftKey ? 'left' : 'right');
      return;
    }

    // タイプアヘッド(印字キーのみ / 修飾キー付きは無視)。label 前方一致へジャンプします。
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const result = typeaheadJump(
        typeaheadRef.current,
        event.key,
        Date.now(),
        options,
      );
      typeaheadRef.current = result.state;
      if (result.index !== null) {
        setHighlight(result.index);
        setErrorMessage(null);
      }
    }
  };

  const highlightedOption = options[highlight];
  const shownText = highlightedOption?.label ?? String(value ?? '');

  // 追加(1.0.2 / C-05): 名前の先頭を見せます(細い列で入力欄が末尾までスクロールしていた)。変換中は触りません。
  useIsomorphicLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || composingText !== null) {
      return;
    }
    input.setSelectionRange(0, 0);
    input.scrollLeft = 0;
  }, [shownText, composingText]);

  return (
    <>
      <input
        ref={anchorRefCallback}
        type="text"
        inputMode="none"
        value={composingText ?? shownText}
        onChange={(event) => {
          // 変換中だけ文字を受けます(それ以外の変更 = Backspace など は受けず、名前のまま)。
          if ((event.nativeEvent as InputEvent).isComposing) {
            setComposingText(event.target.value);
          }
        }}
        // 変換の始まりでは入力欄の文字を変えません(変えると変換が止まるブラウザがある)。
        onCompositionStart={(event) => setComposingText(event.currentTarget.value)}
        onCompositionEnd={(event) => {
          setComposingText(null);
          const index = findOptionByComposedText(options, event.data);
          typeaheadRef.current = createTypeaheadState();
          if (index !== null) {
            setHighlight(index);
            setErrorMessage(null);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => onCancel()}
        // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-34): 選ぶだけの combobox(WAI-ARIA の select-only combobox)として伝えます。
        //   候補の一覧(body 直下)を aria-controls で指し、ハイライト中の候補を aria-activedescendant で読ませます
        //   (これまでは入力欄の値が変わるだけで、名前も無かった)。
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={placement !== null}
        aria-controls={placement !== null ? listId : undefined}
        aria-activedescendant={placement !== null && highlightedOption ? `${listId}-${highlight}` : undefined}
        aria-invalid={errorMessage !== null || undefined}
        className={cx(
          'ssg-cell-editor-input ssg-cell-editor-input--select',
          errorMessage !== null && 'ssg-cell-editor-input--invalid',
        )}
        style={align ? { textAlign: align } : undefined}
      />
      {errorMessage !== null ? (
        <CellEditorErrorBubble message={errorMessage} />
      ) : null}
      {placement
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              id={listId}
              aria-label={ariaLabel}
              className={cx(
                'ssg-select-editor-popover',
                themeClassName,
                popoverSlot?.className,
              )}
              style={{
                ...popoverSlot?.style,
                left: placement.left,
                top: placement.top,
                width: placement.width,
                maxHeight: placement.maxHeight,
              }}
              // 候補クリックでインセル input の blur(= cancel)が先行しないよう、
              //   ポップオーバー内の pointerdown はフォーカス移動を抑止します
              //   (リストのスクロールバー操作でも blur させない)。
              onPointerDown={(event) => event.preventDefault()}
            >
              {options.length === 0 ? (
                <div className="ssg-select-editor-empty">{texts.noOptions}</div>
              ) : (
                options.map((option, index) => (
                  <div
                    key={`${option.value}-${index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === highlight}
                    className={cx(
                      'ssg-select-editor-option',
                      index === highlight &&
                        'ssg-select-editor-option--highlighted',
                    )}
                    onClick={() => commitValue(option.value)}
                    onPointerEnter={() => setHighlight(index)}
                  >
                    {option.label}
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default SelectCellEditor;