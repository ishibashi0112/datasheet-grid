# Solid 版の品質を React 版にそろえる(段階 4)

2026-11-22 に Solid 版 `@ishibashi0112/spreadsheet-grid-solid` 0.1.0 を公開した後、ユーザーの依頼「Solid 版の初版ができたので、
粗を直して品質を React 版に合わせたい。残件があれば対応したい」で始めた。React 版がこれまでに受けた検証
(`docs/audits/README.md`)と同じ物差しで Solid 版を測り直し(段 1)、見つかったものを直して出し(段 2)、残件の大きなものを
0.2.0 にまとめる(段 3)。計画と、React 版と Solid 版の検証の差の棚卸しは Claude Doc「Solid 版の品質を React 版にそろえる計画」。

この表は進み具合の記録も兼ねる。コミットごとに「状況」を更新して push する(週の使用量の上限などで途中で止まっても、
別のセッションがこの表とコミットから再開できるように)。作業のブランチは `claude/project-thread-lw8d5c`。

## 決めたこと

- 2026-11-22: 段 1 の範囲は「全部(React 版と同じ物差し)」(ユーザーの選択)。下の 1-1〜1-6 をすべて行う。
- 段 1 では React 版と core を変えない。Solid 版だけの所見は見つけたら段 1 の中で直す。React 版も同じだった所見は段 2 で
  React 版と core の 1.2.2 と Solid 版の 0.1.1 を 1 回で出す(Solid 版は core の版に固定するので)。※ その後、段 1 の直しを
  Solid 版 0.1.1 で先に出し、段 2 は React 版と core の 1.3.0 と Solid 版の 0.1.2 で出すことにした(下の 2026-11-22 13:00Z の項)。
- 段 2 のドキュメント: Solid 版の npm に API_REFERENCE.md と Skill を同梱し、主なガイド 8 本に Solid のタブを足す。
- 段 3(0.2.0)の中身(store で持つ行、遠くへのスクロールの速さ、Solid 版の `/ai`)は段 1 で測ってから決める。
- 2026-11-22(段 1 の後): 段 1 の直しは今すぐ Solid 版 0.1.1 で出す(ユーザーの選択。挙動の変化 2 つは React 版 1.2.1 の RV5-1 と同じく直すための変化として patch に)。ほかはおすすめどおり: R5-3 / S1-21 は 0.2.0 で直す(今は文書の回避)、S4-23 は開発時の警告のまま、段 2 の範囲は「段 1 のまとめ」の全部(S9-03 は文書だけ)。
- 2026-11-22 13:00Z(段 2 の前): 段 2 は React 版と core の 1.3.0(公開 API の追加 `exportable` などがあるので minor)と Solid 版の 0.1.2 で、全部を 1 回で出す(ユーザーの選択)。プレビュー「段 2 の選び方」の 6 つは答えが無いのでおすすめの案(RV5-4 は C、S6-04 は B、トグルの名前は A、S12-01 は A、S7-03 / S8-04 は A、CSV は A)。Solid 版を 0.2.0 にするかは PR のときにもう一度聞く(段 3 の候補が 0.2.0 の予定のため)。

- 2026-11-23(段 2 を 1.3.0 / 0.1.2 で公開した後): 段 3 を進める(ユーザーの依頼)。**Solid 版が React 版と完全に並んだら、Solid 版の版を React 版・core とそろえる**(ユーザーの判断「バージョンは合わせたいです」)。段 3 は 0.2.0 ではなく、終わったら Solid 版を React 版・core と同じ版(次の版)で出し、以後は 3 つをいつも同じ版で出す。範囲は「全部」(2026-11-23 00:08Z にユーザーがカードで選んだ)。

## 段 1(測り直し)の進み具合

| # | 内容 | 状況 |
| --- | --- | --- |
| 1-0 | 始める前のゲート(main bc1d960) | 済み(ルートの vitest 280 ファイル / 2,814 件、Solid 版 173 件、ほかのゲートも緑) |
| 1-1 | React 版のテストの棚卸しと、Solid 版の比較テストへ移す | 済み(棚卸し `test-inventory.md`。比較テストを 77 件足し、Solid 版のテストは 20 ファイル・250 件。足した場面で React 版と Solid 版の差は無し。比較テストのハーネスに機能の入れ忘れの見張りを足し、空振りだった 2 つを直した) |
| 1-3 | 4 系統の全体レビュー(Solid 版の全体を、React 版と並べて別視点で読む) | 済み(所見は下の表。Solid 版だけの中 2・低 1 を段 1 で直す) |
| 1-3a | Solid 版だけの所見の修正(R1-1 / R2-1 / R3-1)と、食い違った SSR の所見(R4-1 / R4-2)の確かめ | 済み。R1-1 / R2-1 / R3-1 は 221f400(比較テストを足し、直す前は落ちることを確かめた。R3 のレビューで書いた比較テスト 24 件も入れた = Solid 版のテストは 23 ファイル・279 件)。R4-1 / R4-2 は 1-5 の SSR のゲートで再現し、R4-1 を直した(R4-2 は段 2)。R4-3 の文書も直した |
| 1-2 | React 版と Solid 版のハーネスのページへ同じでたらめな操作を流して比べる(スクリプトはリポジトリに残す) | 済み(`audit/harness/t-diff.mjs`、Chromium)。1 回目(5 つのシナリオ × 種 8 個 × 120 手)は 37 / 40 列で差なし。差は R5-1(Solid 版だけ。直した = 5293a29)と R5-2(React 版だけ、見た目だけ。直さない)、同じ根の R5-3 は段 1 の終わりに相談(下の「でたらめな操作の比べ」)。直した版で種を 16 個に増やして 80 / 80 列・9,600 手で差なし |
| 1-4 | Solid の版の組み合わせ(2.0.0 と最新の 2.0.x)を CI で回す | 済み。CI に `solid-latest` のジョブを足した(`scripts/solid-latest.mjs` が solid-js / `@solidjs/web` / `@solidjs/babel-plugin` を公開から 2 日たった 2.x の最新へ、間接の `@solidjs/signals` / `@solidjs/compiler` も上げて、typecheck / test / test:ssr)。手元で最新(solid-js / web / signals 2.0.3、compiler / babel-plugin 2.0.2)に上げて、Solid 版のテスト 24 ファイル・288 件・SSR 6 ファイル・typecheck がすべて緑。下限の 2.0.0 は今までどおり ci のジョブ |
| 1-5 | Solid らしい使い方の確かめ(非同期の行・`<Loading>`・`<Errored>`・遷移・HMR・複数のグリッド・`<Show>` の切り替えと編集中のアンマウント(AP-12)・SSR と hydration(`initialState`・`ssrCurrentTime`)) | 済み(HMR は 1-6 の実アプリで見る)。SSR と hydration は新しいゲート `pnpm --filter ./packages/solid run test:ssr`(`packages/solid/ssr/`。CI にも足した。下の「SSR とハイドレーションのゲート」)。ほかは `packages/solid/src/idioms.test.tsx`(9 件。下の「Solid らしい使い方」)。新しい所見は無し |
| 1-6 | 実アプリでの確かめ直し(2026-11-22 の 6 本を今の版で作り直し + 新しい 6 本 = 12 本) | 済み。12 本(所見は `findings-S*.md`、下の「実アプリの所見(1-6)」、アプリのソースは `audit/dogfood/2026-11-22-solid-quality/`)。Solid 版だけの高 3(S4-21 / S7-01 / S8-01)・中 3(S5-21 / S2-22 / S4-23)・低(S3-22 / S7-02 / S9-01)と文書を直した。S7-01 / S8-01 は直した版の tarball を入れたアプリの台本でも確かめた(`S7/e2e/min-fill-action.cjs` / `stuck.cjs`、`S8/e2e/min-tz.cjs` / `tz-stale.cjs` / `tz-edit.cjs`)。React 版も同じものは段 2 |
| 1-7 | 記録をまとめ、段 2 の中身をユーザーに相談する | 済み(下の「段 1 のまとめ」)。2026-11-22 にユーザーが「今すぐ 0.1.1 で出す」を選び、PR #78 → Solid 版 0.1.1 を公開(ほかの事項はおすすめどおり)。次は段 2 |

## 段 1 のまとめ(1-7)

段 1 では React 版と core を変えていない(`git diff origin/main -- packages/core packages/react` は空)。

- Solid 版のテスト: 16 ファイル・173 件 → 24 ファイル・304 件(React 版と同じ props・同じ操作で比べる比較テストを含む)。
  SSR とハイドレーションのゲート(7 ファイル・8 件)と、CI の Solid の最新の 2.x のジョブを足した。
- でたらめな操作の比べ(`t-diff.mjs`): 5 つのシナリオ × 種 16 個 × 120 手 = 9,600 手。直した後の版で 80 / 80 列とも差なし。
- 直した Solid 版だけの所見: 高 3(S4-21 / S7-01 / S8-01。S8-01 は S2-22 / R4-2 と同じ根)、中 5(R1-1 / R2-1 / R4-1 / S5-21 /
  S4-23 = 開発時の警告)、低 4(R3-1 / R5-1 / S3-22 / S7-02)、文書 10(R4-3 / S2-21 / S6-22 / S9-01 / S1-21 / R5-3 の回避 /
  S7-04 / S10-02 / S10-03 / S12-02 と診断の一覧)。
- 残る Solid 版だけの所見: R5-3(中。`renderCell` の中の入力欄が 1 文字目でフォーカスを失う)と同じ根の S1-21 は、呼び直す
  条件が書いた挙動と変わるので 0.2.0 の候補。性能の S5-22 / S12-03 / S12-04 は段 3。文書の R4-5 / R4-6 は段 2。
- React 版も同じ所見(段 2): 中 7(S3-21 / S4-22 / S11-01〜05)、低 17(R3-2 / R4-4 / S2-23 / S6-21 / S7-03 / S8-02〜05 /
  S9-02〜04 / S10-01 / S11-06 / S11-07 / S12-01 / S12-05)。2026-11-22 の点検の低 16 件と要望 2・RV5-3 / RV5-4・PageDown の後の
  IME の入力受けの 16px・core へ移す 2 つ・ドキュメント(API_REFERENCE.md と Skill の同梱、主なガイド 8 本の Solid のタブ)と合わせて、
  React 版と core の 1.2.2 と Solid 版を 1 回で出す。
- 挙動の変化(Solid 版の変更履歴の「挙動の変化」): 描く途中で呼ぶ通知を次のマイクロタスクで呼ぶ(S4-21 の修正)、SSR でサーバーが
  行・件数・合計を描かない(S8-01 の修正)。React 版 1.2.1 の RV5-1 と同じく、直すための挙動の変化として patch(0.1.1)に入れる案。

ユーザーに相談すること(2026-11-22): 段 1 の直しを出す時期と版(おすすめ: 今 0.1.1 で出す。高 3 件に別の行への書き込みがあるため)、
R5-3 / S1-21(おすすめ: 0.2.0 で直す)、S4-23(おすすめ: 開発時の警告のまま。描く前の呼び出しを後に回して実行する形はしない =
React 版も描く前は呼べない)、段 2 の範囲(おすすめ: 上の全部)。

## 段 2(React 版も同じ所見と残り)の進み具合

React 版と core を直す段。React 版と core は同じ版で、Solid 版も同じ直しを入れて 1 回で出す(版は下の「決めたこと」)。
見た目や挙動の選び方が要る 6 つは HTML のプレビュー「段 2 の選び方」(https://claude.ai/artifact/FtFP8K4XUsFz2DyVYimvMZ)で
聞いた。返事を待つ間はおすすめの案で作る。バッチごとに 1 コミットで、React 版と Solid 版のテスト(Solid 版は比較テスト)を足す。

| # | 内容 | 所見 | 状況 |
| --- | --- | --- | --- |
| 2-0 | 始める前のゲート(main 6bc163e) | | 済み(ルートの tsc 0 / eslint 0 / vitest 280 ファイル・2,814 件) |
| 2-1 | Shadow DOM | S11-01〜05、S11-06 / S11-07(文書) | 済み: core `utils/shadowDom`(`getEventTarget` / `getActiveElement` / `findElementById` / `getShadowRoot`)を core の 12 の controllers ほかと React / Solid の部品で使う、ツールチップのリスナーを Shadow root にも付ける、`popupContainer: 'auto'` は Shadow root の直下でグリッドを包む要素へ。テストは core 22・React 5・Solid 5(直す前は落ちる)、ハーネス `t-shadow.mjs` は React / Solid とも Chromium 17 / 17(Firefox / WebKit は 2-11)。文書は API リファレンスの「Shadow DOM の中のグリッド」(文字の大きさ = S11-06、iframe = S11-07)・困ったとき・ダイアログ・Solid の README |
| 2-2 | 編集とフォーカス | S3-21 / S7-03 / S8-04(プレビュー 5)/ RV5-3 / S9-02 / S5-02 / S3-03 / PageDown の後の IME の入力受け | 済み: S9-02 範囲の選択が無いときの `Ctrl+C` はアクティブセルの 1 セル(core `clipboardController`)/ S5-02 日付のプリセットを押したらそのボタンへフォーカス(core `popoverSupport` の `keepFocusAfterPress`)/ RV5-3・S3-03 確定の後処理(次のフレーム)の前に次の編集が始まったら後処理をしない(core `editController` の `pendingAfterEdit`。`getUiState` で今の状態も見る)/ S7-03・S8-04 プレビュー 5 の A: 行が rows にあれば打ちかけを確定、無ければ取り消し、フォーカスはグリッドに残す(組み込みのエディタは `registerDraftFlush` で打ちかけを預けるので、絞り込みでエディタが先に外れても書ける。select / custom は預けない)/ S3-21 custom エディタは同じ編集の間は外さない(React は `CustomCellEditor` が最後の ctx を持つ、Solid は memo)/ IME の入力受けは待機中に合わせた後、次のフレームでもう一度合わせる(core `imeInputController`)。テストは React 8・Solid の比べるテスト 5・core 1(直す前は落ちる)、ハーネス `t-v130.mjs` は React / Solid とも Chromium 5 / 5(直す前の `PageDown` は 88〜360px ずれた)。文書は API リファレンス(`Ctrl/Cmd+C` の行・「編集中に行が動いた・消えたとき」・custom の作り直し)・編集とキーボードのガイド・両方の CHANGELOG |
| 2-3 | ハンドルと状態 | S4-22 / S10-01 / S1-03 / S4-09 / S9-04 / S4-03 | 済み: S4-22 外したグリッドのハンドルは状態を変えるメソッドが何もしない(開発時に 1 回警告、`startEditing` は false)、読むメソッド(`get` / `is` / `can` / `export` / `download` で始まる)は外したときの値(core `gridApi` の `dispose`。React は `useControllerLifecycle`、Solid は `connectController` が呼び、`update` で戻る = StrictMode)/ S10-01 `applyState` の列メタが今と同じなら `onColumnsChange` を呼ばない(core `logic/gridState` の `isSameColumnLayout`)/ S1-03 書けるセルが無い貼り付けは `onRowsChange` も履歴も無く、行 / 列も足さない(core `utils/clipboard` が書かなければ同じ配列を返す、`clipboardController` は足さなかった行 / 列のセルを知らせない)/ S9-04 編集できないセルへの空の文字は `onPasteSkipped` に入れない / S4-09 消えた行のキーを行選択から外して `onRowSelectionChange`(core `rowSelectionCommands` が展開行の DF-25 の `createDetailKeysPruner` を使う。前の rows にあったキーだけ、serverSide は外さない、undo で選択は戻らない)/ S4-03 `'selection'` のエクスポートは store の今の選択(core `exportCommands`)、並べ替えの直後は描き直しの後(文書)。テスト: React `SpreadsheetGrid.handleState.integration.test.tsx`(新)・`pasteSkipped` に 2 つ、core `gridApi.test.ts` に 2 つ、Solid `handleState.test.tsx`(新)・parity `history` に 1 つ(どれも直す前は落ちる)。ドキュメント: API_REFERENCE(ハンドル・行選択・CSV・状態・貼り付け)、ガイド selection-clipboard / export / state、Solid の README |
| 2-4 | 列・見出し・メニュー | S12-01(プレビュー 4)/ S12-05 / RV5-4(プレビュー 1)/ R3-2 / S6-21 | 済み: S12-01 プレビュー 4 の A: グリッドの中で列を変えたら(見出しのドラッグ・列メニューの固定 / 隠す・ツールパネルの「列」タブ・リセット)アクティブセルは列のキーに付いていき、隠した列なら同じ位置、選択はアクティブセルの 1 セル(core `engine/columnCommands` の `followActiveColumn`。`columns` の参照が変わった最初の `update` で列の位置を引き直す、1 秒まで。グループ化は今までどおり外す)/ S12-05 端の列へ飛ぶキー(`Home` / `End` / `Ctrl+←→` / `Ctrl+Home` / `Ctrl+End`)で行き先が固定列なら横のスクロールも端へ(core `keyboardController` の `scrollContainerRef`)/ RV5-4 プレビュー 1 の C の考え(中のボタンの上では操作を隠す)で作った。実際の 46px の列ではつまみ(12px)と ⋮(20px)そのものがボタンを覆っていて、A の「余白だけ押せる所にしない」(pointer-events)ではほとんど届かなかったので、ポインタの位置と renderHeader の中のボタン等の矩形を比べて見出しのセルに `data-ssg-header-control-hover` を付け(core `logic/domGuards` の `syncRenderHeaderControlHover`。見出しの pointermove / pointerleave)、120px 未満の見出しだけ CSS で操作を隠す(`hover: hover` のときだけ。余白はそのまま)/ R3-2 フィルターのポップオーバーを列のキーごとに作り直す(React は `key`、Solid は `<Show keyed>`。子の関数は引数を取らないと作り直さない)/ S6-21 ポップアップを開くとき、ほかのグリッドが開いているものを閉じる(core `popoverSupport` の表。列メニュー・右クリックメニュー・列フィルター)。テスト: core `columnCommands` / `keyboardController` / `popoverSupport` / `domGuards`(新)、React `SpreadsheetGrid.columnsMenus.integration.test.tsx`(新。3 つ)、Solid parity `columnsMenus`(新。4 つ。2 つの表は parity の外なので core と React とハーネス)。ハーネス `t-v130.mjs` に S12-05・RV5-4(右寄せ / 左寄せの 46px)・S6-21(`two`)を足し、React / Solid とも Chromium 14 / 14(RV5-4 は直す前に落ちる)。文書: API リファレンス(renderHeader の行・座標の節)、ガイド customization、両方の CHANGELOG。ゲート: tsc 0 / eslint 0 / vitest 287 ファイル・2,852 件 / Solid の型 0・321 件・SSR 8 件 |
| 2-5 | フィルターと日付 | S8-02 / S8-03 / S8-05、S2-23(文書) | 済み: S8-02 列フィルターの日付の入力欄(開始日 / 終了日)もセルの date エディタと同じ書き方(全角・`年月日`・`/`・`.`)を読む(core `logic/editorValues` の `parseFilterDateText`。React / Solid の `FilterDateField`)/ S8-03 日付の値の木の「今日」などの印と相対の範囲を、開いたまま 0 時をまたいでも新しい日で選び直す(プリセットの下書きがある間だけ core `controllers/dateRolloverStore` を動かし、`logic/dateFilterCondition` の `resolveComboReferenceDate` で開いた時刻か新しい日の 0 時を基準にする)/ S8-05 select エディタを開いたまま行が動いたら(並べ替え・行の入れ替え)、候補の一覧を新しいセルの位置へ置き直す(エディタへセルの `top` / `left` を渡し、変わったら測り直す)/ S2-23 SSRM の相対の日付のプリセットはサーバーの日付で解決されること、利用者のタイムゾーンを `getRows` へ一緒に送る例を文書に(API リファレンス、ガイド ssrm の「相対の日付とタイムゾーン」)。テスト: React `FilterDateField.test.tsx`(5 つの書き方。直す前は 4 つ落ちる)・`ColumnFilterPopover.test.tsx`(偽の時計で 0 時をまたぐ。直す前は落ちる)、Solid parity `filtersDates`(新)。ハーネス `t-v130.mjs` に S8-02・S8-03(`page.clock` で 23:59:30 から 60 秒進める)・S8-05(`__setRows` で行を入れ替える)を足し、React / Solid とも Chromium 18 / 18(S8-03 / S8-05 は直す前に落ちる)。文書: API リファレンス(フィルターの日付の入力・SSRM のプリセット)、ガイド filter-sort / ssrm、両方の CHANGELOG。ゲート: tsc 0 / eslint 0 / vitest 287 ファイル・2,858 件 / Solid の型 0・322 件・SSR 8 件 / サイトのビルド 0 |
| 2-6 | 読み上げと見た目 | S6-02 / S6-03 / S6-04(プレビュー 2)/ 展開トグルの名前(要望。プレビュー 3) | 済み(プレビューは答えが無いのでおすすめの案): 展開トグルの名前 プレビュー 3 の A: 「行 7 の詳細を開く」/「行 7 の詳細を閉じる」(英語 `Show details for row 7`。番号は行見出しと同じ = ラベル行を数えない。文言 `showDetails` / `hideDetails` は `GridLocaleTextTemplate<{ row: number }>` に。トグルは列定義の renderCell ではなく React / Solid の renderCellContent が描く。番号に行の並びが要るため)/ S6-02 表の直後の目印(`.ssg-tab-exit`)は Tab の順番に入れている間だけ `aria-hidden` を外す / S6-03 合成列(展開トグル / 行ドラッグ)の見出しに見えない文字(`.ssg-visually-hidden`。内部のクラス)で「詳細」「移動」(下部バーの番地と同じ文言)/ S6-04 プレビュー 2 の B: チップの文字 good `#14703a` / warning `#a14a0b` / critical `#b91c1c`(5 色とも 5:1 以上。暗いテーマは不変)。テスト: React `SpreadsheetGrid.aria.integration.test.tsx`(3 つ)と見出しの空の文字を見ていた 2 つを直した、Solid parity `a11yDetail`(新)。ハーネス `t-v130.mjs` に 6 つ(`AXE_PATH` に axe-core を渡すと axe の aria-hidden-focus / empty-table-header も見る)を足し、React / Solid とも Chromium 26 / 26(axe 0 件)。文書: API リファレンス(文言の表・アクセシビリティの表・トークンの節)、ガイド accessibility / detail-row / theming、両方の CHANGELOG(「変更」に名前とチップの色、「修正」に S6-02 / S6-03)。ゲート: tsc 0 / eslint 0 / vitest 287 ファイル・2,861 件 / Solid の型 0・323 件・SSR 8 件 / サイトのビルド 0 |
| 2-7 | 型 | S4-04 / S4-05(S4-06 は型を狭める = 壊す変更なので 2.0 の候補に記録だけ) | 済み: S4-04 `numberFormatter()` の返す関数の型を名前の無い構造の型 `(params: { readonly value: unknown; readonly [key: string]: unknown }) => string` に(core `logic/valueFormatters`。読むのは value だけ、ほかの項目も受けるので excess property にもならない。`numberFormatter<Row>()` は互換のために型引数だけ受ける)。`numberParser` / `restoreColumnsFromState` の結果は core の名前を含まないので変えていない / S4-05 select エディタの `options`(配列 / 関数の戻り値)と `getFilterOptions` の結果の `options` を readonly の配列に。`types:check` の pnpm の 2 通り(React 版 / Solid 版だけに依存するライブラリの d.ts)に `numberFormatter()` / `numberParser()` / `restoreColumnsFromState` の結果と `valueFormatter: numberFormatter()` の列の配列を足し、直す前に React / Solid とも TS2883 が 3 つずつ出るのを確かめた。型の検査(`type-tests/src/columns.tsx` / `solid/src/grid.tsx`)に `as const` の候補。文書: API リファレンス(`getFilterOptions` / select の `options` / `numberFormatter`)、両方の CHANGELOG。S4-06(`SpreadsheetGridProps<T>` に部品と同じ `T extends object` の制約が無い)は、足すと型を狭める = 壊す変更なので 2.0 の候補(今は包み部品を `<T extends object>` で書けば通る)。サイズ: この時点で `size:check` は上限を超える(full 153.00 / 150.1KB、段 2 の 2-1〜2-7 の合計 +3.15KB)。上限は 2-11 で実測 + 0.5KB へ(ユーザーへ伝え済み)。ゲート: tsc 0 / eslint 0 / vitest 287 ファイル・2,861 件 / types:check 全 ok(21 通り)/ Solid の型 0・323 件・SSR 8 件 / サイトのビルド 0 |
| 2-8 | CSV に出さない列 | 要望(プレビュー 6) | 済み(プレビュー 6 の A。答えが無いのでおすすめの案): 列の `exportable: false` で CSV / TSV の書き出し(scope `'selection'` も)と `getExportData` から外す。範囲のコピー(`Ctrl/Cmd+C`)には出す(core `engine/exportCommands` の出力の列から合成列と一緒に外す。小計の行・合計行の列も同じ列)。テスト: React `SpreadsheetGrid.export.integration.test.tsx`(1 つ。view / raw の TSV / getExportData / selection / Ctrl+C)、Solid parity `exportColumns`(新。`export` の機能を入れて)。文書: API リファレンス(列の表・CSV エクスポートの節)、ガイド export の「列の除外」、両方の CHANGELOG の「追加」。ゲート: tsc 2 つ 0 / eslint 0 / vitest 287 ファイル 2,862 件 / Solid の typecheck 0・test 30 ファイル 324 件・test:ssr 8 件 / website の next build 0 |
| 2-9 | core の中 | R4-4、React 版と Solid 版で同じ処理 2 つ(右クリックメニューの引数・行ドラッグの列の決め方)を core へ | 済み: R4-4 は core `engine/gridApi` の `refreshServerSide` / `retryServerSideLoads` の開発時の警告から入口の名前(`/lite`)を外した(Solid 版の CHANGELOG の「修正」)。右クリックメニューの params(`buildCellContextMenuParams` / `buildBodyContextMenuParams`)を core `logic/contextMenuTarget` へ、行ドラッグのゴーストのラベルの列・落とせるかの判定・掴んだ行の控えと探し直しを core `logic/rowDragTarget`(新)へ寄せ、React 版の `features/contextMenu.tsx` / `features/rowDrag.tsx` と Solid 版の `features/contextMenu.ts` / `primitives/rowDrag.ts` はメモ化と接続だけに(作り直す時機は前と同じ)。テスト: core `contextMenuTarget.test.ts`(4 つ足した)・`rowDragTarget.test.ts`(新。9 つ)。ゲート: tsc 2 つ 0 / eslint 0 / vitest 288 ファイル 2,875 件 / Solid の typecheck 0・test 30 ファイル 324 件・test:ssr 8 件 |
| 2-10 | ドキュメント | S9-03 / S5-04 / S4-07 / S4-08 / S3-01 / S3-02、Solid 版の npm に API_REFERENCE.md と Skill(R4-5)/ R4-6、主なガイド 8 本の Solid のタブ | 済み: API リファレンスとガイドに、S9-03(select の列も値で集計に数える → `selectionAggregate: false`。選択範囲の集計 / selection-clipboard)、S5-04(グループ行の平均の小数で狭い列が切れる → `numberFormatter({ maximumFractionDigits })`。行グルーピング / grouping)、S4-07(jsdom + user-event で number の列に数字から打つと逆順 → 1 文字目の後は入力欄へ `user.type`、または `Enter` / `F2` + `clear` + `type`。S4 のアプリで React / Solid とも確かめた。テスト支援 / testing)、S4-08(set の候補は値のまま → `filterOptions` に `{ value, label }`。値と表示名が別の列 / value-labels)、S3-01(custom エディタが自分で出すポップアップは囲むダイアログへ。popupContainer / dialogs・customization)、S3-02(`ctx.initialText` はダブルクリック / `Enter` / `F2` では `String(value ?? '')`。セルエディタ / editing・customization)。R4-5: Solid 版の npm に `API_REFERENCE.md`(React 版から `scripts/emit-docs.mjs` が build:lib で写し、先頭に Solid での読み替え。git には入れない)と Skill `skills/spreadsheet-grid-solid/SKILL.md` を同梱、`src/skill.test.ts`(新。7 つ)、README(英語 / 日本語)に「AI コーディングツールで使う」、サイトの ai-assistants / solid。R4-6: `createSpreadsheetGrid` に JSDoc。Solid のタブ(コードの `tab="React"` / `tab="Solid"`): quick-start / editing / state(3 つ)/ large-data / row-drag(2 つ)/ validation / find / testing(「最初のテスト」を新しく。例は S4 のアプリで React / Solid とも通した)。ゲート: tsc 2 つ 0 / eslint 0 / vitest 288 ファイル 2,875 件 / Solid の typecheck 0・test 31 ファイル 331 件・test:ssr 8 件 / build:lib 0(Solid 版の pack に API_REFERENCE.md と skills が入る)/ website の next build 0(タブが出る) |
| 2-11 | 確かめ | 上限(直し終えた後の実測 + 0.5KB)、別視点のレビュー 2 系統、3 つのブラウザのハーネス(React 版 / Solid 版)、`t-diff.mjs`、実アプリの確かめ直し | 済み: 実アプリ = 段 1 の 12 本を pack した tarball へ入れ替えてビルドと操作を回し直した(回帰は Solid 版だけの 1 つ: 右クリックメニュー / 列メニューの項目から開いたツールパネルへ移ったフォーカスがグリッドへ戻される。Solid 版は `onSelect` の後の反映でツールパネルをその場で描くので、メニューを閉じるときのフォーカスの戻しが後から来ていた。core `popoverSupport` の `isFocusInPopupOpenedFromMenu` でツールパネル / 列フィルターにフォーカスがあれば戻さない。Solid の比較テスト `focus.parity` に 1 つ)。別視点のレビュー A(core と React 版): グリッドの中に置いた Web Components(open の Shadow root)のイベントの判定が中の要素ではなく host を見るようになっていた回帰 → `getEventTarget(event, context)` は context の木へ付け替え、深い要素は `getDeepActiveElement` でフォーカスを戻すときだけ / 全選択(exclude)で除いた行を消して元に戻すと選ばれた状態で戻る → 除いたキーを覚えて戻ったら除き直す(`rowSelectionCommands`)/ 列の追従はインラインの `columns` の新しい配列が先に届くと待つのをやめていた → 同じ位置にある間は期限まで待つ、待つ間に動かしたらやめる(`columnCommands`)/ Escape の Mantine 向けの印を target と元の target の両方へ / 文書: 外したハンドルの `getScrollPosition()` / `isAtBottom()`、CHANGELOG の読む側への影響(readonly の `options`・`showDetails` の型)、Shadow root を包む要素が切るときの文書。別視点のレビュー B(Solid 版と文書。高・中なし): 低 9 件を直した(Solid の CHANGELOG に PageDown、英語の README と solid.mdx の追いつき、README の大きさの数字、custom エディタの打ちかけが書かれないことがある場合の文書、Skill の行数・注意点・SSR と README の見出しのテスト、emit-docs の読み替え 4 つと版の注記、ガイドの文言 2 つ)。上限は実測 + 0.5KB(切り上げ)= full 153.9 / lite 90.8 / standard 114.3 / solid-full 167.0 / solid-lite 94.7 / solid-standard 122.1KB(実測 153.35 / 90.23 / 113.77 / 166.42 / 94.15 / 121.54KB。1.2.1 から full +3.50KB、ai 14.03KB は不変)。ゲート: ルート 288 ファイル・2,880 件、Solid 31 ファイル・333 件 + SSR 8 件、examples / types 全部 ok、website のビルド 0。ハーネス(23 本): Chromium React 995 / 995・Solid 995 / 995、Firefox(geckodriver)React 908 / 908・Solid 908 / 908、WebKitGTK React 910 / 913・Solid 910 / 913(既知の BR-3・BR-4 の 3 件だけ。Solid の `agg(big)` の 200ms は前からの揺れで、回し直して通った)。`t-v130` は Firefox / WebKit でも回るように直した(WebDriver では axe を中身の評価で入れる・`Ctrl+Home` の後にハンドルでも先頭へ・headless の Firefox は `hover: none` なので RV5-4 は SKIP)。`t-diff.mjs` は 40 / 40 の列で差なし(4,800 手)。 |
| 2-12 | PR と版上げ | React 版と core、Solid 版 | PR #80 を作った(2026-11-22)。マージはユーザーの OK を待つ。版上げ(React 版と core 1.3.0 = `pnpm run version:minor`、Solid 版 0.1.2 = 手で 1 コミット)は公開の準備ができたときに main で |

## 段 3(React 版と完全に並べる)の進み具合

Solid 版だけに残った違い(段 1 の所見の R5-3 / S1-21・性能の S5-22 / S12-03 / S12-04、2026-11-22 の点検の S1-01、README の「React 版との違い」)を
埋める段。終わったら Solid 版を React 版・core と同じ版で出す(上の「決めたこと」)。作業のブランチは `claude/project-thread-lw8d5c`。
バッチごとに 1 コミットで、Solid 版のテスト(できるものは React 版との比較テスト)を足す。

| # | 内容 | 所見 | 状況 |
| --- | --- | --- | --- |
| 3-0 | 始める前のゲート(main 498eef9 = 1.3.0 / Solid 0.1.2 の公開物) | | 済み(PR #80 の CI が緑。その後は版の番号と変更履歴の見出しだけ) |
| 3-1 | Solid 版の `/ai`(`GridAskBar` / `useGridAsk`。React 版 `src/ai/` と同じ見た目・同じ core の `createGridAskRequest` / `readGridAskAnswer`) | README の「ありません」、S13-01(新) | 済み: 入口 `/ai`(`src/ai.ts`・`src/ai/createGridAsk.ts`・`src/ai/GridAskBar.tsx`。名前は Solid の慣例で `createGridAsk`、`grid` はハンドルか、それを返す関数)、`/locales/en` に `gridAskLocaleTextEn`。テストは React 版の GridAskBar.integration の 28 本を写した 31 本と、React 版と同じ操作で DOM・フォーカス・状態・通知を比べる `parity/ai.parity.test.tsx` 6 本(送る〜外す〜元に戻す / 使えなかった部分 / 列の表示 / 失敗と送り直し / 聞いている間と Esc / 英語)。dist は `ai.js` と `source/ai.jsx`(本体とファイルを共有しない = `checkSolidDistShape` が検査)、大きさ `solid-ai` 14.75KB(上限 15.3KB)。`types:check` の Solid 版の入口に `/ai`(`type-tests/solid/src/ai.tsx`)。文書は Solid 版の README・Skill・emit-docs の読み替え・サイトの「Solid で使う」とガイド ai-filter の Solid のタブ。S13-01 は下 |
| 3-2 | store で持つ行(`rows={state.rows}`)で元に戻すが効く | S1-01 | 済み: store のときはグリッドの計算にプロキシではなく中身(`snapshot`。手を付けていない部分は元の配列と行そのもの)を渡す(`primitives/storeRows.ts`)。`s.rows = next` / `reconcile(next, 'id')(s.rows)` で戻せば元に戻すが効き、中を直接変えたとき(項目・push・splice)は外からの変更として映る(履歴は消える = React 版で親が差し替えたとき)。中の変化は、並びを配列の `$TRACK` で、行の中身を `deep` で 300 行ずつ別の計算で追う(1 つの計算の元を 2,000 より下に = HUGE_FAN_IN を出さない)。追いかけは行のプロキシごとに作り、中の行が同じ組は使い回す。開発時の「store を渡した」警告は消し、5 万行を超える store のときだけ signal を勧める。計測(Node、Solid の本番ビルド): 1 万行で編集 1 回 21ms・項目の直接の変更 18ms、10 万行で 122ms / 108ms・+77MB、100 万行で 2.3 秒 / 1.6 秒・+762MB(大半は `snapshot` の 1 行ずつの走査)。テストは `storeRows.test.tsx`(6 本。2,500 行で知らせが出ない)・`parity/storeRows.parity.test.tsx`(6 本。`s.rows = next` と reconcile の両方で React 版の useState と DOM・通知が同じ)・idioms の action で保存する形(store に通知の中で書く / action の中で書く)。比べるテストの全部(257 本)を `PARITY_SOLID_ROWS=store` で回して同じ結果(reconcile は、モジュールの定数の行を使い回す 4 本だけ続けて回すと前の場面の書き込みを持ち越す = Solid の store は同じ元のオブジェクトを包むと中身を共有する。1 本ずつなら同じ)。store の形を外すと 12 本すべてが落ちることも確かめた |
| 3-3 | `renderCell` とバーの関数を、読んだ値が変わったときだけ呼び直す(挙動の変化) | R5-3 / S1-21 | 済み: `renderCell` の文脈の `row` / `value` を、位置や状態と同じく読んだときに引く(`SpreadsheetGrid.tsx` の `renderCellContent`。値は行ごとの memo)。JSX の中で読めばその式だけが追従し、セルの中身は列が変わったときだけ作り直す(セルの中の入力欄で打つたびに `ctx.setValue` してもフォーカスが外れない = R5-3)。本体で読んだ値はその値が変わったときだけ呼び直す。バーの文脈の `derivedSummary` は項目ごとの memo(`createLiveObject(DERIVED_SUMMARY_KEYS, …)`。本体で 1 つだけ読んだバーが、セルを押しただけで作り直されない = S1-21)。**挙動の変化**: 自分の部品の本体の一番上で `props.ctx.value` を読む書き方は追従しなくなる(Solid が `STRICT_READ_UNTRACKED` を出す。Solid 版の CHANGELOG と README に書いた)。テスト: `cellContent.test.tsx` の 3 本(前のコードでは落ちる)、`parity/liveContext.parity.test.tsx` の 2 場面(React 版と同じ要素のまま)。Solid 版のテストは 391 本すべて緑、SSR 8 本。Solid 版の大きさは段 3-2 と合わせて +0.56KB(段 3 の途中なので Solid 版の 3 つの上限を今の値 + 0.5KB に。3-9 で詰める) |
| 3-4 | 遠くへのスクロール・列の多い表の速さ・メモリ(行とセルを位置で使い回す形を試す) | S5-22 / S12-03 / S12-04 | 済み(差は残る): 測り方は `audit/harness/perf-compare.mjs`(2 つのハーネスの本番ビルド。列の多い表は `?wide=190`)。見つけた原因と直し: ① バーの文脈の `filteredRows` を、誰も読まないのにアクティブセルが動くたびに作っていた(`createLiveObject` の memo が読まれる前から計算する = Solid 2 の memo は既定で先に計算する。`lazy: true` に。さらに表示順の配列の参照で受ける = `orderArray`)。100 万行の `Ctrl+End` で 1 回約 30ms。② セルの `class` を配列とオブジェクトで渡すと Solid が語ごとに `classList` を足し引きする → 1 つの文字列(`joinClasses`。React 版と同じく `className` を書く)。③ 飾りの無い列のセルは Show 2 つ(データバー / auto-height の器)と書式・メモ・検査の部品を作らない(`isPlainCellColumn`。形はセルのキーに入れ、変わったら作り直す)。④ `readOnlyCell` を memo にしない。試して効かなかったもの: 検索の印をセルの中身の式で読む(React 版と違って中身の span を作り直すので戻した)・`pointerenter` の委譲。結果(Chromium、本番): `Ctrl+End` 72 → 47ms(React 版 38ms)、約 200 列で縦に 3000px ずつ 120 回飛ぶ JS 5.8 → 4.0 秒(React 版 1.8 秒)、スクロールした後のヒープ 27.5 → 21.2MB・ノード 13.3k → 7.7k(React 版 13.5MB・6.7k)。表から外れたノードを持ち続ける S12-04 は、ほぼ Show の fallback の分で、残りは Solid が差し込みの印に使う文字ノード(React 版より約 650 多い。増え続けない)。残った差は見えているセルごとの Solid の計算(For の 1 項目・memo・effect)の作りと片付けと GC で、README の「React 版との違い」に「速さ」として書いた。テスト: `cellShape.test.tsx`(filteredRows を作らない = 前のコードでは落ちる / 列に飾りを足す・外す / auto-height の器)。Solid 版のテストは 394 本すべて緑 |
| 3-5 | SSR でサーバーも行を描く(今はハイドレーションの後に描く = S8-01 の直し) | README の SSR の違い | 済み: サーバーは React 版と同じく行(最初の行の行番号と固定列のセル)・件数・合計を描く。形: ハイドレーションする骨組みは今までどおり行を空として描き(サーバーとクライアントで同じ = S8-01 の直しを保つ)、サーバーでだけ `display: none` で隠して、すぐ後に行を入れた同じグリッドの写し(`NoHydration` の中。ハンドルを渡さず、通知は何もしない関数)を描く(`primitives/serverSnapshot`)。ブラウザでは描き終わった後の最初(onGridMounted)に写しを外して骨組みを見せ、行へ切り替える(同じタスクの中なので、行の無いフレームは画面に出ない)。サーバーサイドの行モデル(`dataSource`)は写さない。**挙動の変化**: サーバーの HTML に `.ssg-root` が 2 つ。試さなかった形: ハイドレーションの後にグリッドをまるごとブラウザで作る(ハンドルがハイドレーションの間に渡らず S5-01 が戻る)、行に依る部分だけを写す(骨組みの属性の食い違いを直せないので、2 つめの計算が要るのは同じ)。テスト: SSR 10 件(`server.test.ts` に 3 件 = 写しの中身・サーバーのタイムゾーンの固定列・`dataSource` は写さない。ハイドレーションの 6 件は写しが外れて骨組みだけが見えることを共通で見る。外す処理を消すと 6 件落ちる)。SSR の台本の固定の時計(`render.mjs` の FixedDate)が、行の本物の Date を Date と見ていなかったのも直した(これまでサーバーは行を計算しなかったので表に出なかった)。実アプリ S8(SSR の stream / string。npm の 1.3.0 の代わりに pack した tarball): JS なしは写しが見える(21 行・「行 687 / 687」)、JS ありは写し(21 行)→ 骨組み(38 行)の間に行の無いフレームが 0、タイムゾーンをずらした `tz-stale.cjs` も食い違い 0・警告 0。Solid 版の大きさ +0.37KB(solid-full 167.51KB) |
| 3-6 | 開発時の Solid の知らせ(`EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE`)を減らす | docs/solid の診断の一覧 | 済み: `EFFECT_RELAY_TEAR` を console に出さなくした(Solid の計測は effect の apply が引数を受けるかで「派生した状態」(3 回目から警告)か「グラフの外を読んで書く = 測ることの手間」(console に出さない)かを見分ける。グリッドの effect は core のコントローラとグリッドの store の reducer で後者なので、値は引数で受けたまま残余引数にして引数の数を 0 にした = `primitives/effectApply` の `outsideGraphApply`。`connectController` と `reconcileColumnWidths` / `clampSelectionToRowCount`)。`t-solid-diagnostics.mjs`(Solid のトラックを入れた開発ビルド)で、直す前は 10 種類(RELAY_TEAR 7 + WRITES_OWN_SOURCE 3)、直した後は `autoHeightMeasurer` / `activeRowFollow` / `edit` の `EFFECT_WRITES_OWN_SOURCE` 3 種類だけ(自分の入力を書き換える形は引数の数に依らず、直すには core の作りを memo へ変える = React 版も変わるので見送り)。既知の表も 3 つにした(RELAY_TEAR が出たら回帰)。利用者の通知(`onActiveCellChange` の中で signal を書く = 点検 S7)も同じく出ない。文書: Solid 版の README(英語 / 日本語)・サイトの Solid のページ・`docs/solid/README.md` の表・Solid 版の CHANGELOG |
| 3-7 | ガイドのコード例のすべてに Solid のタブ(今は主なガイド 8 本) | | まだ |
| 3-8 | 版をそろえる仕組み(`bump-version.mjs` に Solid 版、`examples/solid`、リリースの手順、変更履歴、release.yml、版の方針の文書) | | まだ |
| 3-9 | 確かめ(上限、別視点のレビュー、3 つのブラウザのハーネス × 2、`t-diff.mjs`、12 本のアプリ) | | まだ |
| 3-10 | PR と版上げ | | まだ |

### 段 3 で見つけた所見

- **S13-01(中、Solid 版だけ、直した)** グリッドの `ref` に signal の setter を渡すと(`const [grid, setGrid] = createSignal(); <SpreadsheetGrid ref={setGrid} />`)、
  Solid が `REACTIVE_WRITE_IN_OWNED_SCOPE` を投げてグリッドが描かれなかった。ハンドルを渡す関数を部品の本体(owner の中)で呼んでいたため。
  `@solidjs/web` の DOM の ref と同じく owner の外(`runWithOwner(null, …)` + `untrack`)で呼ぶようにした(時機は今までどおり = S5-01)。
  `/ai` のテスト(`ref={setHandle}` でバーへ渡す形)で見つけた。`idioms.test.tsx` の「ref に signal の setter を渡す」。

## 全体レビューの所見(1-3)

4 系統(R1 = 本体のシェルと配線、R2 = エディタと編集、R3 = ポップアップと機能、R4 = パッケージ・SSR・ドキュメント)。
それぞれ Solid 版のコードだけを渡し、React 版と比べて読んでもらった。再現のテストは各系統の作業用のコピーで書いたもの。

| ID | 重さ | Solid 版だけか | 内容 | 状況 |
| --- | --- | --- | --- | --- |
| R1-1 | 中 | Solid 版だけ | 自作の上部 / 下部バー(`renderTopBar` / `renderBottomBar`)の関数が 1 回だけ追跡されずに呼ばれ、関数の本体で ctx を読む・分割代入すると後から更新されない(README / ドキュメントの「ctx は読むたびに今の値」と食い違う) | 済み(221f400。追跡して呼び、文脈の値はキーごとに memo) |
| R2-1 | 中〜高 | Solid 版だけ | 編集中に上へ行が足され、編集している行の位置が一瞬グループ行になると、エディタの種類が text に倒れて作り直され、number / date は打ちかけを失い、複数行はフォーカスを失う(React 版は列からエディタを決める) | 済み(221f400。エディタの種類と揃えは列から) |
| R3-1 | 低 | Solid 版だけ | 列メニューの小メニュー(列の固定)の開閉を列が変わっても消さないので、その列へ戻ると開いたまま出る | 済み(221f400) |
| R3-2 | 低 | React 版も同じ | ツールパネルの ✎ で set の列を切り替えても、列フィルターの検索の文字が残る | 済み(段 2-4) |
| R4-1 | 中 | Solid 版だけ | hydration でサーバーの root の class(テーマ・動き の 'auto')のまま解決し直さない(再現した。R1 の確かめが通ったのは、同じページで 2 回目の `hydrate()` がサーバーの要素を使わずに描き直していたため) | 済み(OS の設定の store をハイドレーションの間は getServerSnapshot から始める。`ssr/hydrate.themeMotion.test.tsx`) |
| R4-2 | 中 | Solid 版だけ | 相対日付のプリセットを SSR と hydration で使い、サーバーとクライアントで今日が違うと行と件数がサーバーのまま残り、使われなかった要素の警告が出る(再現した。React 版はクライアントで描き直して戻る) | 段 2(ハイドレーションの間はサーバーの基準日で絞り込む。core の列フィルターの段階へ基準日を渡す口が要る。`ssr/hydrate.relativeDate.test.tsx` は it.fails で待つ) |
| R4-3 | 低 | Solid 版だけ | README とサイトの SSR の例の import の誤り(`createRequestEvent` は `@solidjs/web`)と SolidStart の書き方の食い違い | 済み(README の「SSR(SolidStart など)」も外した) |
| R4-4 | 低 | core | core の開発時の警告が `/lite` の名前を出す(Solid 版では入口の名前が違う) | 段 2 |
| R4-5 | 低 | Solid 版だけ | Solid 版の npm に API_REFERENCE.md が無く、main のものへリンクしている | 段 2(ドキュメント) |
| R4-6 | 低 | Solid 版だけ | `createSpreadsheetGrid` に JSDoc が無い | 段 2(ドキュメント) |

ゲートの穴として、Solid 版の SSR / hydration のゲートが無いこと、`size:check` が import 条件のビルドだけを測ることも見つかった
(SSR は 1-5 でゲートを作った。サイズは段 2 で扱う)。

## でたらめな操作の比べ(1-2)

`audit/harness/t-diff.mjs`(使い方は `audit/harness/README.md` の「React 版と Solid 版へ同じでたらめな操作を流して比べる」)。
React 版(5177)と Solid 版(5179)のハーネスのページへ、種から決まる同じ操作の列(クリック / Shift・Ctrl+クリック /
キー 28 種 / 打って確定 / ダブルクリック / 貼り付け / 見出し / スクロール / 行のチェック / 開閉 / フォーカスを外す /
Shift+F10)を流し、1 手ごとに描いたセル(文字・選択・クラス)・エディタ・ポップアップ・バーの文字・フォーカス・
ハンドルの状態・行のデータ・通知を比べる。シナリオは basic / grouping / label(10 行ごとにラベル行)/ detail / rowdrag。

| ID | 重さ | Solid 版だけか | 内容 | 状況 |
| --- | --- | --- | --- | --- |
| R5-1 | 低 | Solid 版だけ | checkbox の列のセルをダブルクリックしても `onCellDoubleClick` が呼ばれない。1 回目のクリックで値を反転すると行のオブジェクトが変わり、セルの中身(チェックボックスの要素)を作り直すので、2 回目のクリックとダブルクリックが外れた要素に届く(detail seed=4 手 13、rowdrag seed=8 手 16。basic でも起きる) | 済み(checkbox 列の既定のセルは行を描いた後に読み、反転しても要素を使い回す。比較テスト `edits.parity.test.tsx` の「checkbox 列のダブルクリック(R5-1)」は直す前に落ちることを確かめた) |
| R5-2 | 低 | React 版だけ | 動かないポインタの下で表がスクロールしたとき(select のエディタを Enter で確定して下へ移り、表が追従した等)、React 版は行ホバーの印が前の行に残る(マウスを動かせば直る)。React の合成イベントは、外れた要素を起点にした pointerover から enter を出さないため。Solid 版はセルの pointerenter をそのまま受けて今の行へ移す(rowdrag seed=6 手 67) | 直さない(見た目だけ。比べでは行 / 列のホバーの印のクラスを既定で外した) |
| R5-3 | 中 | Solid 版だけ | R5-1 の調べで見つけた同じ根の別の場面: `renderCell` は行のオブジェクトが変わるたびに作り直すので、セルの中の入力欄で打つたびに `ctx.setValue` すると、1 文字目で入力欄が作り直されてフォーカスが外れる(jsdom で再現。React 版は同じ要素を使い回すので打ち続けられる)。ボタンで値を切り替える `renderCell` のダブルクリックも R5-1 と同じく外れる。README とサイトの「`renderCell` は行・値・列が変わったときに呼び直す」どおりの動き | 1-7 で相談(おすすめは 0.2.0 で直す。それまでは README とサイトに回避の書き方 = 打つ間は部品の中の signal に持ち、確定で `setValue`。直すなら `ctx.row` / `ctx.value` を読んだときに引く形にして、関数の本体で読んだときだけ呼び直す = R1-1 のバーと同じ。本体で読まない部品の一番上で値を読む書き方は古いままになるので、挙動の変化として書く) |

## SSR とハイドレーションのゲート(1-5)

`pnpm --filter ./packages/solid run test:ssr`(`packages/solid/ssr/`。約 10 秒。CI の Solid の手順にも足した)。

- `globalSetup.ts` が `render.mjs` を子のプロセスで 1 回走らせ、`fixtures.tsx` の表を Vite の SSR(`@solidjs/vite-plugin` の
  `ssr: true`)と `renderToString` で描く。描く時刻は固定(2026-11-22T12:00Z)、サーバーのタイムゾーンは UTC+14
  (`Pacific/Kiritimati`)で、クライアント(UTC-11 `Pacific/Pago_Pago`)と今日が 1 日ずれる。描いている間の `new Date()` /
  `Date.now()` の呼び出しも数える。
- `server.test.ts`: `initialState` の絞り込みと並べ替えがサーバーの HTML から効く / 日付の条件が無い表は描いている間に現在時刻を
  読まない(React 版の `initialState.ssr` / `ssrCurrentTime.ssr` と同じ)。
- `hydrate.<表>.test.tsx`: サーバーの HTML をハイドレーションできる形(`hydratable`)で変換した部品でハイドレーションし、
  警告(Solid の「使われなかったサーバーの要素」を含む)もエラーも無いこと、サーバーの root の要素をそのまま使うことを確かめる。
  Solid はページで 1 回のハイドレーションを前提にし、2 回目の `hydrate()` はサーバーの要素を使わずに描き直すので、
  表 1 つにつきファイル 1 つにしている(R1 のレビューの確かめが R4-1 を見逃したのはこのため)。
- 分かったこと: Solid 2.0 はハイドレーションでサーバーの要素の class や文字を書き直さない。クライアントだけで決まる値
  (OS の設定・今日の日付)は、ハイドレーションの間はサーバーと同じ値で描き、後から切り替える必要がある
  (Solid の `isHydrating()` の説明どおり)。

## 実アプリの所見(1-6)

前半の 6 本(S1〜S6。前回の 6 本を今の版で作り直し、新しい使い方を足した)の所見の詳細は `findings-*.md`。Solid 版だけのもの:

| ID | 重要度 | 内容 | 状況 |
| --- | --- | --- | --- |
| S4-21 | 高 | 通知(`onRowsChange` など)の中で `action` を始めると、action が終わるまでグリッドの表示が止まり、保存中の 2 回目の編集が前の行へ入る | 直した(下の「S4-21 の直し方」) |
| S5-21 | 中 | 行を非同期の `createMemo` で持つと、取り直しの間グリッドが止まる | 直した(rows を `latest()` で写して読む) |
| S3-22 | 低 | 作り直す props のオブジェクトを spread で渡すと開発時に `STRICT_READ_UNTRACKED` | 直した(`props.ref` を `untrack` で読む) |
| S2-21 | 低 / 文書 | SSR のサーバーを `NODE_ENV=production` なしで動かすとハイドレーションがグリッドを引き継げない | README と Solid のページに書いた |
| S6-22 | 低 / 文書 | 展開行の入力欄の初期値の書き方 | README と Solid のページに書いた(`createSignal(untrack(() => ctx.row.x))`) |
| S2-22 | 中 | SSR で日付の表示がサーバーとずれる | 直した(S8-01 と同じ。下の「S8-01 の直し方」) |
| S1-21 | 低 / 文書 | バーの関数の本体で `derivedSummary` の 1 つ(`sortSummaryText` など)を読むと、要約のどれが変わっても(セルを押しただけでも)バーを作り直す。`derivedSummary` が 1 つの値のため(R5-3 と同じ根) | README と Solid のページに書いた(直すなら R5-3 と一緒に 0.2.0) |
| S5-22 | 低 / 性能 | 100 万行の Ctrl+End / Ctrl+Home が React 版の約 2 倍 | 段 3 の候補 |
| S4-23 | 中 | 行が来る前の `<Loading>` の中のグリッドへのハンドルの呼び出しが黙って捨てられる | 開発時の警告と README にした(描く前は列も行も知らないので効かない。呼んだ所で後に回す形は段 2 で相談) |

後半の 6 本(S7〜S12。新しい使い方: 非同期と遷移・日付と SSR・経費精算・2 つのグリッドの連動・Shadow DOM と iframe・列の多い表)は
`findings-S7-S10.md` / `findings-S8-S11.md` / `findings-S9-S12.md`。0.1.0 の HEAD(S4-21 の直しの前)で作った。Solid 版だけのもの:

| ID | 重要度 | 内容 | 状況 |
| --- | --- | --- | --- |
| S7-01 | 高 | `fillHandle` のある表で rows を `createOptimistic` で持ち action の中で書くと、保存中に編集を始めた所で例外(`<Show>` の古い値の読み取り)、反応が止まる | 直った(S4-21 と同じ原因。Solid 2.0.3 で前の版は落ち、今の版は通るテストを足した = `idioms.test.tsx` の S7-01。実アプリの再現の台本も今の版で通る) |
| S8-01 | 高 | SSR でサーバーとブラウザのタイムゾーンが違い、Date の列に日付の範囲の条件を `initialState` で入れると、固定列にサーバーの行の文字が残り、そのセルの編集が別の行に入る(S2-22 / R4-2 と同じ根) | 直した(下の「S8-01 の直し方」。R4-2 の `it.fails` も `it` に戻した) |
| S7-02 | 低 | 行の非同期の `createMemo` が描いている間に失敗すると、同じエラーが 12〜13 回出る | 直した(写しの effect が `<Errored>` へ渡す。S5-21 の写しの後は `<Errored>` に届かず前の行のまま残っていたのも、同じテストで見る) |
| S9-01 | 低 | custom エディタの部品の本体で `ctx.value` / `ctx.row` を読むと開発時に `STRICT_READ_UNTRACKED` | README と Solid のページに書いた(展開行の S6-22 と同じ。`ctx` は読んだときに引く) |
| S12-03 | 低 / 性能 | 197 列 × 2 万行でホイールと編集の反応が React 版より重い(S5-22 と近い) | 段 3 の候補 |
| S12-04 | 低 / メモリ | React 版よりヒープが 10〜19MB 多く、表から外れたノードを約 8 千持ち続ける(増え続けはしない) | 段 3 の候補 |
| S7-04 / S10-02 / S10-03 / S12-02 / S8 の診断 | 文書 | 非同期の行と保存の書き方、`getValue` / `renderCell` の本体で外の signal を読んだとき、診断の一覧に `activeCellNotifier` / `clampSelectionToRowCount` | README と Solid のページに書いた(`activeCellNotifier` は S4-21 の直しで通知を後のマイクロタスクで呼ぶようになったので載せず、一覧は「名前は例」とした) |

React 版も同じもの(段 2): 前半の S3-21 / S4-22 / S2-23 / S6-21 に加え、S7-03 / S8-02〜05 / S9-02〜04 / S10-01 /
S11-01〜07(Shadow DOM の中で効かないもの 4 つは中)/ S12-01 / S12-05。

S7 の実アプリでは、もう 1 つ「保存の後の取り直しの間、直した値が一瞬元に戻る」を確かめた。行を `createDeferred` で
読むアプリで、action の中の `refresh()` の取り直しの間は、グリッドを通さずに JSX で読んでも元の値になる(Solid の
`createDeferred` の意味どおり)。非同期の `createMemo` で読むと戻らない。グリッドの不具合ではない。

### S8-01 の直し方

Solid のハイドレーションはサーバーの要素をそのまま使い、クライアントで違う値になった文字・属性・行を直さない(R4-1 と同じ)。
サーバーとブラウザでタイムゾーンや今日が違うと、日付の条件の結果と Date の値の書式が変わり、固定列(サーバーで描く左の
ペイン)にサーバーの行の要素が残っていた(使われなかった要素の警告も出る)。React 版は食い違いをクライアントで描き直す。

直し方(`SpreadsheetGrid.tsx` の `hydrated`): サーバーで描くときとクライアントのハイドレーションの間は行を空として描き、
描き終わった後(`onGridMounted`。コントローラの最初の update より先に登録)に行へ切り替える。行に依らない骨組み(見出し・
上下のバーの絞り込み / 並び替えの表示)だけがサーバーの HTML に出て、行・件数・合計は切り替えた後のふつうの描画で出る
(件数の文字「行 0 / 0」と「行がありません」はハイドレーションの間は出さない)。サーバーで描かない使い方は最初から行を描く。
SSR のテストは、サーバーの HTML に行と件数が無いこと(`server.test.ts`)と、タイムゾーンが違うときに固定列がクライアントの
行を出し警告が無いこと(`hydrate.pinnedDates.test.tsx`、`hydrate.relativeDate.test.tsx`)を見る。直しを外すと 4 つ落ちる。

試さなかった形: サーバーの行の並びを HTML に書いてハイドレーションの間だけ使う(大きな表で HTML が膨らむ、書式の違いは
直らない)、食い違いを見つけたら作り直す(React 版の形。Solid には作り直す口が無い)。

### S4-21 の直し方

Solid 2.0 では、同じ同期の処理(フレーム)の書き込みはまとめて反映され、その中で `action` が始まると、そのフレームの
書き込みは(action を始める前のものも)action が終わるまで保留される。グリッドの通知はグリッドの書き込みの途中で呼ぶので、
利用者が通知の中で action を始めると、グリッドの書き込み(エディタを閉じる・アクティブセルを動かす)も保留されていた。
さらに、保留されたグリッドの signal へ後のフレームで書くと、そのフレームも同じ保留に入る(Solid の STACKED_HOLDS)ので、
保存の間の操作はすべて止まった。

直し方(`packages/solid/src/primitives/userCallback.ts`):

- イベントの中から呼ぶ通知は、呼ぶ前と後にそれまでの書き込みを反映し切る(`flush()`)。利用者のフレームには利用者の
  書き込みだけが入る。その途中の反映の間はコントローラの `update` を止め(`primitives/controller.ts`)、イベントの処理の
  残りと同じフレームで args を組み立て直して `update` する(React 版で 1 回のイベントの更新がまとめて描かれ、コントローラと
  その中から呼ぶ通知が途中の状態を見ないのと同じ)。
- コントローラの `update` の中(描画の effect の中)から呼ぶ通知(`onActiveCellChange` / `onStateChange` など)は、その場で
  反映し切れないので、反映が終わった直後のマイクロタスクで、自分のフレームで呼ぶ(グリッドを外した後は呼ばない)。
  利用者のテストは `flush()` の後に `await Promise.resolve()` が要る(CHANGELOG の「挙動の変化」)。
- 利用者が呼んだハンドルのメソッドの中の通知はそのまま呼ぶ。右クリックメニューの項目の `onSelect` も同じ包みで呼ぶ。
- rows は effect が `latest()` で読んで写した値を読む(ふつうの signal に書いてから action を始める形と、非同期の行の
  取り直し = S5-21 で、保留された rows を読むグリッドの計算が全部待たされないように)。

試して捨てた形(同じ所で迷わないように):

- 前と後に反映し切るだけ(コントローラを止めない): React 版との比べで 3 か所の差(チェックボックスの `onCellClick` が
  切り替えた後の行を受け取る、行ドラッグで途中の `onActiveCellChange` が 1 回多い、ラベル行のドラッグで選択の位置がずれる)。
  途中の反映でコントローラが途中の状態を見たため。
- グリッドの signal を `createOptimistic` と組にする(本当の値と一緒に楽観的な値へ書き、楽観的な値を読む。Solid の診断の
  案内の形): 保存の間も表示は動くが、保留されたグリッドの signal に後のフレームで書くとそのフレームも保留に入り、その間に
  新しく描いた行(スクロールして戻った行など)の中は保存の終わりまで読めない(押すと Solid の `NotReadyError` で効かない)。
  利用者の `createOptimistic` の rows を `latest()` で読む形も、保存に失敗して戻ったときに追従しなかった。
- `onFlush`(Solid の案内の形)でグリッドの書き込みを遅らせる: 書き込みが次のマイクロタスクまで遅れ、利用者のテストの
  「`fireEvent` → `flush()` → 確かめる」が通らなくなる。

確かめ: `idioms.test.tsx`(保存の間もエディタが閉じ 2 回目の編集がその行に入る・保存の間の右クリックメニュー / 列メニュー /
検索 / スクロールして描き直した行の編集・通知の中の action・`onSelect` の action・取り直しの間の操作・描いた後の通知)、
React 版との比べのテスト全体(Solid 版のテスト 24 ファイル・300 件、SSR 6 ファイル)、でたらめな操作の比べ(`t-diff.mjs`、種 16 個 × 5 つのシナリオ = 80 / 80 列・9,600 手で差なし)。

## 再開の手順

1. `git fetch origin claude/project-thread-lw8d5c && git checkout claude/project-thread-lw8d5c`、`pnpm install`。
2. 上の表で「まだ」の最初の行から。Solid 版のテストは `pnpm --filter ./packages/solid test`(約 3 分)、比較テストの 1 ファイルは
   `cd packages/solid && pnpm exec vitest run --config vitest.config.ts src/parity/<名前>.parity.test.tsx`。
   `PARITY_DUMP=<ディレクトリ>` で React 版と Solid 版の DOM と通知を `.react.txt` / `.solid.txt` に書き出す(差を見るとき)。
3. 比較テストで機能なしの構成をわざと比べるときは、確かめる機能のキーを `allowMissingFeatures` に並べる(並べないと、機能の
   入れ忘れの見張りがテストを落とす)。

## Solid らしい使い方(1-5)

`packages/solid/src/idioms.test.tsx`。どれも警告もエラーも出さないことを含めて確かめる。直す前の不具合は見つからなかった。

- 非同期の行: `createMemo(async …)` の行を `<Loading>` の中で渡すと、読み込むまでは fallback、届いたら行。取り直しの間は
  前の行のまま(`isPending` が真。グリッドを作り直さない)で、届いたら新しい行になり、操作も続く。`<Errored>` の中で読み込みに
  失敗すると fallback、やり直すと行。
- 遷移: `action` と `createOptimistic` で保存する書き方。確定した値はすぐに出て、保存が済めばそのまま、失敗すれば元の値へ戻る。
- `<Show>` での出し入れ(5 回): window と document のリスナーを残さない、`ref` は新しいグリッドのハンドルになる。
- 編集中のアンマウント(React 版の AP-12 / RA-1 と同じ): 外すのと同じ更新で親が rows を変えても古い rows で上書きしない、
  外す前に blur すれば確定する。
- 1 ページに 2 つのグリッド: キー操作・列メニュー・テーマは押したグリッドだけに効く。