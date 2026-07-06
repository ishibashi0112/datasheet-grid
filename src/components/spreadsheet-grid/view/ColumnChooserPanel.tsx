// 追加(13-B2-1): 列の表示/非表示パネル(AG Grid の Columns Tool Panel 相当)です。
//   - タイトル + × クローズ / 検索ボックス / 3 状態の全選択チェックボックス /
//     列ごとのチェックボックス一覧(チェックで即 表示/非表示)で構成します。
//   - 本コンポーネントは非ジェネリックです(ColumnMenuPopover と同様、プリミティブな
//     items だけを受け取ります)。一覧は「全列(非表示列を含む)」を渡す必要があるため、
//     呼び出し側は visibleColumns ではなく columns から items を作ります。
// 変更(13-B2-2): フッターに「すべての列を初期状態に戻す」ボタンを追加します
//   (AG Grid の Columns Tool Panel 末尾 "Reset Columns" 相当)。幅 / 固定 / 表示を
//   初期 column defs へ戻す操作で、ロジックは呼び出し側(onResetColumns)が持ちます。
//   canToggle(= onColumnsChange 指定あり)が false のときは無効化します。
// 変更(13-B3-1): 各行に ⠿ ドラッグハンドルを追加し、pointer ベースで一覧を並べ替えます
//   (AG Grid の Columns Tool Panel のドラッグ並べ替え相当の第 1 段階)。
//   - 並べ替えは items(= columns の定義配列順)の順序のみを変更します。pinned の変更や
//     ペイン跨ぎは本バッチでは扱いません(ヘッダー D&D の 13-B3-2 で対応)。確定した
//     キー順は onReorderColumns(orderedKeys) で呼び出し側へ渡し、commit は呼び出し側が
//     担います(表示/非表示・リセットと同じく onColumnsChange 経由)。
//   - ドラッグ可否は canToggle(= onColumnsChange あり)かつ「検索語が空」のときのみ。
//     検索で一覧が絞り込まれているときは、絞り込みビュー上の並べ替えが曖昧なため
//     ハンドルを無効化します(AG Grid 同様)。
//   - ドラッグ中はドロップ位置インジケータ(行間の細線)を表示し、一覧端付近では
//     一覧コンテナを自動スクロールします(29 列で一覧が パネル上限高 を超えるため)。
// 変更(13-B3-1.5): 一覧を pinned ペイン(left / center / right)ごとの小見出しセクションへ
//   分割します(AG Grid 着想の独自解。AG Grid 本家のツールパネルは pinned ではセクション
//   分けしませんが、本実装は「パネル = 定義配列素順 / グリッド = reorderColumnsByPane 後の
//   pane 順」の体感ズレを解消するため、各列を所属ペインのセクションへ表示します)。
//   - 並べ替えは「同一セクション内のみ」許可します(pinned 不変。pinned 変更はヘッダー D&D
//     の 13-B3-2 の領分)。セクション跨ぎドロップはドロップ線をソースセクション内へ留める
//     ことで実質不可にします。
//   - commit 時に返す orderedKeys は left 群 → center 群 → right 群を各セクションの表示順で
//     連結した「全列キー順」です(合意ポイント①=A: columns 配列が pane 順に正規化され、
//     reorderColumnsByPane が冪等化します)。セクション内が実際に動かない no-op ドラッグでは
//     正規化も行わず null を返します。
//   - 非空セクションが 1 つだけ(= 固定列なし)のときは小見出しを出さずフラット表示します。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../logic/cx';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { ColumnChooserLayout } from '../hooks/useColumnChooserController';
// 追加(FM-4): ヘッダーを掴んでパネルを移動する共有フックです(3 パネル共通)。
import { usePanelHeaderDrag } from '../hooks/usePanelHeaderDrag';
// 追加(13-B3-1.5): セクション分けの所属ペイン種別です(pinned 由来)。
import type { ColumnPane } from '../logic/geometry';

// 追加(13-B2-1): パネルが必要とする最小の列情報です。
// 変更(13-B3-1.5): 所属ペイン(pinned 由来。left / center / right)を追加します。
//   呼び出し側(SpreadsheetGrid)が getColumnPane 相当で算出して渡します。
export type ColumnChooserItem = {
  key: string;
  title: string;
  visible: boolean;
  pane: ColumnPane;
};

type ColumnChooserPanelProps = {
  isOpen: boolean;
  items: ColumnChooserItem[];
  // 追加: onColumnsChange 未指定時は false。チェックボックスを無効化し注記を出します。
  canToggle: boolean;
  layout: ColumnChooserLayout | null;
  panelRef: RefObject<HTMLDivElement | null>;
  onToggleColumnVisibility: (columnKey: string, nextVisible: boolean) => void;
  // 追加: 全選択(= すべて表示)。最後の 1 列ガードのため「全消し」はサポートしません。
  onShowAllColumns: () => void;
  // 追加(13-B2-2): 全列を初期状態(幅 / 固定 / 表示)へ戻します。
  //   ロジックは呼び出し側。canToggle が false のときフッターのボタンは無効化されます。
  onResetColumns: () => void;
  // 追加(13-B3-1): ドラッグ並べ替えの確定ハンドラです。並べ替え後の「全列キー順」を
  //   渡します(items と同一集合の permutation)。commit(onColumnsChange 経由)は
  //   呼び出し側が担います。検索中・canToggle=false 時は呼ばれません。
  onReorderColumns: (orderedKeys: string[]) => void;
  onRequestClose: () => void;
  // 追加(FM-4): ヘッダードラッグによるパネル移動です(controller の moveColumnChooser を
  //   受け取ります。位置の clamp・保持・close 時リセットは controller 側の責務)。
  onPanelMove: (top: number, left: number) => void;
};

// 追加(13-B3-1): ドラッグ中の一覧端オートスクロールのしきい値 / 速度です。
//   一覧コンテナの上下端から EDGE px 以内にポインタが入ったら、毎フレーム SPEED px ずつ
//   スクロールします(29 列で一覧が パネル上限高 を超えるための補助)。
const AUTO_SCROLL_EDGE = 28;
const AUTO_SCROLL_SPEED = 12;

// 追加(13-B3-1.5): セクション(所属ペイン)の小見出しラベルです。
const PANE_ORDER: ColumnPane[] = ['left', 'center', 'right'];
const SECTION_LABELS: Record<ColumnPane, string> = {
  left: '左固定',
  center: '固定なし',
  right: '右固定',
};

// 変更(13-B3-1.5): セクション内(= fromKey と同一ペイン)でのみ並べ替え、確定時に
//   left 群 → center 群 → right 群を各セクションの表示順で連結した「全列キー順」を返します
//   (合意ポイント①=A: 書き戻すと columns 配列が pane 順へ正規化されます)。
//   dropIndexInPane は「ソースペイン内での挿入位置(0..そのペインの件数)」です。
//   セクション内が実際に動かない no-op の場合は正規化も行わず null を返します。
//   ※ ドラッグは検索語が空のときのみ可能なため、items は常に「全列(絞り込み前)」です。
function computeSectionReorderedKeys(
  items: ColumnChooserItem[],
  fromKey: string,
  dropIndexInPane: number,
): string[] | null {
  const from = items.find((item) => item.key === fromKey);
  if (!from) {
    return null;
  }
  const sourcePane = from.pane;

  // items 順を保ったままペインごとのキー配列へ分割します。
  const groups: Record<ColumnPane, string[]> = { left: [], center: [], right: [] };
  for (const item of items) {
    groups[item.pane].push(item.key);
  }

  const src = groups[sourcePane];
  const fromIndex = src.indexOf(fromKey);
  if (fromIndex < 0) {
    return null;
  }
  // 挿入位置は除去前基準。除去で fromIndex 以降が 1 つ詰まるため to を補正します。
  let to = dropIndexInPane;
  if (to > fromIndex) {
    to -= 1;
  }
  to = Math.max(0, Math.min(to, src.length - 1));
  if (to === fromIndex) {
    // セクション内 no-op → 正規化もしません(no-op ドラッグで配列を動かさないため)。
    return null;
  }
  const [moved] = src.splice(fromIndex, 1);
  src.splice(to, 0, moved);

  return [...groups.left, ...groups.center, ...groups.right];
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate';

// 追加(13-B2-1): 3 状態に対応した自作チェックボックスです。
//   native input の indeterminate は ref 経由でしか設定できず、角丸の見た目も
//   ブラウザ差が出るため、見た目は div で描画します(GIF の角丸チェックに寄せます)。
function CheckBox({
  state,
  disabled,
}: {
  state: CheckState;
  disabled: boolean;
}) {
  const filled = state === 'checked' || state === 'indeterminate';

  return (
    <span
      className={cx(
        'ssg-checkbox',
        filled && 'ssg-checkbox--filled',
        disabled && 'ssg-checkbox--disabled',
      )}
      aria-hidden
    >
      {state === 'checked' && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 4.7 8.4 9.5 3.6"
            // 変更(TH-DK-1): stroke も属性では var() 不可のため style で指定します。
            style={{ stroke: 'var(--ssg-panel-accent-contrast)' }}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {state === 'indeterminate' && <span className="ssg-checkbox-dash" />}
    </span>
  );
}

// 追加(13-B3-1): ⠿ ドラッグハンドルの見た目です(2×3 の点)。
//   操作系(pointerdown / capture)は行側に配線し、ここは見た目のみを描画します。
function DragHandleGlyph({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      // 変更(TH-DK-1): fill はプレゼンテーション属性だと var() を解釈しないため style で指定します。
      style={{
        fill: disabled
          ? 'var(--ssg-panel-text-disabled)'
          : 'var(--ssg-panel-text-faint)',
      }}
      aria-hidden
    >
      {[3, 8, 13].map((cy) =>
        [3, 7].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" />
        )),
      )}
    </svg>
  );
}

export function ColumnChooserPanel({
  isOpen,
  items,
  canToggle,
  layout,
  panelRef,
  onToggleColumnVisibility,
  onShowAllColumns,
  onResetColumns,
  onReorderColumns,
  onRequestClose,
  onPanelMove,
}: ColumnChooserPanelProps) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 追加: 開くたびに検索語をリセットし、検索入力へフォーカスします。
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      // portal mount 後にフォーカスを当てます。
      const id = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [isOpen]);

  // 注記: master / guard の判定は「全列(検索フィルタ前)」を基準にします。
  //       検索はあくまで一覧の絞り込み表示で、全選択の意味は変えません。
  const visibleCount = useMemo(
    () => items.filter((item) => item.visible).length,
    [items],
  );
  const allVisible = visibleCount === items.length && items.length > 0;
//   const hasHidden = items.some((item) => !item.visible);

  // 全選択の状態: 全表示 = checked、一部非表示 = indeterminate。
  // 最後の 1 列ガードにより「全非表示」は発生しないため unchecked にはなりません。
  const masterState: CheckState = allVisible ? 'checked' : 'indeterminate';

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, query]);

  // 追加(13-B3-1.5): filteredItems を所属ペインのセクションへ分割します。
  //   空セクションは除外し、PANE_ORDER(left → center → right)で並べます。
  //   各セクション内は filteredItems の相対順(= columns 配列の pane 内相対順)を保ちます。
  const sections = useMemo(() => {
    const groups: Record<ColumnPane, ColumnChooserItem[]> = {
      left: [],
      center: [],
      right: [],
    };
    for (const item of filteredItems) {
      groups[item.pane].push(item);
    }
    return PANE_ORDER.map((pane) => ({ pane, items: groups[pane] })).filter(
      (section) => section.items.length > 0,
    );
  }, [filteredItems]);

  // 非空セクションが 2 つ以上(= 固定列あり)のときだけ小見出しを出します。
  // 固定列が無いときは従来どおりフラット一覧になります。
  const showHeadings = sections.length >= 2;

  // ── ドラッグ並べ替え(13-B3-1) ─────────────────────────
  // ドラッグ可否: onColumnsChange あり(canToggle)かつ検索語が空のときのみ。
  // 検索中は一覧が絞り込み表示のため、並べ替え対象の全体像が見えず曖昧になるので無効化します。
  const canDrag = canToggle && query.trim() === '';

  const listRef = useRef<HTMLDivElement | null>(null);
  // ドラッグ中の列キー(null = 非ドラッグ)。dragActiveRef は pointer ハンドラ内の
  // 早期 return 判定用(state 反映前の連続イベントでも確実に効くよう ref で持ちます)。
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragActiveRef = useRef(false);
  // 追加(13-B3-1.5): ドラッグ元のペインです。ドロップ位置走査をこのペインの行へ限定し、
  //   セクション跨ぎを実質不可にします(ref は走査ハンドラから同期読みするため)。
  const draggingPaneRef = useRef<ColumnPane | null>(null);
  // ドロップ挿入位置(items 上の 0..length。length = 末尾へ)。インジケータ描画に使います。
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const pointerYRef = useRef(0);
  const autoScrollRafRef = useRef<number | null>(null);

  // ポインタ Y から「行 midpoint より上にある行数」= 挿入インデックスを求めます。
  // 変更(13-B3-1.5): 走査対象をドラッグ元ペイン(draggingPaneRef)の行へ限定します。
  //   これにより別セクション上にポインタがあってもドロップ位置はソースセクション内へ
  //   留まり、セクション跨ぎが実質不可になります(pinned 不変)。
  const updateDropFromPointer = useCallback(() => {
    const list = listRef.current;
    const pane = draggingPaneRef.current;
    if (!list || !pane) {
      return;
    }
    const rows = list.querySelectorAll<HTMLElement>(
      `[data-chooser-row][data-chooser-pane="${pane}"]`,
    );
    const y = pointerYRef.current;
    let index = rows.length;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDropIndex(index);
  }, []);

  // ドラッグ中、一覧コンテナの上下端付近へポインタが入ったらオートスクロールします。
  const autoScrollTick = useCallback(() => {
    const list = listRef.current;
    if (!list || !dragActiveRef.current) {
      autoScrollRafRef.current = null;
      return;
    }
    const rect = list.getBoundingClientRect();
    const y = pointerYRef.current;
    let delta = 0;
    if (y < rect.top + AUTO_SCROLL_EDGE) {
      delta = -AUTO_SCROLL_SPEED;
    } else if (y > rect.bottom - AUTO_SCROLL_EDGE) {
      delta = AUTO_SCROLL_SPEED;
    }
    if (delta !== 0) {
      const before = list.scrollTop;
      list.scrollTop += delta;
      if (list.scrollTop !== before) {
        updateDropFromPointer();
      }
    }
    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  }, [updateDropFromPointer]);

  const finishDrag = useCallback(
    (commit: boolean) => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      const key = draggingKey;
      const targetIndex = dropIndex;
      dragActiveRef.current = false;
      draggingPaneRef.current = null;
      setDraggingKey(null);
      setDropIndex(null);
      if (commit && key !== null && targetIndex !== null) {
        const next = computeSectionReorderedKeys(items, key, targetIndex);
        if (next) {
          onReorderColumns(next);
        }
      }
    },
    [draggingKey, dropIndex, items, onReorderColumns],
  );

  const handleDragHandlePointerDown = useCallback(
    (key: string, pane: ColumnPane, event: PointerEvent<HTMLElement>) => {
      if (!canDrag) {
        return;
      }
      // 既定のテキスト選択 / 行クリックを抑止し、grid 側へも伝播させません。
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragActiveRef.current = true;
      draggingPaneRef.current = pane;
      pointerYRef.current = event.clientY;
      setDraggingKey(key);
      updateDropFromPointer();
      if (autoScrollRafRef.current === null) {
        autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
      }
    },
    [canDrag, updateDropFromPointer, autoScrollTick],
  );

  const handleDragHandlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragActiveRef.current) {
        return;
      }
      pointerYRef.current = event.clientY;
      updateDropFromPointer();
    },
    [updateDropFromPointer],
  );

  const handleDragHandlePointerUp = useCallback(() => {
    if (!dragActiveRef.current) {
      return;
    }
    finishDrag(true);
  }, [finishDrag]);

  const handleDragHandlePointerCancel = useCallback(() => {
    if (!dragActiveRef.current) {
      return;
    }
    finishDrag(false);
  }, [finishDrag]);

  // panel が閉じる / アンマウントされるときはドラッグ状態と rAF を確実に後始末します。
  useEffect(() => {
    if (!isOpen) {
      dragActiveRef.current = false;
      draggingPaneRef.current = null;
      setDraggingKey(null);
      setDropIndex(null);
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    },
    [],
  );

  // 追加(FM-4): ヘッダーを掴んでパネルを移動します(hooks は早期 return より前・無条件で
  //   呼びます。layout=null のときはフック側が開始しません)。
  const { handleHeaderPointerDown } = usePanelHeaderDrag({
    layout,
    onPanelMove,
  });

  if (!isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    top: layout.top,
    left: layout.left,
    width: layout.width,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: パネル内 pointer 操作を grid 側へ伝播させません
    //       (列選択開始や outside click 判定との競合を避けます)。
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard を React ツリー上の parent へ流しません。
    //       Escape での close は controller の window keydown が担当します。
    // 変更(POP-KEY): capture 相(onKeyDownCapture)→ bubble 相(onKeyDown)へ変更します。
    //   capture 相の stopPropagation() はネイティブ伝播ごと止めるため、パネル内部要素の
    //   bubble 相 onKeyDown や window(bubble)リスナーまで殺してしまいます
    //   (ColumnFilterPopover の SF-ENTER fix と同一パターンの統一です)。bubble 相なら
    //   「内部要素のハンドラが先に処理 → 最後にここで外側への合成バブリングだけ遮断」に
    //   なり、Escape close は controller 側の capture 登録(POP-KEY)が受けます。
    event.stopPropagation();
  };

  const handleMasterClick = () => {
    if (!canToggle) {
      return;
    }
    // 全表示状態では何もしません(全消しは最後の 1 列ガードで不可のため)。
    if (!allVisible) {
      onShowAllColumns();
    }
  };

  // 追加(13-B3-1.5): ドラッグ中の列が属するペインです(インジケータをソース
  //   セクションにのみ出すために使います)。ドラッグは検索語が空のときのみなので
  //   draggingKey は必ず filteredItems(= items)内に存在します。
  const draggingPane: ColumnPane | null =
    draggingKey !== null
      ? (items.find((item) => item.key === draggingKey)?.pane ?? null)
      : null;

  // 追加(13-B3-1.5): 1 行分の描画です(セクションをまたいで再利用します)。
  //   indexInPane はそのセクション内での 0 始まり index で、ドロップ前線の判定に使います。
  const renderRow = (
    item: ColumnChooserItem,
    indexInPane: number,
    pane: ColumnPane,
  ) => {
    // 最後の 1 列ガード: 表示中が 1 列だけのとき、その列はチェックを外せません。
    const isOnlyVisible = item.visible && visibleCount === 1;
    const disabled = !canToggle || isOnlyVisible;
    const isDragging = draggingKey === item.key;
    // ドロップインジケータ: ソースペインのこの行の直前に挿入される位置のとき細線を出します。
    // 末尾(dropIndex === セクション件数)はセクション描画後に別途描画します。
    const showDropBefore =
      draggingKey !== null && draggingPane === pane && dropIndex === indexInPane;
    return (
      <div
        key={item.key}
        data-chooser-row=""
        data-chooser-pane={pane}
        className={cx(
          'ssg-chooser-row',
          showDropBefore && 'ssg-chooser-row--drop-before',
          isDragging && 'ssg-chooser-row--dragging',
        )}
      >
        {/* ⠿ ドラッグハンドル(13-B3-1) */}
        <span
          role="button"
          aria-label="ドラッグして並べ替え"
          data-ssg-tooltip={
            !canToggle
              ? 'onColumnsChange 未指定のため並べ替えできません'
              : query.trim() !== ''
                ? '検索中は並べ替えできません'
                : 'ドラッグして並べ替え(同じセクション内のみ)'
          }
          onPointerDown={(event) =>
            handleDragHandlePointerDown(item.key, pane, event)
          }
          onPointerMove={handleDragHandlePointerMove}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerCancel}
          className={cx(
            'ssg-chooser-handle',
            !canDrag && 'ssg-chooser-handle--disabled',
            isDragging && 'ssg-chooser-handle--dragging',
          )}
        >
          <DragHandleGlyph disabled={!canDrag} />
        </span>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }
            onToggleColumnVisibility(item.key, !item.visible);
          }}
          className="ssg-chooser-toggle"
        >
          <CheckBox
            state={item.visible ? 'checked' : 'unchecked'}
            disabled={disabled}
          />
          <span
            className={cx(
              'ssg-chooser-label',
              disabled && !item.visible && 'ssg-chooser-label--muted',
            )}
          >
            {item.title}
          </span>
        </button>
      </div>
    );
  };

  return createPortal(
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className="ssg-popover ssg-chooser-panel"
      style={wrapperStyle}
    >
      {/* ── ヘッダー: タイトル + × ── */}
      <div
        className="ssg-popover-header ssg-popover-header--draggable"
        onPointerDown={handleHeaderPointerDown}
      >
        <span className="ssg-popover-title">列の表示</span>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="閉じる"
          className="ssg-popover-close"
        >
          ×
        </button>
      </div>

      {/* ── 検索行: 全選択チェック + 検索入力 ── */}
      <div className="ssg-chooser-search-row">
        <button
          type="button"
          disabled={!canToggle}
          onClick={handleMasterClick}
          aria-label="すべての列を表示"
          data-ssg-tooltip="すべての列を表示"
          className="ssg-chooser-master-btn"
        >
          <CheckBox state={masterState} disabled={!canToggle} />
        </button>
        <div className="ssg-chooser-search-field">
          <span aria-hidden className="ssg-chooser-search-icon">
            ⌕
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="検索..."
            className="ssg-chooser-search-input"
          />
        </div>
      </div>

      {/* ── 列一覧(スクロール) ── */}
      <div ref={listRef} className="ssg-chooser-list">
        {filteredItems.length === 0 ? (
          <div className="ssg-chooser-empty">該当する列がありません</div>
        ) : (
          sections.map((section) => (
            <div key={section.pane} data-chooser-section={section.pane}>
              {showHeadings && (
                <div className="ssg-chooser-section-heading">
                  {SECTION_LABELS[section.pane]}
                </div>
              )}
              {section.items.map((item, indexInPane) =>
                renderRow(item, indexInPane, section.pane),
              )}
              {/* セクション末尾へのドロップインジケータ(13-B3-1.5) */}
              {draggingKey !== null &&
                draggingPane === section.pane &&
                dropIndex === section.items.length && (
                  <div className="ssg-chooser-drop-end" />
                )}
            </div>
          ))
        )}
      </div>

      {/* ── フッター: 列のリセット + (無効時)注記 ── */}
      <div className="ssg-chooser-footer">
        <button
          type="button"
          disabled={!canToggle}
          onClick={() => {
            if (!canToggle) {
              return;
            }
            onResetColumns();
          }}
          data-ssg-tooltip="すべての列の幅・固定・表示を初期状態に戻します"
          className="ssg-chooser-reset-btn"
        >
          すべての列を初期状態に戻す
        </button>

        {!canToggle && (
          <div className="ssg-chooser-note">
            onColumnsChange 未指定のため表示/非表示・リセットを変更できません
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default ColumnChooserPanel;