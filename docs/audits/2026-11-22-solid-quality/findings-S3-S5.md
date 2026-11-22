# S3(商品マスタ)と S5(ログと株価)の点検の報告(作り直しの組)

段階 4 の 1-6。手順は `audit/dogfood/2026-11-22-solid-quality/BRIEF.md`。ライブラリは今のブランチを pack した Solid 版 0.1.0 の tarball(core 1.2.1)。ポートは S3 = 5503、S5 = 5505。点検者の報告を写した(所見の ID は点検者が付けたもの)。

まとめ: 前の所見のうち直したもの(S5-01・S3-05)と、CHANGELOG の「未リリース」のうち担当の 2 件(R2-1・R3-1)は直っている(npm の 0.1.0 では再現し、候補では直っている)。前に通った操作の回帰は無し。開発時の知らせが 1 種類増えた(S3-22)。新しい所見は中 2・低 2。

## S3 商品マスタ(ポート 5503)

### 作ったもの

- 構成: Vite 8.3.8、solid-js / `@solidjs/web` 2.0.3、`@solidjs/vite-plugin` 3.0.1、TypeScript 6.0.3、Tailwind 4.3.5、`themes/shadcn.css`。
- 前のアプリ: `createSpreadsheetGrid` に `standardFeatures` とラベル行・行ドラッグ・検索・右クリック・フィルハンドル・選択範囲の集計を足したグリッド、5,000 件とカテゴリの見出し行、仕入先を選ぶ custom エディタ(候補をポータルで出す)、`<dialog>` の中のグリッド、`?grid=` での構成の切り替え。
- 今回足したもの: `?grid=group`(`groupingFeature` で 600 件をカテゴリでグループ化、平均 / 合計の集計、number / date / 複数行 text / custom のエディタ、先頭のグループに 1 行足す `__insertTop()` とタイマーの `__auto(ms)`)。最小再現は `repro-solid/src/group.tsx`・`repro-react/src/group.tsx`(React 1.2.1)・`repro-solid/src/spread.tsx`・npm の 0.1.0 の `repro-solid-010`。

### 確かめた操作(問題なし。dev と本番)

- 前の台本の回帰はすべて前と同じ(本番でコンソールに何も出ない): custom エディタ(Enter / Tab / Esc / マウス、一覧のホイールでは閉じずグリッドのスクロールで閉じる、undo / redo)、select 240 件の IME の先頭一致、検査(reject / mark、Delete が reject の列を飛ばす、min / max のツールチップ)、行ドラッグ(カテゴリの中、外へは拒否、undo)、フィルハンドル(数値と日付、undo)、検索 61 件、右クリック(マウス / Shift+F10 / キーボード、複製・削除と undo)、列メニューと set フィルター(405 / 5000 行、ラベル行の件数、行ドラッグのハンドルが淡色)、shadcn のダークと CSV 5,013 行、`<dialog>` の中のポップアップ(8 通りの構成で最初の右クリックが効く)、入れ忘れの警告 7 種類(日本語 + 英語)、全部入りと `createSpreadsheetGrid` を同じページに置いても行が同期。
- グループ化した表で編集中に上へ行を足す(R2-1 の確かめ): number「12」・date・複数行「abc⏎de」を打っている途中に 1 行足しても、エディタ・打ちかけ・フォーカス・エディタの位置(行と一緒に 36px 下がる)が残り、正しい行に正しい値が入る。`activeCellFollows` の `position` / `row`、250ms ごとに行が届く中で 3 秒かけて打つ、IME の変換中に行が届く も同じ。npm の 0.1.0 では壊れていた(number は「134」で「2」が消え、date は消え、複数行はフォーカスを失った)。候補は React 1.2.1 と同じ。
- 「列の固定」の小メニューを開いたまま別の列のメニューへ移って戻る(R3-1 の確かめ): 閉じている。npm の 0.1.0 では開いたまま。小メニューから別の列へ移り、Esc の後に開き直しても閉じている。
- 初期 JS(gzip、空の Solid アプリ 11.55KB を引いた値): 機能なし 92.17KB(前回 91.8)、standard 118.43KB(118.0)、全部入り 160.15KB(159.8)、混在は全部入り + 0.06KB、後から読む分 14.80KB。

### 前の所見の今

- S3-01 まだある(React 版も同じ。ドキュメント未記載): ダイアログへポータルすれば押せる。
- S3-02 まだある(ドキュメント未更新)。S3-03 まだある(未確定。`locator.dblclick()` だとフォーカスが `ssg-shell` に移る)。
- S3-04 変わった: HUGE_FAN_OUT(2,323 の購読)は今も出るが、README の「Sharing props between grids」に書かれた。1 編集の中央値に差なし。
- S3-05 直っている(`themes/*.css` のコメントの名前)。

### 所見

**S3-21** 中 / 不具合 / React 版も同じ / 回帰ではない(npm の 0.1.0 でも同じ)/ dev・本番 / 確実 — グループの先頭の行の custom エディタで打っている途中に上のグループへ行が足されると、打ちかけが消えて違う値が保存される。B グループの先頭の行の custom 列をダブルクリック → Ctrl+A →「abc」→ `__insertTop()` で A グループに 1 行足す →「d」→ Enter で、エディタが作り直され(mount 1 → 2)入力欄は初期値 "city-B1" に戻り、"city-B1d" が保存される(グループの 2 行目や、グループ化していない表では "abcd")。S3 アプリでは仕入先のエディタが作り直されると全選択するので次の 1 文字で検索の文字が消え、違う候補が確定した。CHANGELOG の「custom のエディタは React 版と同じく作り直します」のとおりだが、API_REFERENCE の custom エディタの節に説明が無い。回避: 打ちかけを `ctx` の外(行キー + 列キーで引く signal)に持つ。証拠 `S3/repro-*/group.html`、`S3/t25-custom-insert.cjs`。

**S3-22** 低 / 使いにくさ(dev だけ)/ Solid だけ / 0.1.0 にもある / 確実 — 作り直す props のオブジェクトを `{...gridProps()}` で渡すと、開発時に最初の描画で `Reactive value "merge" read directly in <SpreadsheetGrid> will not update`(STRICT_READ_UNTRACKED)が 1 回出る。原因の見当は部品の本体で `props.ref` を読んでいること。実際は更新される。包む部品が `{...props}` で渡す / `omit` してから渡す / 変わらないオブジェクトの spread / 書き並べ では出ない。README の「Sharing props」には HUGE_FAN_OUT しか無い。証拠 `S3/repro-solid/src/spread.tsx` + `S3/t24-spread.cjs`。

## S5 ログと株価(ポート 5505。Solid 版 `S5/app`、React 1.2.1 版 `S5/react`)

### 作ったもの

- 前のアプリ: ログ 100 万行(dateSet / set + chips、autoHeight、detailRow、末尾を追うモード)、株価 2,000 銘柄を 250ms ごとに更新(signal / `applyRows`、highlightChanges / 条件付き書式 / rowGroup / 固定行 / `activeCellFollows="row"`)。
- 変えたもの: ハンドルの回避 `grid?.` を外し、README どおり `let grid!` + 最初の `createEffect` で `grid.scrollToBottom()` を呼ぶ形に戻した。
- 今回足したもの: `?async`(ログは `createSignal(() => fetchLogs(env()))` = 書き込める非同期の signal で 1.2 秒・「落ちている環境」は失敗、株価は `createSignal(() => fetchStocks(market()))`、`<Errored>` + `<Loading>`、`isPending` で「更新中…」、`?loadingon` で `<Loading on={env()}>`、`?deferred` で `createDeferred` + 末尾に足した行を別の signal)。最小再現 `S5/app/async-min.html`(`?kind=memo|deferred`)。React 側は `S5/react` の `?async`(`use()` + `<Suspense>` + `startTransition`)。

### 確かめた操作(問題なし)

- 前の台本の回帰(dev と本番): ログ(「今日」のプリセット 8,773 行、ERROR + auth 12,330 行、autoHeight の高さ、展開トグル 35 個と JSON、絞り込み中の検索)、株価(固定行、光るセルは最大 24〜27 個、colorScale / dataBar / chip、選択範囲の集計は更新に追従し止めたときの合計は DOM とデータで一致、コピーに tween の途中の値は混ざらない、前日比の降順は更新中も保たれる、並べ替え中のメモの編集は正しい行に入る、`applyRows(undoable:false)` の undo はメモだけ戻す)、フレームごとのずれ 464 フレームで 0、グループ化 10 グループ、末尾を追う(2 万行と 100 万行)、ノードの数 3,217(前回と同じ内訳)。
- `<Loading>` と非同期の行で取り直す形: 最初は fallback から表へ。取り直しの間は前の行と「更新中…」。届いた後もハンドル(同じオブジェクト)・並び・グローバルフィルター・アクティブセルが残る(作り直されない)。失敗すると `<Errored>`、`reset()` で戻る。`<Loading on={env()}>` は取り直しの間 fallback でグリッドは DOM から外れ、外れている間も状態は残り、届くと付き直す(スクロールは先頭へ)。取り直しの間の操作は止まる(S5-21)。`createDeferred` なら操作できる。
- 速さとメモリ(本番、共有のマシンなので参考値。前回と同じ傾向): ログ 100 万行の最初のセルまで Solid 1,508 / 1,099ms・React 1,138 / 1,060ms、読み込み後のヒープ 204 / 195MB、検索 537 / 357ms・348 / 350ms、グローバルフィルター 1,503 / 1,608ms・1,804 / 2,453ms、列フィルター 169 / 102ms・100 / 101ms、絞り込み中のソート 218 / 159ms・153 / 165ms、scrollToRow 68 / 65ms・55 / 50ms、ホイールのフレーム p50 / p95 は Solid 10.2 / 48.0・10.1 / 44.2ms、React 12.1 / 40.0・15.2 / 40.3ms。末尾を追うモードの主スレッドの時間(ms/秒)は 2 万行・末尾 89 / 69、100 万行・末尾 175 / 175、100 万行・上を見ている 345 / 307。株価 2 分はヒープ Solid 10.1 → 10.6MB・React 7.9 → 8.0MB、約 60fps、CPU 約 26〜29% / 23〜24%、コンソール 0 件。

### 前の所見の今

- S5-01 直っている(最初の effect の時点で grid は object、README どおり `?.` なしで `grid.scrollToBottom()` を最初の effect で呼んでも最初から末尾、REACTIVITY_HALTED は出ない)。
- S5-02 まだある(React 版も同じ。2 万行の dev でプリセットを押すとフォーカスが BODY へ移り Esc で閉じない)。
- S5-03 変わった(今も出るが README の「Development diagnostics」に書かれた)。S5-04 まだある(React 版も同じ。グループ行の集計の省略)。

### 所見

**S5-21** 中 / 不具合 + ドキュメント / Solid だけ / 回帰ではない / dev・本番 / 確実 — 行を Solid 2 のふつうの非同期(`createMemo(async)` / `createSignal(async fn)`)で持つと、取り直しの間グリッドが止まる。`__next()` で取り直しを始め(3 秒)、待っている間にホイールで 2,000px スクロールし ↓ を押すと、描かれる行は 0..34 のままで見える範囲が空白になり、アクティブセルも動かず、届いた後にまとめて効く。5 万行のアプリでは中央が空白、矢印キーはバーが止まり、列メニューが開かない。dev では `[STACKED_HOLDS] 4 interactions queued behind one hold`。株価の取り直し中に Enter で確定すると、エディタが届くまで画面に残る。`createDeferred` と React 1.2.1(`use()` + Suspense + transition)はその場で反応する。`<Loading on>` は fallback に切り替わるので見えない。関連(Solid の動き): `createSignal(fn)` に末尾の追加を毎秒書きながら環境を替えると 8 秒以上届かなかった(`createDeferred` と別の signal に分ければ動く)。証拠 `S5/shots/t21-*.png`・`t22-prod-memo.png`、`S5/t21-async-freeze.cjs`・`t22-async-min.cjs`・`t23-async-edit.cjs`・`t24-async-tail.cjs`。

**S5-22** 低 / 使いにくさ(重さ)/ Solid だけ / 回帰か未確定 / 差は確実・影響は小さい — 100 万行での Ctrl+End / Ctrl+Home が React 版の約 2 倍(本番、2 回 × 6 回: Ctrl+End は Solid 57〜124ms・中央値約 70ms、React 21〜47ms・中央値約 33ms。Ctrl+Home は Solid 58〜124ms・中央値約 80ms、React 19〜47ms)。証拠 `S5/t25-ctrlend.cjs`。

## Solid の利用者として / 要望

- ハンドルは README のとおり `let grid!` + 最初の effect で使えるようになり、回避の `?.` が要らなくなった。
- 非同期の行の書き方が README / Solid のページに無い。Solid 2 の基本形 `createMemo(() => fetch…)` をそのまま使うと S5-21 になる。取り直す表は `createDeferred` で持つ・足していく行は別の signal に持つ・`<Loading on>` だとグリッドは外れたまま残る、を一言書いてほしい。custom エディタは作り直されることがある(S3-21)ので打ちかけの持ち方も。「Sharing props」の節に STRICT_READ_UNTRACKED(S3-22)も。
- 要望: S3-21 同じ行・同じ列の編集が続いている間は custom エディタを作り直さない(React 版も)。S5-21 README に「非同期の行」の節を足し、できればグリッドの表示の状態(スクロール・アクティブセル)が行の取り直しの待ちに巻き込まれない形にする。S3-22 `props.ref` を `untrack` で読む。