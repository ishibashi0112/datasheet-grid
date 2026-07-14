// 追加(editor: select): 候補リストから選ぶ select エディタです。
//   インセルは readOnly の text input(フォーカスアンカー + 現在ハイライトの label 表示)、
//   候補リストは document.body 直下のポータル(.ssg-root 外)へ fixed 配置で描画します
//   (ポップオーバー規約: themeClassName を root へ直接付与 / トークンは styles.css の
//   セレクタリストで供給 / z-index 1000)。
//   確定規則: 選択 = 即 commit(ドラフト概念なし)。そのため blur / Escape は cancel(値不変)
//   です(text エディタの blur=commit と非対称。API_REFERENCE に明記)。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type {
  EditorCommitDirection,
  EditorCommitResult,
  GridSelectEditorOption,
} from '../model/gridTypes';
import { CellEditorErrorBubble } from './CellEditorErrorBubble';
import {
  computeSelectPopoverPlacement,
  createTypeaheadState,
  moveHighlight,
  resolveInitialHighlight,
  typeaheadJump,
  type SelectPopoverPlacement,
} from '../logic/selectEditorState';
import { cx } from '../logic/cx';

type SelectCellEditorProps = {
  options: GridSelectEditorOption[];
  // 編集開始時のセル生値です(初期ハイライトの解決に使用)。
  value: unknown;
  onCommit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult | void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
  // ポータル root へ直接付与するテーマ修飾子('ssg-theme-dark' | undefined)です。
  themeClassName?: string;
};

export function SelectCellEditor({
  options,
  value,
  onCommit,
  onCancel,
  align,
  themeClassName,
}: SelectCellEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef(createTypeaheadState());
  const [highlight, setHighlight] = useState(() =>
    resolveInitialHighlight(options, value),
  );
  const [placement, setPlacement] = useState<SelectPopoverPlacement | null>(null);
  // 追加(validation): reject 列の検証 NG メッセージです(表示中も選択操作は継続できます)。
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => moveHighlight(current, delta, options.length));
      setErrorMessage(null);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitHighlighted('down');
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

  return (
    <>
      <input
        ref={anchorRefCallback}
        type="text"
        readOnly
        value={highlightedOption?.label ?? String(value ?? '')}
        onKeyDown={handleKeyDown}
        onBlur={() => onCancel()}
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
              className={cx('ssg-select-editor-popover', themeClassName)}
              style={{
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
                <div className="ssg-select-editor-empty">候補がありません</div>
              ) : (
                options.map((option, index) => (
                  <div
                    key={`${option.value}-${index}`}
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