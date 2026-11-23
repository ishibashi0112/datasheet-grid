# 変更履歴(Solid 版)

`@ishibashi0112/spreadsheet-grid-solid`(Solid 2.0 向けの Solid 版)の変更履歴です。Solid 版の版は React 版・core とは別で、core には同じ 1 つの版で依存します(どの版の core かは各版の見出しの下に書きます)。React 版と core の変更履歴はリポジトリの [CHANGELOG.md](../../CHANGELOG.md) にあります。

1.0 より前は minor でも壊す変更が入ることがあります。そのときは「挙動の変化」「削除」に書きます。

使い方は [Solid で使う](https://datasheet-grid.vercel.app/docs/solid) と、React 版の [API リファレンス](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md)(props とメソッドは同じ)を参照してください。

## 未リリース

### 追加

- ことばで絞り込み(入口 `@ishibashi0112/spreadsheet-grid-solid/ai`)。React 版の `/ai` と同じ `GridAskBar` と、バーを自分で作るときの `createGridAsk`(React 版の `useGridAsk`。Solid の慣例で `create…` の名前、型は `CreateGridAskOptions` / `CreateGridAskResult`)、core の `createGridAskRequest` / `readGridAskAnswer` などです。`grid` にはハンドルを返す関数(`let grid!` と `ref={grid}` なら `grid={() => grid}`)か signal(`ref={setGrid}` と `grid={grid}`)を渡します(React の ref オブジェクトはありません)。バーの見た目・文言・答えの扱い・元に戻す / 表を手で変えた後の印は React 版と同じです(同じ操作で DOM と通知を比べるテストで確かめています)。グリッドの入口とはファイルを共有しないので、使わなければバンドルに入りません(約 15KB gzip)。英語の文言は `/locales/en` の `gridAskLocaleTextEn`(React 版と同じもの)。使い方はガイド「[ことばで絞り込み(AI)](https://datasheet-grid.vercel.app/docs/guides/ai-filter)」の Solid のタブ。

- 行を Solid の store(`createStore`)で持てるようにしました。`rows={state.rows}` で渡し、`onRowsChange` で受け取った配列を `setState((s) => { s.rows = next })` か `setState((s) => { reconcile(next, 'id')(s.rows) })` で戻すと、signal で持つときと同じく元に戻す / やり直しが効きます。store の中を直接変えたとき(`s.rows[0].name = …` / `push` / `splice`)もグリッドに映り、React 版で親が rows を差し替えたときと同じく、元に戻すの履歴は消えます。これまでは store に入れるとどの編集も外からの差し替えに見えて元に戻すが効かず、開発時に Solid の知らせ(`HUGE_FAN_IN` / `STRICT_READ_UNTRACKED`)が多く出ていました(開発時に signal を勧める警告を出していました)。store は中の変化に気づくため行ごとに追うので、行が多いと編集のたびに時間がかかります(10 万行で 1 回 0.1 秒ほど)。5 万行より多い store を渡したときは、開発時に 1 回 signal を勧めます。

### 挙動の変化

- 行を store で持つとき、`renderCell` / `valueFormatter` などに渡る行(`ctx.row` など)は store のプロキシではなく、その時点の中身(store の `snapshot`)になりました。store の中を直接変えた行は新しいオブジェクトになり、その行のセルを描き直します(signal で持つときと同じ)。

### 修正

- グリッドの `ref` に signal の setter を渡すと(`ref={setGrid}`)、Solid が `REACTIVE_WRITE_IN_OWNED_SCOPE` を投げてグリッドが描かれませんでした。ハンドルを渡す関数を、部品の中の書き込みとして扱われない所から呼ぶようにしました(ハンドルが入る時機は今までどおり、利用側の最初の `createEffect` と `onSettled` より前です)。

## 0.1.2 — 2026-11-23

core 1.3.0 に依存します。Solid 版の品質を React 版にそろえる作業の段 2(React 版も同じだった所見と前からの残り)で、React 版と core の 1.3.0 と同じ直しです。

### 追加

- 列の `exportable`。`false` で、その列を CSV / TSV の書き出し(`exportCsv` / `downloadCsv`。scope `'selection'` も)と `getExportData` から外します。操作のボタンの列や、画面には出すが書き出したくない社内だけの ID の列に使います。範囲を選んだコピー(`Ctrl/Cmd+C`)には今までどおり出します(選んだとおりに写す)。これまでは行を外す `isRowExportable` しかなく、列は外せませんでした(ガイド「エクスポート」の「列の除外」)。
- npm のパッケージに API リファレンス(`API_REFERENCE.md`。React 版と同じ文書で、先頭に Solid 版での読み替え)と、AI コーディングツール向けの [Agent Skill](https://agentskills.io)(`skills/spreadsheet-grid-solid/SKILL.md`)を同梱しました。これまで README は GitHub の React 版の API リファレンスへリンクしていました。`createSpreadsheetGrid` に説明(JSDoc)を付けました(エディタのホバーで出ます)。

### 変更

- 展開行のトグル(▸ / ▾)の読み上げの名前に、どの行かを入れました(「行 7 の詳細を開く」「行 7 の詳細を閉じる」、英語 `Show details for row 7`)。番号は行見出しと同じ(ラベル行は数えない)で、行のチェックボックスの「行 7 を選択」と同じ書き方です。これまではどの行も「詳細を開く」で、スクリーンリーダーの一覧でどの行のボタンか分かりませんでした。文言 `showDetails` / `hideDetails` は `{row}` を使え、型は `GridLocaleTextTemplate<{ row: number }>`(文字列か関数)になりました(`localeTextEn.showDetails` などを `string` として読んでいるコードは型エラーになるので、`typeof` で確かめてください)。テストで名前で探しているときは `getByRole('button', { name: /詳細を開く/ })` などに直すか、`localeText={{ showDetails: '詳細を開く', hideDetails: '詳細を閉じる' }}` で前の名前に戻せます。
- 条件付き書式のチップの文字の既定の色を濃くし、明るいテーマで 5 色とも背景との対比を 5:1 以上にしました(`--ssg-cf-good` `#15803d` → `#14703a`、`--ssg-cf-warning` `#b45309` → `#a14a0b`、`--ssg-cf-critical` `#dc2626` → `#b91c1c`)。「不良」(critical)が 3.95:1 で WCAG AA の 4.5:1 に届かず、axe の `color-contrast` に当たっていました。暗いテーマと背景の色は変わりません。前の色に戻すときはこの 3 つのトークンを書きます。

### 修正

- Shadow DOM(Web Components)の中のグリッドで、効かない操作がありました。ツールチップが出ない、`imeDirectInput` で変換を確定しても編集が始まらず打った文字が消える、列メニューと右クリックメニューの ↓ がいつも先頭へ・↑ がいつも末尾へ移る、ツールパネルを開いてもフォーカスが移らない(Escape で閉じるとフォーカスが外れる)、ポップアップが `document.body` の直下に出て見た目が付かない(Shadow root の中の CSS が届かない)、の 5 つです。Shadow root の中のイベントと、フォーカスのある要素を読めるように直し、`popupContainer` の既定(`'auto'`)は、グリッドを囲むダイアログが無ければ、Shadow root の直下でグリッドを包む要素の中に描くようにしました。使い方(CSS を Shadow root に入れる・グリッドを要素で包む・open の Shadow root を使う)と、ページの文字の大きさを受け継ぐこと、親のページから iframe の document へ描く形には対応しないことを、React 版の API リファレンスの「Shadow DOM の中のグリッド」に書きました。
- 範囲の選択が無いとき(`Escape` で外した後など)に `Ctrl/Cmd+C` を押しても何もコピーされませんでした。アクティブセルの 1 セルをコピーします。
- 列フィルターの日付のプリセット(「今日」「今月」など)を、日付の入力欄にフォーカスがあるまま押すと、フォーカスがページの `body` に落ち、`Escape` でフィルターを閉じられませんでした。押したプリセットへフォーカスを移します。
- エディタを開いたまま別のセルを押し、次のフレームが来る前に打つと(バーコードリーダーや速い入力、自動化の `dblclick`)、前の編集の後処理がフォーカスをグリッドへ戻し、打った文字が先頭の 1 文字だけ残して消えていました(custom エディタではキーが入りませんでした)。
- 編集していた行が絞り込みから外れたとき(`rows` にはまだある)、知らせずに編集を終えて打ちかけを捨て、フォーカスがページの `body` に落ちてキー操作が効きませんでした。打ちかけをその行へ確定し(text / number / date。custom は入力欄の `onBlur` で `ctx.commit` を呼んでいればその値。ただし絞り込みで表の行が減り、編集していた位置に行が残らないときは、`onBlur` より先にエディタが外れて書かれないことがあります。select は取り消し)、フォーカスはグリッドに残します。`rows` が別の行に替わって編集していた行が無くなったときと serverSide では取り消します。
- 行をグループ化した表で、グループの先頭の行を custom エディタで編集している間に上のグループへ行が足されると、エディタが作り直されて打ちかけが消え、開いたときの値が保存されていました。同じ編集が続いている間は作り直しません。
- `imeDirectInput` を有効にした表で `PageDown` を押すと、IME の入力受けがスクロールの前の位置に残り、変換の候補の窓がアクティブセルからずれて出ていました。
- `<Show>` などでグリッドを外した後も、`let grid!` + `ref={grid}` の変数に残ったハンドルで `applyRows` / `undo` を呼ぶと、外したグリッドが持っていた古い行で `onRowsChange` が呼ばれ、親の行が上書きされていました(`startEditing` は `true` を返していました)。外したグリッドのハンドルの状態を変えるメソッドは何もせず(`startEditing` は `false`)、開発時にだけ 1 回警告します。読むメソッド(`getState()` など)は外したときの値を返します(`onCleanup` で保存できます。スクロールの位置を読む `getScrollPosition()` は `null`、`isAtBottom()` は `false`)。
- `applyState(getState())` のように列の並び / 表示 / 固定が今と同じ状態を渡しても、`onColumnsChange` が呼ばれていました。同じなら呼びません。
- 書けるセルが 1 つも無い貼り付け(編集できない列だけに貼ったときなど)でも `onRowsChange` が呼ばれ、中身の無い「元に戻す」が 1 手積まれていました(`createRow` があると空の行も足していました)。何も書かないときは `onRowsChange` を呼ばず、行 / 列も足しません(`Delete` と同じ)。
- `onPasteSkipped` が、編集できないセルへ貼った空の文字(Excel の範囲の空のセル)も書かなかったセルに数えていました。数えません。
- 選んだ行を `rows` から消した後も行選択にキーが残り、`getSelectedRowKeys()` / `getSelectedRowCount()` が `getSelectedRowData()` と食い違っていました。消えた行のキー(全選択で除いた行も)を選択から外し、`onRowSelectionChange` で知らせます(controlled でも。描く途中で外すので、通知は次のマイクロタスク)。外すのは前の `rows` にあって今の `rows` に無いキーだけで、行を読み込む前に渡したキーは残します。消した行を元に戻しても選んだ行の選択は戻りません(全選択をしていたときは、消す前と同じく、除いていた行は除いたまま・ほかの行は選ばれた状態で戻ります)。serverSide では今までどおりです。
- `selectRange` の直後(`flush()` の前)に `exportCsv({ scope: 'selection' })` / `getExportData({ scope: 'selection' })` を呼ぶと、古い選択で出ていました(選択が無ければ空)。呼んだ時点の選択で出します。`applyState` などで並べ替え / 絞り込みを変えた直後のエクスポートは、今までどおり `flush()` の後に呼んでください。
- フィルターを開いたまま別の列のフィルターへ移ったとき(ツールパネルの「フィルター」タブの ✎ など)、set の候補の検索の文字が前の列のまま残り、候補が絞られて出ていました。列ごとに空から始めます。
- グリッドの中で列を変えたとき(見出しのドラッグ・列メニューの「列の固定」と「列を隠す」・ツールパネルの「列」タブ・列のリセット)、アクティブセルと選択が外れ、矢印キーで動けなくなっていました。アクティブセルはその列に付いていき(その列を隠したときは同じ位置のまま)、選択はアクティブセルの 1 セルにします。列メニューのグループ化を変えたときは今までどおり外れます。
- 左に固定した列があると、横にスクロールした後の `Ctrl/Cmd+Home` / `Home` / `Ctrl/Cmd+←` で左端へ戻りませんでした(右に固定した列があるときの `Ctrl/Cmd+End` / `End` / `Ctrl/Cmd+→` も)。端へ移ったら横のスクロールも端へ戻します。
- 2 つのグリッドを置いたページで、片方の列メニュー(右クリックメニュー・列フィルターも)を開いたまま、もう片方の見出しの ⋮ を押すと、2 つのメニューが開いたままになっていました。前のメニューを閉じます。
- 細い列(120px 未満)で `renderHeader` の中に置いたボタンを押すと、ホバーで出る操作(並べ替えのつまみ / 列メニューの ⋮)が上に重なっていて、列の並べ替えが始まったり列メニューが開いたりし、ボタンの `onClick` が呼ばれませんでした。ポインタが中のボタン等の上にある間はホバーの操作を隠します(見出しの空いた所では今までどおり出ます)。
- 列フィルターの日付の入力欄(範囲の開始日 / 終了日など)が、全角の数字と記号(「２０２６／１１／２０」)・「2026年11月21日」・「2026.11.23」を読まず、赤枠のまま条件になりませんでした(セルの date エディタは同じ文字を読みます)。セルの date エディタと同じ読み方にしました。
- 「今日」「今月」などの相対の期間の列フィルターを開いたまま 0 時をまたぐと、表は新しい日に移るのに、ポップアップの値の木と「一致 N 件」は前の日のままでした(開き直すと直る)。開いたままでも新しい日で絞り直します。
- select エディタの候補を開いたまま並びが変わると(`applyState` でソートを外す・行を差し替える など)、エディタは行に付いて動くのに、候補の一覧が元の位置に残ってエディタに重なっていました。エディタに付いていくようにしました。
- 展開行のカードを開いている間、表の直後の空の要素(`Tab` でカードから表の外へ出るための目印)が `aria-hidden` のまま `Tab` の順番に入っていて、axe の `aria-hidden-focus` に当たっていました。`Tab` の順番に入れている間は `aria-hidden` を付けません。
- 行ドラッグのハンドルと展開トグルの列(グリッドが足す列)の見出しが空で、読み上げで名前の無い見出しになっていました(axe の `empty-table-header`)。見た目は空のまま、見えない文字で「移動」「詳細」と名前を置きます(下部バーの番地と同じ文言 `rowDragColumnName` / `detailColumnName`)。
- Solid 版だけに依存するライブラリ(pnpm で core を直接の依存に入れない形)で、`numberFormatter()` の結果を推論のまま export する(`export const yen = numberFormatter()` や、`valueFormatter: numberFormatter()` を含む列の配列)と、d.ts を出すときに TS2883 / TS2742 になっていました(core の型の名前が要るため)。返す関数の型を名前の無い構造の型 `(params: { readonly value: unknown; readonly [key: string]: unknown }) => string` にしました(どの列の `valueFormatter` にも今までどおり渡せます)。
- select エディタの `options` と `getFilterOptions` の結果の `options` に、readonly の配列(`as const` で書いた候補など)を渡せませんでした(`filterOptions` には渡せました)。渡せるようにしました。型が readonly の配列になったので、列の定義から `options` を読んで `push` したり、書き換えられる配列を受け取る関数へ渡したりしているコードは型エラーになります(`[...options]` で写して渡してください)。
- 右クリックメニューや列メニューの項目からツールパネルを開くと(`onSelect` で `openFilterManager()` を呼ぶ・列メニューの「並び替えを管理…」など)、ツールパネルへ移ったフォーカスがグリッドへ戻され、ツールパネルをキーボードで操作できませんでした。開いたツールパネルにフォーカスを残します。
- `dataSource` を渡さずに(または機能セットに `serverSide` を入れずに)`refreshServerSide()` / `retryServerSideLoads()` を呼んだときの開発時の警告が、Solid 版に無い入口の名前(React 版の `/lite`)を出していました。入口の名前を出さない文にしました。

## 0.1.1 — 2026-11-22

core 1.2.1 に依存します(0.1.0 と同じ)。Solid 版の品質を React 版にそろえる作業の段 1(React 版と同じ物差しでの測り直し)で見つけた Solid 版だけの不具合の修正です。

### 挙動の変化

- グリッドが描く途中で呼ぶ通知(React 版が描いた後の effect で呼ぶもの: `onActiveCellChange` / `onStateChange` / `onFiltersChange` / `onSortChange` / `onExpandedDetailRowKeysChange` ほか)は、その変化を画面に反映し終えた直後(次のマイクロタスク)に呼びます(下の「通知の中で action を始めると表が止まる」の修正のため)。テストでは、`flush()` の後に `await Promise.resolve()` などで 1 回待ってから通知を確かめてください。グリッドを外した後には呼びません。押した・打ったときにその場で呼ぶ通知(`onRowsChange` / `onCellClick` など)は、これまでどおり同じ処理の中で呼びます。
- サーバーで描く(SSR)ときは、行・件数(上下のバーの「行 2 / 4」)・合計を描かず、ハイドレーションの後に描きます(下の「SSR でタイムゾーンが違うと固定列に別の行が残る」の修正のため)。サーバーの HTML には骨組み(見出し・上下のバーの絞り込み / 並び替えの表示)が出ます。サーバーで描かない使い方は変わりません。

### 追加

- 開発時の警告: グリッドを描く前(`<Loading>` の中で最初の行を待っている間など)に、状態を変えるハンドルのメソッド(`applyState` / `selectCell` / `scrollToBottom` など)を呼ぶと、何もしないことを 1 回知らせます(描く前は列も行もまだ知らないので効きません)。最初の状態は `initialState` で渡すか、行を読む effect から呼んでください。

### 修正

- 通知の中で `action` を始めると(`onRowsChange` から `action` + `createOptimistic` で保存する、ふつうの signal に rows を書いてから `action` で保存する など)、その action が終わるまでグリッドの表示が止まっていた。保存の間もエディタが閉じず、続けて打った文字は捨てられ、保存中に別の行を編集すると前の行のエディタへ入って 1 回目の編集を上書きしていた。グリッドの書き込みを利用者の action の取引に入れないようにしました(React 版の `startTransition` と同じく、保存の間もエディタは閉じ、続けた操作はその場で効きます)。右クリックメニューの項目の `onSelect` で `action` を始めたとき(画面の移動など)も、メニューはすぐ閉じます。
- 行を非同期の `createMemo` / `createSignal(async)` で持つと、取り直しの間グリッドが止まっていた(スクロールしても行が描かれない、矢印キーが効かない、列メニューが開かない。届いた後にまとめて効いた)。取り直しの間も前の行のまま操作できます(React 版の `use` + transition と同じ)。最初の行を `<Loading>` の中で待つ形はこれまでどおりです。
- サーバーで描いた HTML をハイドレーションするとき、サーバーとブラウザでタイムゾーンや今日が違うと(日付の範囲や「今日」の条件を `initialState` で入れた、Date の値の列を固定した など)、固定列のセルにサーバーで絞り込んだ別の行の文字が残り、そのセルを編集すると別の行が書き換わっていた。件数と行数もサーバーのまま残っていた。行はハイドレーションの後にブラウザで描きます(React 版は食い違いをクライアントで描き直して直します)。
- 保存中(`action` + `createOptimistic`)に `fillHandle` のある表で次のセルを打ち始めると、例外(`<Show>` の古い値の読み取り)で表(境界が無ければアプリ全体)が止まっていた(Solid 2.0.3 で起きる)。上の「通知の中で `action` を始めると表が止まる」と同じ原因で、同じ修正で直りました。
- 行を非同期の `createMemo` で持ち、行を出した後の取り直しが失敗すると、同じエラーが console に 12〜13 回出ていた。今は利用側の `<Errored>` が受けるだけで、console には出ません(行を JSX で読んだときと同じ)。
- 変化のたびに作り直す props のオブジェクトを spread で渡すと(`{...gridProps()}`)、開発時に Solid が `STRICT_READ_UNTRACKED` を出していた。
- 自作の上部 / 下部バー(`renderTopBar` / `renderBottomBar`)の関数の本体で文脈を読んだ値(React 版の書き方の引数の分割代入 `({ derivedSummary }) => …` も)が、最初の値のまま変わらなかった。今は読んだ値が変わったときに関数を呼び直します(`renderCell` と同じ)。変わらない値(`setGlobalFilterText` など)だけを本体で読み、変わる値を JSX の中で読むときは、これまでどおりバーを作り直しません(入力欄のフォーカスと打ちかけの文字が残る)。
- 行のグループ化をした表で、編集中に上へ行が足されて編集中の位置が一瞬グループ行を指すと、エディタが作り直され、number / date のエディタは打ちかけの文字を失い、複数行の text のエディタはフォーカスを失っていた。エディタの種類を React 版と同じく行ではなく列から決めます(custom のエディタは React 版と同じく作り直します)。
- 列メニューの「列の固定」の小メニューを開いたまま別の列のメニューへ切り替え、元の列へ戻ると、小メニューが開いたまま出ていた。別の列へ切り替えたら閉じます(React 版と同じ)。
- checkbox の列のセルをダブルクリックしても `onCellDoubleClick` が呼ばれなかった(1 回目のクリックで値を反転したときにセルの中身を作り直し、2 回目のクリックが外れた要素に届いていた)。反転してもセルの中身はそのまま使い、印だけを変えます(React 版と同じ)。
- サーバーで描いた HTML をハイドレーションすると、`theme="auto"` と `motion` の既定の `'auto'` が OS の設定(ダーク / 視差効果を減らす)に合わず、サーバーで描いたライト・動きありのまま残っていた。ハイドレーションの間はサーバーと同じ値で描き、その後に OS の設定へ合わせます(React 版と同じ)。

## 0.1.0 — 2026-11-22

最初の公開です。core 1.2.1 に依存します。

### 追加

- `SpreadsheetGrid`(全部入り)と `createSpreadsheetGrid`(機能を選んで組み込む。機能の部品とプリセット `standardFeatures` も同じ入口)。props・列の定義・命令的なハンドル・通知・CSS のクラスとトークン・見た目は React 版 1.2.1 と同じです。
- 入口 `/locales/en`(`localeTextEn`)と `/testing`(`installJsdomLayoutStubs` ほか)、CSS の `style.css` / `style.layer.css` / `themes/*.css`(React 版と同じファイル)。
- `solid` の export 条件で JSX のままのソース(利用側のバンドラが自分の Solid の設定でコンパイル)、それ以外は DOM 向けにコンパイル済みのビルド(ESM だけ)。

React 版との違い(`ref` の受け取り方、描く関数を呼び直す時、ことばで絞り込み `/ai` が無いこと)と Solid で気をつけること(`rows` は store ではなく signal で持つ ほか)は [Solid で使う](https://datasheet-grid.vercel.app/docs/solid) にあります。