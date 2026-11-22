// 編集中のセルの上にエディタを重ねる層(1 つのペインぶん)。React 版の CellEditorLayer.tsx にあたります。この部品は「枠の位置・
//   編集のセッション・エディタの種類の振り分け」だけを受け持ち、入力欄と下書きは editors/ の各エディタが持ちます。
//   - 編集のセッション(sessionId。シェルが React 版と同じ決め方で数える = 編集の開始か、位置と行 / 列のキーが両方変わったとき)
//     ごとにエディタを作り直します(同じセルの続けた編集 = Esc → もう一度 F2 でも前の下書きを残さない。編集中に上へ行が足されても
//     打ちかけの文字を残す)。エディタの種類が変わったときも作り直します。
//   - エディタへ渡す初期値はセッションの始まりに 1 回だけ読みます。セルの値・行・位置(session)は読んだときに引きます。
import { Show, createMemo, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type {
  CellEditorContext,
  EditorCommitDirection,
  EditorCommitResult,
  EditorEnterMove,
  GridRowKey,
  GridSelectEditorOption,
} from '@ishibashi0112/spreadsheet-grid-core';
import { toDateInputValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorValues';
import { resolveTypedStartText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorStart';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridColumn, GridResolvedSlots, SolidGridTypes } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import { px } from '../primitives/style';
import { TextCellEditor } from './TextCellEditor';
import { NumberCellEditor } from './NumberCellEditor';
import { SelectCellEditor } from './SelectCellEditor';
import { DateCellEditor } from './DateCellEditor';
import { CustomCellEditor } from './CustomCellEditor';

// ペインの列の領域の中の座標(leadingWidth を含まない)。
export type CellEditorRect = { left: number; top: number; width: number; height: number };

// 編集中のセルの情報(シェルが editingCell から引く。編集中だけ非 null)。
export type CellEditorSession<T> = {
  row: T;
  rowIndex: number;
  sourceRowIndex: number;
  rowKey: GridRowKey;
  colIndex: number;
  column: GridColumn<T>;
  value: unknown;
};

type CellEditorLayerProps<T> = {
  rect: CellEditorRect | null;
  // 編集のセッションの番号(編集していないときは null)。
  sessionId: number | null;
  headerHeight: number;
  leadingWidth: number;
  // 描く窓の基準(拡大の仮想化のときだけ正。オーバーレイと同じ)。
  baseOffset: number;
  // 編集を始めたときの初期値(セッションの始まりに 1 回だけ読む)。
  initialValue: () => string;
  // 編集中の列のエディタ(列から引く。React 版と同じく行に依らない。編集中の位置が一瞬グループ行を指して session が null に
  //   なっても、エディタの種類を変えない = 打ちかけを残す)。
  editor: GridColumn<T>['editor'];
  session: CellEditorSession<T> | null;
  themeClassName?: string | undefined;
  slots: GridResolvedSlots;
  onCommit: (value: unknown, direction?: EditorCommitDirection) => EditorCommitResult | void;
  onCancel: () => void;
  // 打ちかけを確定する関数を預ける先(core editController の registerDraftFlush。1.3.0 / S7-03 / S8-04)。
  onRegisterFlush?: ((flush: (() => void) | null) => void) | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  enterMove?: EditorEnterMove | undefined;
  // 開いているときの枠の DOM id(編集中のセルが aria-owns で子に持つ)。
  domId?: string | undefined;
  // 編集中のセルが上にそろえて描かれているか(複数行のエディタの 1 行目をセルの文字にそろえる)。
  alignTop?: boolean | undefined;
};

type EditorKind = 'text' | 'number' | 'select' | 'date' | 'custom';

export function CellEditorLayer<T>(props: CellEditorLayerProps<T>) {
  const texts = useGridLocaleText();
  const editor = () => props.editor;
  const kind = createMemo((): EditorKind => {
    const type = editor()?.type;
    return type === 'number' || type === 'select' || type === 'date' || type === 'custom' ? type : 'text';
  });
  // 「(列名) を編集」。枠の group と組み込みのエディタの入力欄の両方の名前にします。
  const editLabel = () => {
    const session = props.session;
    return session ? formatLocaleText(texts().editCell, { column: session.column.title || session.column.key }) : undefined;
  };
  const cellHeight = () => props.rect?.height ?? 0;
  // select の行で決まる候補は編集中の行で引きます(行が変わったときだけ引き直す)。
  const selectOptions = createMemo((): GridSelectEditorOption[] => {
    const current = editor();
    if (current?.type !== 'select') {
      return [];
    }
    if (typeof current.options !== 'function') {
      return current.options;
    }
    const row = props.session?.row;
    return row !== undefined ? current.options(row) : [];
  });

  const renderCustomEditor = (
    render: Extract<GridColumn<T>['editor'], { type: 'custom' }>['render'],
    sessionId: number,
    initialValue: string,
  ): JSX.Element => {
    // custom エディタ。ctx の行・位置・値は読んだときに引きます(JSX の中で読めば追従する。編集中に上へ行が足されたときなど)。
    //   セッションが終わった後(別のセルの編集が始まった後など)は、そのセッションの最後の値のまま(サーバーで検査してから
    //   commit する作りで、await の後に読んだ ctx.row が別のセルの行を指していた。React 版は描いた時点の値を渡す)。
    //   変更(1.3.0 / S3-21): 編集中の位置に行が無い間(上に行が足されて一瞬グループ行を指すときなど)も、最後の値のまま描き続けます
    //   (これまではその間だけ外して作り直し、利用側のエディタの打ちかけが消えて、開いたときの値に戻っていた。React 版も同じ)。
    const session = createMemo((previous: CellEditorSession<T> | null | undefined) =>
      previous === undefined || props.sessionId === sessionId ? (props.session ?? previous ?? null) : previous,
    );
    const context = {
      get row() {
        return session()?.row as T;
      },
      get rowIndex() {
        return session()?.rowIndex ?? -1;
      },
      get sourceRowIndex() {
        return session()?.sourceRowIndex ?? -1;
      },
      get rowKey() {
        return session()?.rowKey ?? -1;
      },
      get colIndex() {
        return session()?.colIndex ?? -1;
      },
      get column() {
        return session()?.column as GridColumn<T>;
      },
      get value() {
        return session()?.value;
      },
      initialText: initialValue,
      get align() {
        return props.align;
      },
      // void の戻り(モックなど)は noop にそろえて、利用側の分岐を単純にします。
      commit: (value: unknown, direction?: EditorCommitDirection) =>
        props.onCommit(value, direction) ?? { status: 'noop' as const },
      cancel: () => props.onCancel(),
    } satisfies CellEditorContext<T, SolidGridTypes>;
    // 行が揃うまでは描きません(行の無い ctx を渡さない。揃った後は上の memo が最後の値を持つので外れない)。
    return (
      <Show when={session() !== null}>
        <CustomCellEditor render={render} context={context} />
      </Show>
    );
  };

  const renderEditor = (type: EditorKind, sessionId: number): JSX.Element => {
    const common = {
      get ariaLabel() {
        return editLabel();
      },
      get enterMove() {
        return props.enterMove;
      },
      get align() {
        return props.align;
      },
      get cellHeight() {
        return cellHeight();
      },
      get alignTop() {
        return props.alignTop;
      },
      onCommit: (value: unknown, direction?: EditorCommitDirection) => props.onCommit(value, direction),
      onCancel: () => props.onCancel(),
      onRegisterFlush: (flush: (() => void) | null) => props.onRegisterFlush?.(flush),
    };
    const initialValue = untrack(props.initialValue);
    // select / custom は打ちかけを預けません(前のエディタの関数を残さない。React 版と同じ)。
    if (type === 'select' || type === 'custom') {
      props.onRegisterFlush?.(null);
    }
    switch (type) {
      case 'number': {
        const numberEditor = () => {
          const current = editor();
          return current?.type === 'number' ? current : undefined;
        };
        return (
          <NumberCellEditor
            {...common}
            initialValue={initialValue}
            min={numberEditor()?.min}
            max={numberEditor()?.max}
            step={numberEditor()?.step}
          />
        );
      }
      case 'date': {
        // date はセルの今の値から開きます。文字から打ち始めたとき(初期値がセルの値の文字列と違う)は、その文字で文字の欄を開きます。
        const session = untrack(() => props.session);
        return (
          <DateCellEditor
            {...common}
            initialValue={toDateInputValue(session ? session.value : initialValue)}
            initialText={session ? resolveTypedStartText(initialValue, session.value) : undefined}
          />
        );
      }
      case 'select': {
        const session = untrack(() => props.session);
        return (
          <SelectCellEditor
            {...common}
            popoverSlot={props.slots.popover}
            themeClassName={props.themeClassName}
            options={selectOptions()}
            value={props.session?.value}
            // 印字キー / IME 確定での開始(初期値がセルの値の文字列と違う)ならタイプアヘッドに使います。
            initialText={session ? resolveTypedStartText(initialValue, session.value) : undefined}
          />
        );
      }
      case 'custom': {
        const current = untrack(editor);
        if (current?.type !== 'custom') {
          return null;
        }
        return renderCustomEditor(current.render, sessionId, initialValue);
      }
      default: {
        const textEditor = () => {
          const current = editor();
          return current?.type === 'text' ? current : undefined;
        };
        return (
          <TextCellEditor
            {...common}
            initialValue={initialValue}
            // `editor: { type: 'text', multiline: true }` は複数行の入力欄で開きます。
            multiline={textEditor()?.multiline === true}
            enterKey={textEditor()?.enterKey}
            // 複数行の入力欄もセルと同じ位置で折り返します。
            wordBreak={props.session?.column.wordBreak}
            lineBreak={props.session?.column.lineBreak}
          />
        );
      }
    }
  };

  return (
    <Show when={props.rect !== null ? props.sessionId : null} keyed>
      {(sessionId) => (
        <div
          class={['ssg-cell-editor', props.slots.cellEditor?.className]}
          // エディタは行の外に重ねて描くので、どの列を編集しているかを名前で伝えます。
          role={props.session ? 'group' : undefined}
          aria-label={props.session ? editLabel() : undefined}
          // 編集中のセルが aria-owns でこの枠を子に持ちます。
          id={props.session ? props.domId : undefined}
          style={{
            ...props.slots.cellEditor?.style,
            position: 'absolute',
            left: px(props.leadingWidth + (props.rect?.left ?? 0)),
            top: px(props.headerHeight + (props.rect?.top ?? 0) - props.baseOffset),
            width: px(props.rect?.width ?? 0),
            height: px(props.rect?.height ?? 0),
          }}
        >
          <Show when={kind()} keyed>
            {(type) => renderEditor(type, sessionId)}
          </Show>
        </div>
      )}
    </Show>
  );
}