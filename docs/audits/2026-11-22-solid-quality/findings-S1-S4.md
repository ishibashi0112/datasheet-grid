# S1(在庫・発注表)と S4(テストと型)の点検の報告(作り直しの組)

段階 4 の 1-6。手順は `audit/dogfood/2026-11-22-solid-quality/BRIEF.md`。ライブラリは今のブランチを pack した Solid 版 0.1.0 の tarball(core 1.2.1 は npm)。ポートは S1 = 5501、S4 = 5504(React 版の比べるアプリも 5504 で入れ替えて使った)。点検者の報告をそのまま写した(所見の ID は点検者が付けたもの)。

## S1 在庫・発注表(ポート 5501)

### 作ったもの

- 前のアプリを写し、依存を今の tarball に替えて入れ直した。Vite 8.3.8 / Solid 2.0.3 / `@solidjs/web` 2.0.3 / `@solidjs/vite-plugin` 3.0.1 / Tailwind 4.3.5(`style.layer.css`)。画面は前と同じ(2,000 品目の在庫表、登録フォーム、ツールバー、signal / store / 持たない の 3 つのタブ)。
- 今回足したもの: 自作のバーのページ `src/BarsPage.tsx`(`bars.html?mode=jsx|body|destructure|mixed|bodyrows|bodysort`。`renderTopBar` / `renderBottomBar` で文脈の件数・並び・絞り込み・アクティブセル・範囲・集計を出し、上部バーに自作のグローバルフィルターの入力欄)。台本 `e2e/t20-bars.cjs`、`t20b-bodysort.cjs`、`t21-hmr.cjs`、`t21b-hmr-sibling.cjs`。

### 確かめた操作(問題が無かった範囲を含む)

- 前の台本(t1 / t1b / t3 / t4 / t6 / t7 / t8 / t8b / t11 / t11b / t12 / t13 / t14 / t15 / t16 / t17)を dev と本番の両方で回し直し、どれも前回と同じ。編集と元に戻す / やり直し、Excel の TSV の貼り付け(全角・「１，２００」・`2026/11/1`・select の表示名)、フィルハンドル、`imeDirectInput`(CDP の IME)と CSV(`includeTotalRow` / `escapeFormulas`)、列メニュー・列フィルター・ツールパネル・右クリックメニュー・検索・列の固定、ハンドル(`getState` / `applyState` / `scrollToRow` / `focus` / `startEditing`)、フォームとのキーの分離、Tailwind の preflight との共存、ダーク、行選択と削除、マウントとアンマウント。本番では console への出力なし。
- 自作のバー: JSX の中で読む形(jsx / mixed)は、バーの関数が上下とも 1 回しか呼ばれず DOM も同じ要素のまま。件数・並び・絞り込み・アクティブセル・範囲・集計がどれも追従し、入力欄はフォーカスと打った文字を保った(30ms 間隔でも速打ちでも、IME の確定も、打っている間の `applyRows` でも)。関数の本体で読む形 / 分割代入の形(body / destructure)は、値は追従するが変わるたびにバーを作り直し、1 文字目でフォーカスが外れ IME の変換中の文字は確定できずに残る(README の新しい説明どおり)。本体で `ctx.rows.length` だけ読む形は行が変わったときだけ作り直す。dev と本番で同じ。
- HMR(dev サーバーを動かしたまま列の定義とグリッドを使う部品を書き換え): リロードなしで更新、エラーなし、window のリスナーは前後とも 28、`[role=grid]` は 1 つ、HMR の後の ArrowDown は 1 行だけ動く(二重の処理なし)。この 2 ファイルではページの部品ごと作り直され状態は初めに戻る(solid-refresh のふつうの動き)。編集中の HMR ではエディタがきれいに消え、列フィルターを開いたままの HMR ではポップアップが残らない。兄弟の部品(ツールバー)の HMR ではグリッドの状態・開いたエディタ・打ちかけの文字が残り、元に戻すも効いた。

### 前の所見の今

- S1-01(行を store で持つと元に戻すが効かない): 変わった(記録どおり)。store のときの開発時の警告が 1 回出るようになり、編集ごとの STRICT_READ_UNTRACKED は出なくなった。読み込み時の HUGE_FAN_IN(2 件)と IMMUTABLE_UPDATE_IN_STORE は残る。元に戻すは store では今も効かない(README の「signal で持つ」で案内済み)。
- S1-02(`setRows` の直後のハンドルに `flush()` が要る): 直っている(README に記載)。
- S1-03(書けるセルが無い貼り付けでも `onRowsChange` と空の履歴): まだある。React 版 1.2.1 も同じ。

### 所見

**S1-21** 低 / ドキュメント / Solid だけ / 回帰ではない / dev・本番 / 確実 — バーの関数の本体で `ctx.derivedSummary.sortSummaryText` だけを読んでも、並びと関係のない操作でバーが作り直される。`renderTopBar={(ctx) => { const s = ctx.derivedSummary.sortSummaryText; return <div><span>{s}</span><input /></div> }}` で、セルを 1 回クリックすると呼び出しが 1 回から 3 回、ArrowDown 5 回で 8 回になり、バーの入力欄に打つと作り直されてフォーカスが外れる(ホイールとホバーでは増えない)。`derivedSummary` は 1 つのまとまりで、アクティブセル・範囲・絞り込みのどれかが変わると全体が変わる。`ctx.rows.length` だけなら期待どおり。直し方の案: README に「`derivedSummary` は 1 つの値なので、どれかが変わると作り直す」と書くか、項目ごとに追従させる。証拠 `S1/src/BarsPage.tsx`(`?mode=bodysort`)、`S1/e2e/t20b-bodysort.cjs`。

### Solid の利用者として / 要望

- バーの新しい説明は分かりやすく、そのとおりに動いた。足りないのは `derivedSummary` の粒度の一言だけ。HMR は特別な設定なしで使えた。「HMR で状態が初めに戻ることがある」と一言あると安心。
- 要望: `derivedSummary` の項目ごとの追従(または README の追記)、持ち越しの S1-03。

## S4 テストと型(ポート 5504)

### 作ったもの

- 前のアプリを写し、依存を今の tarball に替えた。Vitest 5.1.1 / jsdom 31.0.1 / happy-dom 21.0.4 / `@solidjs/testing-library` 1.0.0-rc.2 / user-event 14.6.13 / TypeScript 7.0.2(と 5.8.3)/ Solid 2.0.3。比べる用に React 19.3.1 と React 版 1.2.1(npm)。
- 今回足したもの: `src/AsyncInventory.tsx`(非同期の `createMemo` で一覧を読み、`<Errored>` + `<Loading>`(`on` の有り / 無し)で包み、`createOptimistic` + `action` で保存して `refresh`。擬似サーバーは遅延・失敗・呼び出しの記録つき)、`src/AsyncInventoryDeferred.tsx`(回避策の形)、テスト `src/async.test.tsx` / `show-ref.test.tsx` / `loading-ref.test.tsx` / `recheck.test.tsx` / `fake-timers.test.tsx`、実ブラウザの再現 `app/`(`save.html` / `show.html` / `loading.html`、台本 `app/e2e/*.cjs`)、React 版で同じ形の `app-react/`、SSR の `ssr/entry-async.tsx`。

### 確かめた操作(問題が無かった範囲を含む)

- テスト全体: jsdom と happy-dom の両方で 16 ファイル・58 件が通り、`it.fails` の 6 件(S4-21 / S4-23)は想定どおり失敗。前回の範囲(描画・セルの編集・フィルター・キー操作・範囲選択とコピー・ハンドルの API・`/testing`・fake timers)も通った。
- Vitest の設定: プラグインありの形と、プラグイン無しで README の 3 か所に書く形は通る。1 か所だけの形は落ちる(README どおり)。
- `<Loading>` の中の非同期の行: 読み込み中は fallback、行が来ると `findByRole('grid')` で見つかる(console.error なし)。取り直しの間は前の行のまま `isPending`、グリッドの要素は同じまま。`<Loading on>` では fallback が出直し、グリッドは作り直されて新しいハンドルが ref に入る。失敗すると `<Errored>`、reset で読み直す。
- `action` + `createOptimistic` で保存: 1 回の編集は楽観的にすぐ出て、保存と `refresh` の後も残る。失敗すると元の値へ戻る。`refresh` の後は履歴が消える(外からの差し替え扱い。React 版も同じ)。続けて 2 回編集すると壊れる(S4-21)。
- `<Show>` と ref: 最初から出しているときも後から出したときも親の effect でハンドルを使える。出し直すと ref の変数は新しいハンドルに替わる。
- SSR: 同期の `renderToString` は例外なし・console.error 0 件。`<Loading>` の中の非同期は `renderToStream` でグリッドを含む。
- 型: TS 7.0.2 / 5.8.3 × bundler / nodenext × strict + `exactOptionalPropertyTypes` で通る。`GridColumn<Row>` の推論、`valueGetter` / `valueFormatter` / `rowKeyGetter`、ハンドル、`renderCell` / `renderHeader` の引数の型は問題なし。`tsc --declaration` の d.ts に内部のパスは出ない。

### 前の所見の今

- S4-01(プラグイン無しの Vitest は 3 か所に `browser` が要る): 直っている(README)。
- S4-02(signal を変えた / fireEvent の後に `flush()` が要る): 直っている(README)。
- S4-03(`selectRange` / `applyState` の直後の `exportCsv` が古い)/ S4-04(pnpm で `numberFormatter()` の結果を推論のまま export すると TS2883)/ S4-05(select の `options` に readonly の配列を渡せない)/ S4-06(`SpreadsheetGridProps<T>` に `T extends object` が無い)/ S4-07(jsdom の user-event で number に打つと逆順)/ S4-08(set フィルターの候補が生の値)/ S4-09(消した行の選択のキーが残る): まだある。

### 所見

**S4-21** 高 / 不具合 / Solid だけ / 回帰ではない(前回は試していない使い方)/ dev・本番 / 確実 — `onRowsChange` から `action` で保存すると、保存が終わるまでグリッドの UI が止まる。保存中に別の行を編集すると、前の行に書かれてサーバーへ保存される(1 回目の編集が失われる)。

```tsx
const [rows, setRows] = createOptimistic(() => serverRows())
const save = action(function* (next) { setRows(next); yield api.save(next); refresh(serverRows) })
<SpreadsheetGrid rows={rows()} onRowsChange={(next) => save(next)} ... />
```

1 行目の品名をダブルクリック → Ctrl+A →「first」→ Enter、保存中(1.5 秒)に 3 行目をダブルクリック →「second」→ Enter。期待(React 版 1.2.1 の `useOptimistic` + `startTransition` / `setRows` + `startTransition` / 遷移なしでは dev・本番ともこうなる): 1 回目の Enter でエディタが閉じ、1 行目は「first」、3 行目は「second」、サーバーにも両方が残る。実際: Enter の後もエディタが開いたままでセルは元の「品目1」、下部バーも止まる。保存中にクリックしてから打った文字は捨てられ、ダブルクリックすると 1 行目の古いエディタにフォーカスが行き、「second」が「品目1second」として 1 行目に確定・保存され「first」を上書きする。jsdom でも同じ(`async.test.tsx` の B3)。dev のコンソールに Solid の SILENT_HOLD / STACKED_HOLDS。`createOptimistic` を使わずふつうの signal + action でも同じ、`flush()` / `queueMicrotask` / `onSettled` を挟んでも直らない(`onSettled` はイベントハンドラーから呼ぶと SETTLED_CLEANUP_UNOWNED の例外)。`onRowsChange={(next) => setTimeout(() => save(next), 0)}` で遷移の外へ出すと正しく動く。Solid 2.0 の保存の典型的な書き方で、ドキュメントにも注意がない。証拠 `S4/app/src/save.tsx`、`S4/app/e2e/save.cjs`(`DBL=1`)、スクショ `save-*.png`、React 版 `S4/app-react/src/save.tsx`、テスト `S4/src/async.test.tsx`。

**S4-22** 中 / 不具合(またはドキュメント)/ React 版も同じ(ハンドルのオブジェクトを変数に持った場合。React の `ref.current` はアンマウントで null になるので、ドキュメントどおりの書き方では起きない)/ 回帰ではない / dev・本番 / 確実 — `<Show>` で隠した後も、`let grid!` + `ref={grid}` の変数は外したグリッドのハンドルのまま残り、呼ぶと古い行で親の行を上書きする。300 行で表示 → 隠す → 親で行を 1 つ足す(301 行)→ 隠したまま `grid.applyRows(p => p.slice(1))` で、外したグリッドが持っていた 300 行から 1 行を消した 299 行で `onRowsChange` が親の行を上書きする(足した行は消える)。`undo()` でも足した行の無い 300 行。`startEditing(0,0)` は true を返し、`selectCell` / `scrollToRow` / `focus` も例外を出さず、`exportCsv()` は古い中身を返す。期待: 外したハンドルは何もしない(または例外 / 開発時の警告)。証拠 `S4/src/show-ref.test.tsx`(4 つ目)、`S4/app/src/show.tsx`、`S4/app/e2e/show*.cjs`、React 版 `S4/app-react/src/show.tsx`。

**S4-23** 中 / 不具合(またはドキュメント)/ Solid だけ(React 版の Suspense + `use` では親の `useEffect` の時点で `ref.current` が null なので気づける)/ 回帰ではない / dev(jsdom・happy-dom)・本番(実ブラウザ)/ 確実 — 行が来ていない `<Loading>` の中のグリッドへ、親の最初の `createEffect` / `onSettled` からハンドルを呼ぶと黙って捨てられる。

```tsx
const rows = createMemo(() => fetchRows())
<Loading><SpreadsheetGrid ref={(h) => (grid = h)} rows={rows()} /></Loading>
createEffect(() => true, () => { grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] }); grid.scrollToBottom() })
```

期待: README の「ハンドルは最初の `createEffect` と `onSettled` より前に入るので、そこで呼べます」どおり、読み込み後に降順で末尾。実際: ハンドルは入っていて例外も警告も出ないが、読み込み後の `getState().sort` は `[]`、スクロールも先頭、`selectCell` も効かない。回避策: `initialState` で渡す、`createEffect(() => rows().length, …)` のように行を読む effect から呼ぶ。証拠 `S4/src/loading-ref.test.tsx`(`it.fails` 2 件)、`S4/app/src/loading.tsx`、`S4/app/e2e/loading.cjs`、React 版 `S4/app-react/src/loading.tsx`。

### Solid の利用者として / 要望

- `flush()`、Vitest の設定、store の扱いは README で迷わなかった。
- Solid のページに書いてほしいこと: 行を非同期の `createMemo` + `<Loading>` で読む例(取り直しの間は前の行のまま、`<Loading on>` ではグリッドが作り直されて状態が消える)、`action` / `createOptimistic` で保存するときの書き方(今は `onRowsChange` から遷移の外へ出さないと壊れる = S4-21)、ref の注意(外した後もハンドルが残る = S4-22、行が来る前の `<Loading>` の中ではハンドルの呼び出しが効かない = S4-23)。
- 要望: グリッドの内部の UI の状態を利用側の遷移(action)に巻き込まない、または `onRowsChange` を遷移の外で呼ぶ(S4-21)。外したグリッドのハンドルは何もしないようにし開発時に警告する(S4-22)。行が来る前のハンドルの呼び出しを行が来るまで待たせるか開発時に警告する(S4-23)。持ち越し: 型の S4-04 / S4-05 / S4-06、S4-09、S1-03。