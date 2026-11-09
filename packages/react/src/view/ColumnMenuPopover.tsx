// 変更(13-A2): フラットな項目列挙 → AG Grid 同様のカスケード(サブメニュー)UI へ変更します。
//             ルートメニューには「列の固定 ›」を置き、hover / クリックで右隣に
//             サブメニュー(固定しない / 左に固定 / 右に固定)を開きます。
// 変更(13-B1): 13-A2 セッションの設計決定どおり、サブメニュー開閉状態を
//             isPinSubmenuOpen: boolean → openSubmenuKey: string | null へ一般化し、
//             ルート項目に「この列の幅を自動調整」「すべての列の幅を自動調整」を
//             追加します(AG Grid の Autosize This Column / Autosize All Columns 相当)。
//             サブメニューを持たないルート項目への hover で openSubmenuKey を null に
//             戻すことで、AG Grid の「別項目 hover でカスケードが閉じる」挙動になります。
// 変更(13-B2-1): ルート項目「列の表示」を追加します(AG Grid の Choose Columns 相当)。
//             サブメニューではなく別 popover(ColumnChooserPanel)を開くリーフ項目です。
// 追加(13-B2-3 / gpt5.5対応): ルート項目「列のリセット」を追加します。
//             既存の ColumnChooserPanel フッターと同じ reset 処理を呼び出し、列メニュー側からも
//             AG Grid の Reset Columns 相当を実行できるようにします。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { GridColumnPinned, GridSortDirection } from '../model/gridTypes';
import type { ColumnMenuLayout } from '../hooks/useColumnMenuController';
import type { GridResolvedSlots } from '../model/gridTypes';
import { usePortalTokens } from '../hooks/usePortalTokens';
import { useFeatureLocaleText } from '../hooks/useGridLocaleText';
import type { DEFAULT_COLUMN_MENU_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';

type ColumnMenuPinnedItem = {
  // 注記: undefined = 固定なし(中央スクロール領域)です。
  value: GridColumnPinned | undefined;
  // 変更(英語対応): 名前は文言(localeText)のキー。
  label: 'menuPinNone' | 'menuPinLeft' | 'menuPinRight';
};

// 変更(13-A2): 項目順を AG Grid の Pin Column サブメニュー
//             (No Pin / Pin Left / Pin Right)に合わせます。
const PINNED_ITEMS: ColumnMenuPinnedItem[] = [
  { value: undefined, label: 'menuPinNone' },
  { value: 'left', label: 'menuPinLeft' },
  { value: 'right', label: 'menuPinRight' },
];

// 追加(13-A2): サブメニューの幅と、ルートメニューとの水平間隔です。
//             左右どちらへ開くかの判定(viewport はみ出し)にも使います。
const SUBMENU_WIDTH = 180;
const SUBMENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

// 追加(13-B1): サブメニューを持つルート項目の識別キーです。
//             openSubmenuKey(string | null) との比較で開閉を判定します。
//             13-B 後続でサブメニュー持ち項目を増やす場合はキーを追加します。
const PIN_SUBMENU_KEY = 'pin';

type ColumnMenuPopoverProps = {
  isOpen: boolean;
  // 追加(TH-DK-2): ダークテーマ修飾子クラス('ssg-theme-dark' | 'ssg-theme-class' | undefined)。ポータルは
  //   .ssg-root 外のため、root と同じ修飾子を自身の root 要素へ直接付与します。
  themeClassName?: string;
  // 追加(slot-props): classNames 由来の解決済みスロット表(popover = パネル root / menuItem = 項目)。
  slots?: GridResolvedSlots;
  title: string;
  columnKey: string;
  // 追加(③): フィルターをメニューへ集約します。canFilter=false(enableColumnFilter=false や
  //          この列に filterType 未設定)のときは項目を出しません。クリックで列メニューを閉じて
  //          フィルター popover を開く配線は SpreadsheetGrid 側(onOpenFilter)が担います。
  canFilter: boolean;
  onOpenFilter: () => void;
  // 追加(13-B4): ソート(昇順/降順)をメニューから操作するための状態とハンドラです。
  //             canSort=false(enableSorting=false 相当)のときは項目自体を出しません
  //             (AG Grid の sortable:false でソート項目が消えるのと同じ挙動です)。
  //             sortDirection はこの列の現在のソート方向で、✓ 表示の単一ソースです。
  //             同じ方向を再選択したときの「解除」判定は SpreadsheetGrid 側が行います。
  canSort: boolean;
  sortDirection: GridSortDirection;
  onSortChange: (direction: Exclude<GridSortDirection, null>) => void;
  // 追加(MS-3-1): 並び替え管理パネル(SortManagementPanel)を開くハンドラです。
  //             canSort=true のときだけ、昇順/降順の下にリーフ項目として出します
  //             (サブメニューではなく別 popover を開く点は「列の表示」と同じ作法です)。
  //             クリックで列メニューを閉じてパネルを開く配線は SpreadsheetGrid 側が担います。
  // 変更(差し込み式 段階 3): ツールパネルの機能が無い構成では渡さず、項目を出しません(下の 2 つも同じ)。
  onOpenSortManager?: () => void;
  // 追加(FM-1): フィルター管理パネル(FilterManagementPanel)を開くハンドラです。
  //             canManageFilters はグリッドレベルの enableColumnFilter 相当です(canFilter と
  //             違い「この列に filterType があるか」は見ません — パネルは全列のフィルターを
  //             扱うためです)。canSort=false でも項目は出ます(並び替えブロックの直後)。
  //             クリックで列メニューを閉じてパネルを開く配線は SpreadsheetGrid 側が担います。
  canManageFilters: boolean;
  onOpenFilterManager?: () => void;
  // 追加: 開いている列の現在の固定状態です(✓ 表示に使います)。
  pinned: GridColumnPinned | undefined;
  // 追加: onColumnsChange 未指定時は false になり、固定切替の項目を無効化します
  //       (columns は controlled props のため、callback なしでは反映できません)。
  canChangePinned: boolean;
  layout: ColumnMenuLayout | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  onPinnedChange: (
    columnKey: string,
    pinned: GridColumnPinned | undefined,
  ) => void;
  // 追加(13-B1): 幅自動調整のハンドラです。幅は grid 内部 state(columnWidths)で
  //             管理されるため、pinned と違い onColumnsChange の有無に依存せず
  //             常に有効です(手動リサイズと同じ扱い)。
  // 変更(差し込み式 段階 2): 列幅の自動調整の機能が無い構成では渡さず、2 つの項目を出しません。
  onAutosizeColumn?: (columnKey: string) => void;
  onAutosizeAllColumns?: () => void;
  // 追加(13-B2-1): 列の表示/非表示パネル(ColumnChooserPanel)を開くハンドラです。
  //             この項目はサブメニューではなく別 popover を開くリーフ項目です
  //             (クリックで列メニューを閉じてパネルを開きます。配線は SpreadsheetGrid 側)。
  onOpenColumnChooser?: () => void;
  // 追加(13-B2-3 / gpt5.5対応): 列メニュー root の「列のリセット」用です。
  //             columns は controlled props のため、onColumnsChange 未指定時は無効化します。
  canResetColumns: boolean;
  onResetColumns: () => void;
  // 追加(段階 2 DU-24): 「この列でグループ化」/「グループ化を外す」(グループ化の入口を出す条件はシェルが決め、出さないときは渡さない)。
  onGroupByColumn?: () => void;
  onUngroup?: () => void;
  onRequestClose: () => void;
};

export function ColumnMenuPopover({
  isOpen,
  themeClassName,
  slots,
  title,
  columnKey,
  canFilter,
  onOpenFilter,
  canSort,
  sortDirection,
  onSortChange,
  onOpenSortManager,
  canManageFilters,
  onOpenFilterManager,
  pinned,
  canChangePinned,
  layout,
  popoverRef,
  onPinnedChange,
  onAutosizeColumn,
  onAutosizeAllColumns,
  onOpenColumnChooser,
  canResetColumns,
  onResetColumns,
  onGroupByColumn,
  onUngroup,
  onRequestClose,
}: ColumnMenuPopoverProps) {
  // 追加(英語対応): 文言(localeText)。
  const texts = useFeatureLocaleText<typeof DEFAULT_COLUMN_MENU_LOCALE_TEXT>();
  // 変更(13-B1): isPinSubmenuOpen: boolean → openSubmenuKey: string | null へ一般化します
  //             (13-A2 セッションの設計決定どおり)。
  //   - サブメニューを持つルート項目: onPointerEnter で setOpenSubmenuKey(自分の key)
  //   - サブメニューを持たないルート項目: onPointerEnter で setOpenSubmenuKey(null)
  //     (= 開いているカスケードが閉じる。AG Grid の挙動の肝)
  // 注記: AG Grid と同様、一度開いたサブメニューはポインタが離れても開いたままにし、
  //       別のルート項目へ hover したとき・メニュー自体が閉じたときに閉じます。
  //       チラつき防止のため pointerleave では閉じません。
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null);

  // 追加(13-A2): 開いたまま別列へ切り替えた場合(popover は mount されたまま
  //             columnKey だけ変わる)に、サブメニューの開閉状態を初期化します。
  // 変更(13-B1): リセット先を openSubmenuKey = null に読み替えます。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop(columnKey / isOpen)変更時のサブメニュー状態リセットです。render 中調整パターンへの書き換えは可能ですが、動作実績を優先して現状維持しています(React Compiler 導入時に再検討)。
    setOpenSubmenuKey(null);
  }, [columnKey, isOpen]);
  // 追加(DevBI の報告): 表で決まったトークン(--ssg-*)をメニューへ写します(body 直下のため継承で届かない)。
  usePortalTokens(popoverRef, isOpen && layout !== null, themeClassName);
  // 列の固定のサブメニューも同じトークンの既定値を持つ要素(.ssg-menu-panel)なので、外側のメニューからは継承されません。
  const pinSubmenuRef = useRef<HTMLDivElement>(null);
  usePortalTokens(pinSubmenuRef, isOpen && layout !== null && openSubmenuKey === PIN_SUBMENU_KEY, themeClassName);
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-31): キーボード(→ / Enter / Space)で開いたときは小メニューの先頭の項目へ
  //   フォーカスを移します(開いた後の描画で)。← で閉じて「列の固定」へ戻ります。
  const pinButtonRef = useRef<HTMLButtonElement>(null);
  const focusPinSubmenuOnOpen = useRef(false);
  const focusFirstPinItem = () => {
    pinSubmenuRef.current?.querySelector<HTMLElement>('.ssg-menu-item:not(:disabled)')?.focus();
  };
  useEffect(() => {
    if (openSubmenuKey !== PIN_SUBMENU_KEY || !focusPinSubmenuOnOpen.current) {
      return;
    }
    focusPinSubmenuOnOpen.current = false;
    focusFirstPinItem();
  }, [openSubmenuKey]);

  if (!isOpen || !layout) {
    return null;
  }

  const isPinSubmenuOpen = openSubmenuKey === PIN_SUBMENU_KEY;

  // 追加(13-A2): サブメニューを右に開くと viewport をはみ出す場合は左へ開きます
  //             (AG Grid と同じフリップ挙動です)。layout はルートメニューの
  //             fixed 座標なので、右端 = layout.left + layout.width です。
  const submenuOpensLeft =
    layout.left + layout.width + SUBMENU_GAP + SUBMENU_WIDTH >
    window.innerWidth - VIEWPORT_MARGIN;
  // 追加(英語対応の確かめ直し): 左へ開いても画面の左端からはみ出す(スマートフォンの幅など)ときは、画面の中に収まる位置で
  //   ルートメニューに重ねます(これまでは左へはみ出し、「左に固定」などの ✓ が見えなかった)。基準の行の左端は
  //   ルートメニューの左端 + パネルの padding(8) + border(1)。
  const submenuOverlapLeft =
    submenuOpensLeft && layout.left - SUBMENU_GAP - SUBMENU_WIDTH < VIEWPORT_MARGIN
      ? Math.max(VIEWPORT_MARGIN, Math.min(window.innerWidth - VIEWPORT_MARGIN - SUBMENU_WIDTH, layout.left - SUBMENU_GAP - SUBMENU_WIDTH)) -
        (layout.left + 9)
      : undefined;

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    width: layout.width,
    zIndex: 1000,
    // 追加(touch): viewport に収まらないときだけパネル内スクロールにします(通常は未指定)。
    ...(layout.maxHeight !== undefined
      ? { maxHeight: layout.maxHeight, overflowY: 'auto' as const }
      : {}),
  };

  // 追加(13-A2): サブメニューはルート項目(position: relative の行)を基準に
  //             絶対配置します。top: -9 はパネルの padding(8) + border(1) ぶんを
  //             相殺し、サブメニューの先頭項目をルート項目と上端揃えにするためです。
  const submenuStyle: CSSProperties = {
    position: 'absolute',
    top: -9,
    ...(submenuOverlapLeft !== undefined
      ? { left: submenuOverlapLeft }
      : submenuOpensLeft
        ? { right: `calc(100% + ${SUBMENU_GAP}px)` }
        : { left: `calc(100% + ${SUBMENU_GAP}px)` }),
    width: SUBMENU_WIDTH,
    zIndex: 1,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: popover 内 pointer 操作を grid 側へ伝播させません
    //       (列選択開始や outside click 判定との競合を避けます)。
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard イベントを React ツリー上の parent へ流しません。
    //       Escape での close は controller の window keydown リスナーが担当します。
    // 変更(POP-KEY): capture 相(onKeyDownCapture)→ bubble 相(onKeyDown)へ変更します。
    //   capture 相の stopPropagation() はネイティブ伝播ごと止めるため、パネル内部要素の
    //   bubble 相 onKeyDown や window(bubble)リスナーまで殺してしまいます
    //   (ColumnFilterPopover の SF-ENTER fix と同一パターンの統一です)。bubble 相なら
    //   「内部要素のハンドラが先に処理 → 最後にここで外側への合成バブリングだけ遮断」に
    //   なり、Escape close は controller 側の capture 登録(POP-KEY)が受けます。
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={popoverRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        // 追加: メニュー上での右クリックはブラウザ標準メニューを出しません。
        event.preventDefault();
      }}
      className={cx('ssg-menu-panel', themeClassName, slots?.popover?.className)}
      style={{ ...slots?.popover?.style, ...wrapperStyle }}
    >
      <div className="ssg-menu-title">{title}</div>

      {/* ── ルート項目: フィルター…(③) ── */}
      {/* 追加(③): ヘッダーの常時フィルターボタンを廃止し、フィルター操作をここへ集約します。
          サブメニューではなく別 popover(フィルター)を開くリーフ項目です。autosize / 列の表示と
          同じく hover で setOpenSubmenuKey(null) し、開いているカスケード(列の固定)を閉じます。
          ✓ 列ぶんのスペーサで他項目と左端を揃えます。クリックで列メニューを閉じてフィルター
          popover を開く処理は SpreadsheetGrid 側(onOpenFilter)が担います。canFilter=false の
          ときは項目を出しません(enableColumnFilter=false / この列に filterType 未設定)。 */}
      {canFilter && (
        <>
          <button
            type="button"
            onPointerEnter={() => {
              setOpenSubmenuKey(null);
            }}
            onClick={() => {
              onOpenFilter();
            }}
            className={cx('ssg-menu-item', slots?.menuItem?.className)}
            style={slots?.menuItem?.style}
          >
            <span className="ssg-menu-icon" />
            <span className="ssg-menu-label">{texts.menuFilter}</span>
          </button>

          <div className="ssg-menu-separator" />
        </>
      )}

      {/* ── ルート項目: 昇順 / 降順で並び替え(13-B4) ── */}
      {/* 追加(13-B4): ヘッダーのソートボタンを廃止し、ソート操作をメニュー(と
          コンテキストメニュー)へ集約します。AG Grid の Sort Ascending /
          Sort Descending 相当のリーフ項目です。現在の方向に ✓ を出し、その方向を
          もう一度選ぶと解除します(解除判定は SpreadsheetGrid 側)。
          サブメニューを持たないリーフなので、hover で openSubmenuKey を null に戻し、
          開いているカスケード(列の固定)を閉じます。hover ハイライトは CSS :hover で
          行います(state hover を避け、memo 影響を出しません)。 */}
      {canSort && (
        <>
          <button
            type="button"
            onPointerEnter={() => {
              setOpenSubmenuKey(null);
            }}
            onClick={() => {
              onSortChange('asc');
            }}
            className={cx('ssg-menu-item', slots?.menuItem?.className)}
            style={slots?.menuItem?.style}
          >
            {/* 注記: 14px 列は他項目の ✓ 列と左端を揃えます。
                未適用時は方向アイコン(↑/↓)を、適用中は ✓ を出します。
                ラベル自体が方向を示すため、適用中にアイコンが ✓ へ変わっても
                意味は失われません。 */}
            <span
              className={cx(
                'ssg-menu-sort-icon',
                sortDirection === 'asc' && 'ssg-menu-sort-icon--active',
              )}
            >
              {sortDirection === 'asc' ? '✓' : '↑'}
            </span>
            <span
              className={cx(
                'ssg-menu-label',
                sortDirection === 'asc' && 'ssg-menu-label--sorted',
              )}
            >
              {texts.menuSortAscending}
            </span>
          </button>

          <button
            type="button"
            onPointerEnter={() => {
              setOpenSubmenuKey(null);
            }}
            onClick={() => {
              onSortChange('desc');
            }}
            className={cx('ssg-menu-item', slots?.menuItem?.className)}
            style={slots?.menuItem?.style}
          >
            <span
              className={cx(
                'ssg-menu-sort-icon',
                sortDirection === 'desc' && 'ssg-menu-sort-icon--active',
              )}
            >
              {sortDirection === 'desc' ? '✓' : '↓'}
            </span>
            <span
              className={cx(
                'ssg-menu-label',
                sortDirection === 'desc' && 'ssg-menu-label--sorted',
              )}
            >
              {texts.menuSortDescending}
            </span>
          </button>

          {/* ── ルート項目: 並び替えを管理…(MS-3-1) ── */}
          {/* 追加(MS-3-1): サブメニューではなく別 popover(SortManagementPanel)を開く
              リーフ項目です。昇順/降順の単発操作に対し、複数レベルの追加/削除・優先順位の
              編集をマウス/タッチで行う経路を提供します(Shift+click ジェスチャに依りません)。
              autosize / 列の表示と同じく hover で setOpenSubmenuKey(null) し、開いている
              カスケード(列の固定)を閉じます。✓ 列ぶんのスペーサで他項目と左端を揃えます。
              クリックで列メニューを閉じてパネルを開く処理は SpreadsheetGrid 側
              (onOpenSortManager)が担います。 */}
          {onOpenSortManager && (
            <button
              type="button"
              onPointerEnter={() => {
                setOpenSubmenuKey(null);
              }}
              onClick={() => {
                onOpenSortManager();
              }}
              className={cx('ssg-menu-item', slots?.menuItem?.className)}
              style={slots?.menuItem?.style}
            >
              <span className="ssg-menu-icon" />
              <span className="ssg-menu-label">{texts.menuManageSort}</span>
            </button>
          )}
        </>
      )}

      {/* ── ルート項目: フィルターを管理…(FM-1) ── */}
      {/* 追加(FM-1): 適用中フィルターの一覧 / 編集 / クリアを行うパネル
          (FilterManagementPanel)を開くリーフ項目です。gate はグリッドレベルの
          canManageFilters(enableColumnFilter 相当)で、canFilter(この列の filterType
          有無)には依りません(パネルは全列のフィルターを扱うため)。位置は
          「並び替えを管理…」の直後(canSort=false のときはソート群を飛ばしてここから)。
          hover で開いているカスケード(列の固定)を閉じ、✓ 列ぶんのスペーサで左端を
          揃えます。クリックで列メニューを閉じてパネルを開く処理は SpreadsheetGrid 側
          (onOpenFilterManager)が担います。 */}
      {canManageFilters && onOpenFilterManager && (
        <button
          type="button"
          onPointerEnter={() => {
            setOpenSubmenuKey(null);
          }}
          onClick={() => {
            onOpenFilterManager();
          }}
          className={cx('ssg-menu-item', slots?.menuItem?.className)}
            style={slots?.menuItem?.style}
        >
          <span className="ssg-menu-icon" />
          <span className="ssg-menu-label">{texts.menuManageFilters}</span>
        </button>
      )}

      {/* 変更(FM-1): 区切り(旧 13-B4)の条件を「ソート群のみ」→「ソート群または
          フィルターを管理…のいずれかが出ているとき」へ広げます(位置は不変)。 */}
      {/* 変更(差し込み式 段階 3): フィルターを管理…を出さない構成(ツールパネルの機能なし)では、その分を数えません。 */}
      {(canSort || (canManageFilters && onOpenFilterManager !== undefined)) && <div className="ssg-menu-separator" />}

      {/* ── ルート項目: この列でグループ化 / グループ化を外す(段階 2 DU-24) ── */}
      {onGroupByColumn && (
        <button
          type="button"
          onPointerEnter={() => {
            setOpenSubmenuKey(null);
          }}
          onClick={() => {
            onGroupByColumn();
          }}
          className={cx('ssg-menu-item', slots?.menuItem?.className)}
          style={slots?.menuItem?.style}
        >
          <span className="ssg-menu-icon" />
          <span className="ssg-menu-label">{texts.menuGroupBy}</span>
        </button>
      )}
      {onUngroup && (
        <button
          type="button"
          onPointerEnter={() => {
            setOpenSubmenuKey(null);
          }}
          onClick={() => {
            onUngroup();
          }}
          className={cx('ssg-menu-item', slots?.menuItem?.className)}
          style={slots?.menuItem?.style}
        >
          <span className="ssg-menu-icon" />
          <span className="ssg-menu-label">{texts.menuUngroup}</span>
        </button>
      )}
      {(onGroupByColumn || onUngroup) && <div className="ssg-menu-separator" />}

      {/* ── ルート項目: 列の固定 ›(サブメニュー親) ── */}
      {/* 追加(13-A2): サブメニューはこの行(position: relative)基準で絶対配置します。
          パネル自体は overflow を持たないため、wrapper の外側(右隣 / 左隣)へ
          はみ出して表示されます。popoverRef(wrapper)の子孫なので、controller の
          outside-pointerdown 判定(contains)にもそのまま含まれます。 */}
      <div className="ssg-menu-submenu-anchor">
        <button
          ref={pinButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isPinSubmenuOpen}
          onPointerEnter={(event) => {
            // 変更(13-B1): AG Grid と同様、hover でこの項目のサブメニューを開きます
            //             (他のサブメニューが開いていれば置き換わります)。
            // 変更(1.0.1 / AP-31): マウスのときだけ。タッチでは押すと pointerenter が先に来て開き、続く click の
            //   トグルで閉じていた(iPad)。スマホでは開いた小メニューが指の下に重なり、click がその項目を選んでいた。
            if (event.pointerType === 'mouse') {
              setOpenSubmenuKey(PIN_SUBMENU_KEY);
            }
          }}
          onClick={(event) => {
            // 変更(13-B1): クリックでも開けるようにします(タッチ環境向け)。
            // 変更(1.0.1 / AP-31): トグルではなく開くだけにしました(マウスではホバーで開いた後のクリックで閉じ、紛らわしかった)。
            //   閉じるのは別の項目へのホバー・← ・メニューを閉じたとき。キーボード(Enter / Space = detail 0)では先頭の項目へ。
            if (event.detail === 0) {
              if (isPinSubmenuOpen) {
                focusFirstPinItem();
              } else {
                focusPinSubmenuOnOpen.current = true;
              }
            }
            setOpenSubmenuKey(PIN_SUBMENU_KEY);
          }}
          onKeyDown={(event) => {
            // 追加(1.0.1 / AP-31): → で小メニューを開いて先頭の項目へ。
            if (event.key !== 'ArrowRight') {
              return;
            }
            event.preventDefault();
            if (isPinSubmenuOpen) {
              focusFirstPinItem();
            } else {
              focusPinSubmenuOnOpen.current = true;
              setOpenSubmenuKey(PIN_SUBMENU_KEY);
            }
          }}
          className={cx(
            'ssg-menu-item',
            isPinSubmenuOpen && 'ssg-menu-item--active',
            slots?.menuItem?.className,
          )}
          style={slots?.menuItem?.style}
        >
          {/* 注記: ✓ 列との左端揃えのため、サブメニュー項目と同じ幅のスペーサを置きます。*/}
          <span className="ssg-menu-icon" />
          <span className="ssg-menu-label">{texts.menuPin}</span>
          <span className="ssg-menu-caret">›</span>
        </button>

        {/* ── サブメニュー: 固定しない / 左に固定 / 右に固定 ── */}
        {isPinSubmenuOpen && (
          <div
            ref={pinSubmenuRef}
            className={cx(
              'ssg-menu-panel',
              themeClassName,
              slots?.popover?.className,
            )}
            style={{ ...slots?.popover?.style, ...submenuStyle }}
            onKeyDown={(event) => {
              // 追加(1.0.1 / AP-31): ← で小メニューを閉じて「列の固定」へ戻ります。
              if (event.key !== 'ArrowLeft') {
                return;
              }
              event.preventDefault();
              setOpenSubmenuKey(null);
              pinButtonRef.current?.focus();
            }}
          >
            {PINNED_ITEMS.map((item) => {
              const isSelected = pinned === item.value;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!canChangePinned}
                  onClick={() => {
                    if (!canChangePinned) {
                      return;
                    }
                    // 注記: 現在値と同じ項目を選んでも閉じるだけになります
                    //       (no-op 判定は SpreadsheetGrid 側で行います)。
                    onPinnedChange(columnKey, item.value);
                  }}
                  className={cx('ssg-menu-item', slots?.menuItem?.className)}
            style={slots?.menuItem?.style}
                >
                  {/* 追加: 現在の固定状態に ✓ を出します(未選択は幅だけ確保して揃えます)。*/}
                  <span
                    className={cx(
                      'ssg-menu-check',
                      !isSelected && 'ssg-menu-check--hidden',
                    )}
                  >
                    ✓
                  </span>
                  <span className="ssg-menu-label">{texts[item.label]}</span>
                </button>
              );
            })}

            {!canChangePinned && (
              <div className="ssg-menu-note">{texts.menuPinUnavailable}</div>
            )}
          </div>
        )}
      </div>

      {/* ── ルート項目: 幅の自動調整(13-B1) ── */}
      {/* 追加(13-B1): サブメニューを持たないルート項目です。hover で
          setOpenSubmenuKey(null) し、開いているカスケード(列の固定)を閉じます
          (AG Grid の「別項目 hover でサブメニューが閉じる」挙動)。
          hover ハイライトは CSS :hover で行います(state を使うと hover のたびに
          popover 全体が再レンダーされるため)。
          実際の close と幅反映は SpreadsheetGrid 側ハンドラが行います。 */}
      {onAutosizeColumn && onAutosizeAllColumns && (
        <>
          <button
            type="button"
            onPointerEnter={() => {
              setOpenSubmenuKey(null);
            }}
            onClick={() => {
              onAutosizeColumn(columnKey);
            }}
            className={cx('ssg-menu-item', slots?.menuItem?.className)}
                style={slots?.menuItem?.style}
          >
            {/* 注記: ✓ 列との左端揃え用スペーサです(ピン行と同じ幅)。*/}
            <span className="ssg-menu-icon" />
            <span className="ssg-menu-label">{texts.menuAutosize}</span>
          </button>

          <button
            type="button"
            onPointerEnter={() => {
              setOpenSubmenuKey(null);
            }}
            onClick={() => {
              onAutosizeAllColumns();
            }}
            className={cx('ssg-menu-item', slots?.menuItem?.className)}
                style={slots?.menuItem?.style}
          >
            <span className="ssg-menu-icon" />
            <span className="ssg-menu-label">{texts.menuAutosizeAll}</span>
          </button>
        </>
      )}

      {/* ── ルート項目: 列の表示(13-B2-1) ── */}
      {/* 追加(13-B2-1): サブメニューではなく別 popover(ColumnChooserPanel)を開く
          リーフ項目です。autosize 項目と同じく hover で setOpenSubmenuKey(null) し、
          開いているカスケード(列の固定)を閉じます。クリックで列メニューを閉じて
          パネルを開く処理は SpreadsheetGrid 側(onOpenColumnChooser)が担います。 */}
      {onOpenColumnChooser && (
        <button
          type="button"
          onPointerEnter={() => {
            setOpenSubmenuKey(null);
          }}
          onClick={() => {
            onOpenColumnChooser();
          }}
          className={cx('ssg-menu-item', slots?.menuItem?.className)}
          style={slots?.menuItem?.style}
        >
          <span className="ssg-menu-icon" />
          <span className="ssg-menu-label">{texts.menuColumns}</span>
        </button>
      )}

      {/* ── ルート項目: 列のリセット(13-B2-3 / gpt5.5対応) ── */}
      {/* 追加(13-B2-3 / gpt5.5対応): 既存の ColumnChooserPanel フッターと同じ
          リセット処理を列メニュー root からも呼べるようにします。サブメニューではない
          リーフ項目なので、hover 時は openSubmenuKey を null に戻します。 */}
      <button
        type="button"
        aria-disabled={!canResetColumns}
        tabIndex={canResetColumns ? 0 : -1}
        data-ssg-tooltip={
          canResetColumns
            ? texts.resetColumnsHint
            : texts.menuResetUnavailable
        }
        onPointerEnter={() => {
          setOpenSubmenuKey(null);
        }}
        onClick={() => {
          if (!canResetColumns) {
            return;
          }
          onResetColumns();
        }}
        // 修正(audit V-15): 他の項目と同じく menuItem スロット(classNames.menuItem 等)を適用します。
        className={cx(
          'ssg-menu-item',
          !canResetColumns && 'ssg-menu-item--disabled',
          slots?.menuItem?.className,
        )}
        style={slots?.menuItem?.style}
      >
        <span className="ssg-menu-icon" />
        <span className="ssg-menu-label">{texts.menuResetColumns}</span>
      </button>

      <div className="ssg-menu-footer">
        <button
          type="button"
          onClick={onRequestClose}
          className="ssg-menu-close-btn"
        >
          {texts.close}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default ColumnMenuPopover;