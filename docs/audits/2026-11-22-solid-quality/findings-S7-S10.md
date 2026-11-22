# 1-6 後半の実アプリの所見(S7・S10)

2026-11-22。0.1.0 の HEAD(7749665)を pack した tarball で作った(S4-21 の直しの前)。`S7/` などは作業した時のスクラッチ(`dogfood-q`)の下。アプリのソースは `audit/dogfood/2026-11-22-solid-quality/`。以下は担当の報告のまま。

# S7 と S10 の報告

使ったサーバーとブラウザはすべて PID で止めました。5507 と 5510 は空いており、S7 / S10 から起動したブラウザも残っていません。動いている chromium は別の作業(S12)のものなので触っていません。

---

## S7. タスク管理(Solid 2.0 の非同期と遷移)

### 1. 作ったもの
- **構成**:
  - Vite 8.3.8 + @solidjs/vite-plugin 3.0.1 + solid-js / @solidjs/web 2.0.3 + @solidjs/router 2.0.1 + TypeScript 6.0.3、npm。
  - tarball はグリッドの Solid 版 0.1.0(core 1.2.1)。
  - 比べる React 版は React 19.3.1 + @ishibashi0112/spreadsheet-grid 1.2.1 + Vite 7.3.8(`S7/react/`)。
- **画面**: プロジェクトは web 60 件 / app 400 件 / infra 3000 件。ルートは次の 4 つ。
  - `/`
  - `/projects/:id`(タブ「タスク」「マイルストーン」)
  - `/projects/:id/report`
  - `/members`(readOnly の表)
- **擬似 API**: `S7/src/api.ts`。遅延は 200〜1,500ms で、ときどき失敗します。クエリと `window.__api` で失敗率と次の 1 回の失敗を決められます。
- **書き方の切り替え**: 画面上部で次を切り替え、読み直して試せます。
  - 読み方: `createMemo(async)` / `createDeferred`
  - action を始める場所: 通知の中 / `onFlush` / `setTimeout`
  - `<Loading on>` の有無、`<Switch>` / `<Show>`、fillHandle の有無
- **使った機能**:
  - 列: 先頭固定の text、select(担当、優先度と状態は chips)、date(dateSet)、number(min / max / step、aggFunc sum)、複数行 text(flex)
  - `totalRow`、`fillHandle`、`enableContextMenu` + `getContextMenuItems`(「完了にする」「担当を外す」)
  - `initialState` / `onStateChange` / `applyState` を URL のクエリ(s / f / q)と同期、`downloadCsv`
- **保存**: `action(function*)` + `createOptimistic`(rows と「保存中」)+ `refresh`。
- **マイルストーン**: `createSignal(() => server())` の書き込める派生 signal で持ち、裏で保存します。

### 2. 確かめた操作
特に書いていないものは dev で確かめました。多くは本番でも回しました。

- **既知 S4-21 と同じ**: 通知の中で action を始める形(direct)で、保存の約 2 秒の間エディタが残って画面が止まりました。止まっている間に押した ArrowDown は、後から効かずに消えました(KNOWN の「後でまとめて効く」とは少し違います)。以下の確認は `onFlush` / `setTimeout` で始める形で行いました。
- **既知 S5-21 と同じ**: memo の形でプロジェクトを切り替えると、取り直しの間は右クリックメニューが開かず、URL の変化もデータが届くまで保留されました。`createDeferred` では URL がすぐ変わり、メニューも開き、`isPending` の印も出ました。
- **保存で問題が無かったもの**:
  - 成功、失敗したときの元への戻り、続けて 2 回の保存(fillHandle なし)
  - 3 行の貼り付け、保存中の Ctrl+Z
  - 右クリックの「完了にする」
- **URL との同期**:
  - 並び / グローバル検索 / 列フィルターが戻る / 進むで追従しました。列フィルターのポップオーバーを開いたままでもチェックが変わりました。
  - 読み直しでは `initialState` から戻り、プロジェクトを切り替えてもクエリが残りました。
  - README の「Saving the state in the URL」のとおりに書いて動きました。
- **タブ**(`<Switch>` / `<Show>` の両方):
  - 列メニューを開いたまま切り替える、マイルストーンの編集と元に戻す / やり直す、編集中の切り替え、10 回の連続切り替えで問題なし。ポータルも残りませんでした。
- **ルートの切り替え**:
  - 編集中 / 保存中 / 列フィルターを開いたまま / 右クリックメニューを開いたまま / select エディタを開いたままで切り替えても、ポータルは片付きました。
  - 編集中にリンクを押したときはフォーカスアウトで確定し、キー操作だけで外れたときは打ちかけを捨てました。どちらもドキュメントのとおりです。
- **`<Errored>`**: 最初の読み込みとプロジェクトの切り替えのどちらの失敗でも fallback と再試行が動きました。
- **その他**: `<Loading on>` の fallback へ替わるときのポップアップ(閉じて片付く)、フィルハンドルのドラッグ、CSV、日本語の打ち始め。

### 4. 所見

**S7-01 高 / 不具合 / Solid だけ / 回帰か: 不明(前の点検にこの組み合わせが無い)**
- **題名**: `fillHandle` のある表で、rows を `createOptimistic` で持ち action の中で書き換えると、保存中に編集を始めた時点で例外が出て、表(境界が無ければアプリ全体)が止まる。
- **条件**: S4-21 の回避の形(action を `setTimeout` / `onFlush` で通知の外で始める)で起きます。
- **最小再現**: `S7/min/fill-action.tsx`(`S7/min-fill-action.html`)と、台本 `S7/e2e/min-fill-action.cjs`。
  - 書き方: `const [rows, setRows] = createOptimistic(() => saved())`、`save = action(function* (next) { setRows(next); yield wait(2000); setSaved(next) })`、`onRowsChange={(next) => setTimeout(() => save(next))}`、`fillHandle`。
  - 手順: セルを押して「A」を打ち Enter(保存が始まる)→ 2 秒以内に次のセルで「B」を打つ(F2 やダブルクリックでも同じ)→ Enter。
- **期待**: B のエディタにフォーカスが入り、Enter で確定する。
- **実際(境界なし)**:
  - pageerror `Attempting to access a stale value from <Show> that could possibly be undefined…`(本番は `Stale read from <Show>.`)。
  - 出どころは `FillHandleLayer › <Show15> › value › div.style:left, div.style:top`。
  - 続けて `[REACTIVITY_HALTED] An uncaught error halted the reactive system.` が出て、アプリ全体が更新されなくなります。
- **実際(`<Errored>` で包む = S7 のアプリの形、`?errored=1`)**:
  - 何もログに出ません。エディタに B は見えますが、フォーカスは BODY にあります。
  - Enter / Esc は効かず、ほかのセルを押すとアクティブセルは動くものの編集は始まりません。
  - 戻すには、残ったエディタの input を押して Enter するしかありません。
- **起きない条件**: `?fh=0`(fillHandle なし)では起きません。action が rows ではなく無関係の optimistic な値だけを書くときも起きません。
- **React 版**: 1.2.1 で `useOptimistic` + `startTransition` にすると、通知の中で始めても `setTimeout` で始めても起きません(`S7/react/src/fill-action.tsx`)。
- **証拠**:
  - `S7/e2e/shots/min-fill-during.png`、`min-fill-after.png`
  - 実アプリ: `S7/e2e/stuck.cjs`、`S7/e2e/debug1.cjs`、`S7/e2e/shots/stuck-during.png`、`stuck-after.png`
- **dev / 本番**: 両方。**確度**: 確実。

**S7-02 低 / 不具合 / Solid だけ / 回帰か: 不明**
- **題名**: rows の `createMemo(async)` が、グリッドを描いている間に失敗すると、同じエラーが dev で 13 回、本番で 12 回 console.error に出る。
- **再現**: memo の形で、次の読み込みを失敗させてプロジェクトを切り替えます(`S7/e2e/errored.cjs`、`errored-detail.cjs`、`errored-detail2.cjs`)。
- **期待**: 1 回(または `<Errored>` が受けて 0 回)。
- **実際**: `<Errored>` の fallback と再試行は正しく出ますが、エラーは 12〜13 回出ます。Solid の `runEffect` が、`error` の処理を持たない effect ごとに出しているようで、グリッドの中の effect の数だけ出ます。`createDeferred` では 0 回でした。
- **証拠**: `S7/e2e/shots/errored-memo.png`。**dev / 本番**: 両方。**確度**: 確実(回数は実測)。

**S7-03 低 / 不具合 / React 版も同じ / 回帰か: 不明**
- **題名**: 編集中に rows がすべて別のキーの行に替わると、エディタが知らせなく消えて打ちかけが失われ、フォーカスが BODY に落ちてキー操作が効かなくなる(押すまで戻らない)。
- **再現**: `S7/min/rows-replace.tsx` の `window.__swap()` と台本 `S7/e2e/rows-replace.cjs`。実アプリでは `createDeferred` の形で、編集中にプロジェクトが切り替わったとき(`S7/e2e/switch-edit.cjs`、`shots/switch-edit-during.png`)。
- **期待**: 確定または取り消しのどちらかがはっきり起き、フォーカスはグリッドに残る。
- **実際**: 上のとおり。React 版 1.2.1 も同じ結果でした(`S7/react/src/rows-replace.tsx`)。
- **dev / 本番**: Solid は本番、React は dev で確かめました。**確度**: 確実。

**S7-04 低 / ドキュメント / Solid だけ(React 版では確かめていない)/ 回帰ではない**
- **題名**: Solid の非同期の rows(`createMemo(async)` / `createDeferred` / `<Loading>` / `action` + `createOptimistic`)の書き方の案内が無く、次の落とし穴に自分で気づくしかない。
  - (a) `<Loading on={projectId}>` + memo の形で、編集中に別のプロジェクトへ移ると、グリッドの DOM が fallback で外れてフォーカスアウトの確定が起きます。このとき `onRowsChange` には前のプロジェクトの行が渡りますが、params はもう新しいプロジェクトです。私のアプリは web-3 の編集を app の DB へ保存しました。Solid は `[OPTIMISTIC_WRITE_WHILE_LOADING]` を出します(`S7/e2e/loadingon-popup.cjs`、`shots/loadingon-edit-*.png`)。
  - (b) `createDeferred` の形では、`props.projectId` が rows より先に変わります。保存先を props から取ると (a) と同じ食い違いが起こりえます。
  - (c) action → `refresh` で保存した行が取り直されるたびに、「外からの差し替え」として元に戻すの履歴が消えます。保存が終わった後の Ctrl+Z は何もしません(保存中の Ctrl+Z は効きます)。一般の規則はドキュメントにありますが、Solid の標準の書き方で毎回当たることは書かれていません。
- **dev / 本番**: dev。**確度**: 確実。

### 5. Solid の利用者として
- Solid のページに次の書き方の例が欲しいです。
  - `<Loading>` / `<Errored>` / `isPending` と rows
  - 保存の `action` + `createOptimistic` を通知のどこで始めるか(S4-21 の回避)
  - 保存先のキーを行から取ること
  - 保存の後の履歴の扱い
- URL との同期の節は書いてあるとおりに書けて、戻る / 進むも動きました。
- `enableContextMenu` だけでは項目が出ず、`getContextMenuItems` が要ることに少し迷いました。

### 6. 要望
- S7-01 / S4-21 が直ったら、`action` + `createOptimistic` の保存の正しい形を、Solid の README と例に載せてほしいです。

---

## S10. 受注と明細(2 つのグリッドの連動)

### 1. 作ったもの
- **構成**:
  - Vite 8.3.8 + solid-js 2.0.3 + TypeScript 6.0.3、npm、同じ tarball。英語(`localeTextEn`)。
  - 比べる React 版は同じコードを移したもの(React 19.3.1 + 1.2.1、`S10/react/`)。
- **データ**: 受注 2,000 件、明細は 1 件あたり 1〜30 行。
- **上の表 Orders**:
  - 列: 固定の code、customer、date、select + chips の status、qty / amount(aggFunc sum)、note
  - `totalRow`
  - `onActiveCellChange` で signal `activeId` を書く
- **下の表 Lines**:
  - 列: select の product、date、status、number の qty(integer, min 1)、unitPrice、`getValue` の amount、note(flex)
  - `totalRow`、`fillHandle`、`theme` はチェックボックスでダーク
- **2 つのハンドル**: 同じ部品で持ちます。
  - `top.applyRows(fn, { undoable: false })` で上の合計を書きます。
  - F6 と「Go to lines」ボタンで `focus()`、それぞれの `downloadCsv`。
- **クエリで切り替える形**:
  - `totals=applyRows|signal|getValue|getValueMemo`
  - `bottom=swap|remount`(注文ごとに作り直し、`getState` → `initialState` + `restoreColumnsFromState` で見え方を引き継ぐ)
  - `link=1`(列の幅は `onStateChange` → `applyState({ columnWidths })`、並びは `onColumnsChange` → `applyState({ columns })`)
  - `guard=0`(並びが同じときの守りを外す)

### 2. 確かめた操作
dev と本番の両方で確かめ、React 版とも比べました。

- **英語の UI**: 上部 / 下部バー、メニュー、ツールチップ、aria-label まで英語になり、日本語は残りませんでした。
- **上の表で行を動かしたときの下の入れ替わり**:
  - ArrowDown を 30 回、間を空けずに押しても、見出しと先頭の明細が食い違ったフレーム・空のフレームは 0(29〜31 フレーム、dev / 本番)。
- **入れ替わりの速さ(本番で 2 回以上、React 版と比べた。4 CPU を共用し、別の作業も動いていたので参考値)**:

| 測ったもの | Solid | React |
| --- | --- | --- |
| 1 回ずつ押して描かれるまで(中央値) | 43〜44ms | 40〜52ms |
| 横に動くだけ(中央値) | 15〜16ms | 14〜15ms |
| Event Timing の keydown の duration(中央値) | 40ms | 40ms |
| そのうちハンドラの中の処理 | 約 20ms | 2〜3ms(React は描画をハンドラの後へ回す) |
| 間を空けずに 30 回押し終えるまで | 1.0〜1.3 秒 | 0.66〜0.84 秒 |
| 33ms ごとに押し続けたときの、最後のキーから追いつくまで | 5〜7ms | 5〜7ms |
| remount の形で 1 回ずつ押して描かれるまで(中央値) | 49〜54ms | 41〜46ms |

  - 押してから描かれるまでの時間はほぼ同じで、目に見える差は無いので所見にはしません。
- **下の選択と履歴**:
  - 注文を替えても下の選択は同じ位置(B2:B4)に残り、明細が少ない注文では詰まりました。
  - 下の元に戻すの履歴は入れ替わりで消えます(`canUndo` が false になる。ドキュメントのとおり)。入れ替えた後の Ctrl+Z が新しい注文の明細を変えることはありませんでした。React 版も同じです。
- **下で打ちかけのまま上の別の注文へ移る**(クリック / F6 + ArrowDown):
  - 先にフォーカスアウトで確定が起き、`onRowsChange` が `onActiveCellChange` より前に呼ばれたので、正しく前の注文へ書かれました。React 版も同じです。
- **上の合計**:
  - `applyRows(fn, { undoable: false })` で上の qty / amount と合計行が変わり、上の履歴は残りました(上の Ctrl+Z で note だけ戻り合計はそのまま、やり直しも効く)。下の Ctrl+Z / Ctrl+Y で上の合計も戻り / 進みました。
  - `setOrders` で直接書く形では合計は変わり、上の履歴は消えました(ドキュメントのとおり)。
- **フォーカス**:
  - F6(`focus()`)で 2 つの表を行き来できました。下にアクティブセルが無いときは ArrowDown で先頭のセルから始まりました。
  - 上の最終列で Tab を押すと、次のフォーカスできる要素(下の表のバーのチップ → 検索欄 → 表)へ移りました。先頭の列で Shift+Tab を押すと外へ出ました。
  - 「Go to lines」ボタンで `focus()` → 文字を打つと編集が始まりました。React 版と同じ結果です。
- **列の幅のそろえ**: 両方向で効き、注文を替えても残りました。
- **列の並びのそろえ**: 守りを入れると両方向で効きました(S10-01)。
- **remount の形**: 幅と並び(qty の降順)が次の注文の表へ引き継がれました。
- **エクスポート**:
  - 両方の CSV に BOM と英語の見出しが付き、`getValue` の amount は生の値(41000)で出ました。合計行は既定どおり含まれません。
  - 注文を選んでいないときの「Export lines」は見出しだけのファイルになりました。
- **下の表だけダーク**:
  - 列メニュー / 列フィルター / select の候補 / ツールチップが、下の表はダーク、上の表はライトで出ました。その場の切り替えも効きました。
  - date エディタはポップアップを持ちません。
  - 下の表の列フィルターは、下に余地が無いので見出しの上へ開きました(問題なし。`S10/e2e/shots/dark-filter-bottom.png`)。

### 4. 所見

**S10-01 低 / ドキュメント・使いにくさ / React 版も同じ / 回帰か: 不明**
- **題名**: `applyState({ columns })` は並び・表示・固定が今と同じでも `onColumnsChange` を呼ぶ(`applyState(getState())` も同じ)。2 つの表の列の並びを互いの `onColumnsChange` → `applyState` でそろえると、呼び合いが止まらずスタックが溢れる。
- **再現**:
  - `S10/e2e/samecols.cjs`: `__top.applyState({ columns: __top.getState().columns })` で `onColumnsChange` が 1 回呼ばれます。`{ sort: [] }` だけなら呼ばれません。
  - `S10/e2e/link.cjs "?link=1&guard=0"`: 上の列の見出しを掴んで動かします。
- **期待**: 何も変わらないときは呼ばない。ドキュメントには `onStateChange` / `onFiltersChange` は「同値非発火」、`applyState(getState())` は「冪等」とあり、そう読めます。呼ぶのなら、そのことを書いておいてほしいです。
- **実際**: `RangeError: Maximum call stack size exceeded` が pageerror で 2 回出ます。スタックは `columnHeaderDragController` → `columnCommands` → `onColumnsChange` → `gridApi.applyState` → … の繰り返しです。最後の並びは画面に入りますが、例外はグリッドのドラッグの処理の中で出ています。
- **回避**: 利用側で `getState().columns` と比べて同じなら渡さない(`S10/src/App.tsx` の `GUARD`)。ただし Solid では、相手の `onColumnsChange` の中で読む `getState().columns` が columns prop の反映前の古い並びのため、1 往復余分に呼ばれてから止まります。
- **dev / 本番**: 両方。React 版 1.2.1 でも同じ例外が出ました。**確度**: 確実。

**S10-02 低 / 使いにくさ・ドキュメント / Solid だけ / 回帰か: 不明**
- **題名**: 列の `getValue` が外の signal を読むと、セルの表示はその signal に追従するが、合計行(`aggFunc`)は追従せず、画面の中で値が食い違う。
- **再現**: `S10/e2e/totals2.cjs "?totals=getValue"`。上の qty / amount を `getValue: (row) => totalsById().get(row.id)?.qty` にし、下の明細の qty を 35 → 100 にします。
- **期待**: セルと合計行がそろう(どちらも変わる。または、どちらも変わらず rows が変わるまで待つ)。
- **実際**: 上のセルは 445 → 510 に変わりますが、合計行は 787,251 のまま(正しくは 787,316)。
- **補足**: 合計が変わるたびに列を作り直す形(`getValueMemo`)なら合計行も変わります。React 版では state を読む `getValue` は列を作り直すしかなく、この食い違いは起きません。「`getValue` / `valueFormatter` は行だけから決める。外の signal を読むなら列を作り直す」とドキュメントにあれば迷いません。
- **dev / 本番**: 両方。**確度**: 確実。

**S10-03 低 / ドキュメント / Solid だけ / 回帰か: 不明**
- **題名**: 上下の表の典型の形(`onActiveCellChange` で signal を書く)で、README の「Development diagnostics」の一覧に無い effect 名の `EFFECT_RELAY_TEAR` が出る。勧められている直し方(memo にする)は、値がグリッドの通知から来るので取れない。
- **再現**: 下で編集中に、上の別の注文を押します(`S10/e2e/blurswitch.cjs`)。
- **文言**: `[EFFECT_RELAY_TEAR] memo "condition" ran twice for one write of "orders": once in the flush where "orders" changed, and again after effect "activeCellNotifier" relayed it by writing "activeId" — the first frame showed the new "orders" with the stale "activeId" (3 times so far). Nothing else writes "activeId". If "activeId" is computed from what the effect reads, make it a memo so readers get it in the same flush; …`
- **影響**: 目に見える食い違いはありませんでした(rAF ごとの記録で、見出しと先頭の明細が食い違ったフレームは 0)。
- **dev / 本番**: dev だけ。**確度**: 確実。

### 5. Solid の利用者として
- 上下の表(マスタ・明細)の Solid の例があると助かります。入れ替わりで下の履歴が消え、選択が同じ位置に残ることも書いてあるとよいです。
- 診断の一覧に `activeCellNotifier` を足し、利用側の通知の中で signal を書いたときに出ることも書いてほしいです。
- `getValue` で外の signal を読んだときの扱いを書いてほしいです(S10-02)。
- `numberFormatter` を数の書式の関数だと思って使い、型のエラーで `valueFormatter` を返すものだと気づきました。

### 6. 要望
- `applyState` は、列のメタが変わらないときは `onColumnsChange` を呼ばないでほしいです(S10-01)。
- `applyState` の `sort` を `{ key, direction }` と書き間違えたとき(正しくは `columnKey`)、開発時の警告も無く捨てられました。開発時に知らせてほしいです(React 版では確かめていません)。
- 上の行が替わって下の rows が入れ替わるときに、下の選択を外す・先頭へ戻す設定が欲しいです。