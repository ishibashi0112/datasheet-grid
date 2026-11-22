# S2 / S6 点検の報告(Solid 版 0.1.0 の候補)

`$D` = `audit/dogfood/2026-11-22-solid`

- 起動したサーバー(S2 の dev 3501 と本番 5502、repro-leak の 5502、S6 の 5506)とブラウザは、PID を指定してすべて止めました。ポートが空いていることも確かめました。
- 作業はすべて `$D/S2` と `$D/S6` の中で行いました。リポジトリは読んでいません。
- dist の中身は 1 回だけ読みました。S6-01 の不具合を体験した後、原因を切り分けるために `coarse` を grep しただけです。
- 所見に高・中はありません。Solid 版だけの所見は、開発時の診断 2 件とタッチの当たり判定 1 件でした。

---

## S2 SSR の管理画面(SSRM、英語)

### 1. 作ったもの

- **構成**
  - Vite 8.3.8、solid-js / @solidjs/web 2.0.3、@solidjs/router 2.0.1、@solidjs/vite-plugin 3.0.1(`solid({ ssr: true })`)、TypeScript 6(strict + exactOptionalPropertyTypes)、npm。
  - SolidStart 2.2.3 は Solid 1 向けなので、SSR は自分で組みました。
- **サーバー**(Node の http サーバー `$D/S2/server.js`)
  - dev は Vite の middlewareMode と `ssrLoadModule`、本番は `vite build` と `vite build --ssr`。
  - `entry-server.tsx` で `createRequestEvent`、`provideRequestEvent`(`@solidjs/web/storage`)、`renderToString`(`?stream` で `renderToStream`)、`generateHydrationScript` を使い、`entry-client.tsx` で `hydrate` します。
- **API**(`$D/S2/api/users.js`)
  - メモリ上に 50,000 人のユーザーを置きました。
  - GET は範囲・ソート・すべての種類のフィルターに対応しています。
  - PATCH は 300〜800ms 遅らせ、10% の確率で失敗させます。POST と DELETE もあります。
  - 失敗率と遅延は `/api/_chaos`、要求の記録は `/api/_log` で操作します。
- **画面**: 一覧 `/users`、詳細 `/users/:id`(clientSide のグリッドで、checkbox 列あり)、設定 `/settings`(密度、保存の表示、失敗率)。
- **グリッド**(`$D/S2/src/pages/Users.tsx`)
  - `dataSource`(`getRows` / `updateRows`)、`localeTextEn`、`initialState`(URL から)、`onSortChange` / `onFiltersChange`(URL へ同期)、`applyState`(戻る / 進む)。
  - `refreshServerSide`、`retryServerSideLoads`、`showSaveStatus`、`onServerSideLoadError` / `onServerSideWriteError`。
  - `enableContextMenu`(label / action / danger / separator)、`find`、`validate`(reject と mark)。
  - select + set フィルター + chips、dateSet / date / number フィルター、固定列、`renderCell` の中のリンクと削除ボタン。

### 2. 確かめた操作(問題が無かった範囲も含む)

- **SSR の HTML**
  - `window` が無くても落ちません。
  - 出るのは行番号と固定列の骨組みと skeleton だけでした(JS 無しのスクショ `$D/S2/shot-ssr-nojs.png`)。ドキュメント(troubleshooting)の記述どおりで、React 版 1.2.1 の `renderToString` も同じでした(`$D/S6/react/ssr-check.mjs`)。
- **ハイドレーション**
  - SSR の DOM がそのまま使われました(root / 見出し / ナビが同じ要素で、作り直しなし)。
  - 警告は出ず、二重描画もありませんでした。
  - dev / 本番 × renderToString / renderToStream の 4 通りで確かめました(`t4-hydrate.cjs`)。
- **サーバーへ渡る条件**
  - 列フィルター text / set(空白を含む)/ dateSet / date / number、ソート(複数)、グローバルフィルターが、すべて GET の query に正しく入りました(`t3-filters.cjs`)。
  - URL の `?sort=…&q=…&f=…` との同期は正常でした。再読み込みで `initialState` から戻り、戻る / 進むは `applyState` で反映されました。
- **編集と書き戻し**
  - 保存中の印 → ✓ が出ました。
  - 編集中に遠くまでスクロールして戻っても、エディタは 1 つでフォーカスも保たれました。
  - 失敗するとロールバックし、セルの ✕ とバー「Couldn't save changes (1 row). The values were restored.」が出て、`onServerSideWriteError` が呼ばれました。
  - 3×2 の貼り付けは PATCH 1 回にまとまりました。
  - reject の検査では PATCH を送らず、mark の検査では `aria-invalid` が付きました。
  - SSRM では undo が効きません。これはドキュメントどおりです。
  - 保存中にグローバルフィルターを変えると、PATCH の決着を待ってから取り直し、新しい値で表示されました(`t13-inflight.cjs`)。
- **追加 / 削除と取り直し**
  - 追加(POST)・削除(DELETE)の後に `refreshServerSide()` を呼ぶと、件数とバーが更新されました。
  - 読み込みに失敗すると「Couldn't load rows (7 blocks) Retry ×」が出ました。失敗中はスクロールしても取り直しません。
  - `retryServerSideLoads()` と内蔵の Retry はどちらも 7 ブロックを取り直しました。× で閉じられます。
- **その他の操作**
  - 右クリックメニューから詳細へ移動、削除、読み込み済みの行の CSV 出力(BOM + CRLF)ができました。
  - Ctrl+A の集計には「Loaded rows only」が添えられ、Ctrl+C も正常でした。
- **ルートの行き来**: 一覧 ↔ 設定 / 詳細を 30 回往復しても漏れはありませんでした(本番、CDP)。
  - ノード数 5,162 とリスナー数 600 で頭打ちになりました。
  - グリッドの無いページでは window のリスナーが 18 に戻りました。
  - 最初に増え続けて見えたのは Playwright の `waitForSelector` のハンドルが原因で、`locator.waitFor()` にすると消えました。
- **英語の画面**: 列メニュー(固定の小メニューを含む)、ツールパネルの 3 タブ、全種類のフィルター、エディタ、右クリック、エラーのバーを走査し、日本語は 0 件でした(`t9-japanese.cjs`)。
- **本番の形**: 上の主な操作を本番(自分のサーバー)でも一通り確かめました。

### 3. 所見

**S2-01 グリッドの通知の中で signal を読むと、開発時に STRICT_READ_UNTRACKED が出る**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | 使いにくさ |
| 範囲 | Solid だけ(React 版にはこの診断が無い) |
| 出る環境 | dev |
| 確度 | 確実 |

- **再現手順**: `onSortChange={() => count()}` のように、通知の中で signal を読みます。そのうえでソートやフィルターを操作します。
- **出る通知と件数**
  - 出るもの: `onSortChange` 1 件、`onFiltersChange` 1 件、`onStateChange` 2 件、`onActiveCellChange` 3 件。
  - 出ないもの: `onScroll` / `onCellClick` / `onRowsChange` は 0 件。
- **期待**: 通知はイベントハンドラと同じく、追跡の外で呼ばれる。
- **実際**: `[STRICT_READ_UNTRACKED] Reactive value "count" read directly in an effect callback will not update. Move it into a tracking scope…` が出ます。通知が effect の apply の中から呼ばれているためと見ています。この警告に従って直すことは利用者にはできません。
- **回避策**: 通知の中の読み取りを `untrack()` で包むと消えます。
- **最小再現**: `$D/S2/repro-leak/src/callbacks.tsx`、`$D/S2/repro-leak/callbacks.html`、`$D/S2/repro-leak/callbacks.cjs`
  - 手順: repro-leak で `node node_modules/vite/bin/vite.js`(5502)を起動し、`node callbacks.cjs` を実行します。

**S2-02 SSRM でグローバルフィルターを変えると、開発時に EFFECT_RELAY_TEAR が出る**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | 不具合(開発時の診断) |
| 範囲 | Solid だけ |
| 出る環境 | dev |
| 確度 | 確実(毎回出る) |

- **再現手順**: SSRM で、ソート → 列フィルター(name に「9」)→ グローバルフィルター「99」の順に操作します。
- **実際**: `[EFFECT_RELAY_TEAR] effect "fillHandle" ran twice for one write of "serverSideQueryStore"… relayed it by writing "serverSideRowModelStore" … (3 times so far)` が出ます。
  - `fillHandle` を使っていなくても、この名前が出ます。
  - 見た目のずれは確認できませんでした。
  - clientSide では出ません。
- **最小再現**: `$D/S2/repro-leak/src/main.tsx`(`?mode=ssrm`)、`$D/S2/repro-leak/relay.cjs`

**S2-03 README の「SSR(SolidStart など)」どおりには組めず、Solid 2 で SSR を組む手順が無い**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | ドキュメント |
| 範囲 | Solid だけ |
| 確度 | 確実 |

- 公開版の SolidStart は Solid 1 向けです。
- 次のことがどこにも書かれていません。
  - `@solidjs/vite-plugin` の `ssr: true`
  - `renderToString` / `renderToStream` + `hydrate` + `generateHydrationScript`
  - ルーターに必要な `createRequestEvent` / `provideRequestEvent`
  - サーバーの描画は固定列の骨組みだけになること(React 版の nextjs ガイドにある内容)
- 組んだ例は `$D/S2/server.js` と `$D/S2/src/entry-server.tsx` です。

**S2-04 Solid で URL と状態を同期する書き方が無い**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | ドキュメント |
| 範囲 | Solid だけ |
| 確度 | 確実 |

- `getState` / `applyState` を `useSearchParams` と組み合わせる例が要ります。次の点が分かりませんでした。
  - 引数 2 つの `createEffect(() => location.search, apply, { defer: true })` で書くこと。
  - 通知の中の読み取りは `untrack` で包むこと(S2-01)。
  - `sameState` で行き来のループを防ぐこと。
- 組んだ例は `$D/S2/src/pages/Users.tsx` と `$D/S2/src/urlState.ts` です。

---

## S6 モバイル・アクセシビリティ・ダイアログ

### 1. 作ったもの

- **Solid 版**: `$D/S6/solid`
  - Vite 8.3.8、solid-js 2.0.3、@solidjs/vite-plugin 3.0.1、TS 6、axe-core 4.14.1。
- **比べる React 版**: `$D/S6/react`
  - React 19.3.1、@ishibashi0112/spreadsheet-grid 1.2.1、@vitejs/plugin-react 6。同じ列、同じ i18n、同じダイアログで作りました。
- **画面**
  - 現場点検 200 行。列は場所(固定、set)/ 項目(text)/ 結果(select + chips + set)/ 数値(number 0–100)/ メモ(multiline)/ 写真(checkbox)。
  - 展開行のカード(入力欄、textarea、ボタン。保存はハンドルの `applyRows` の関数の形)。
  - 行のドラッグ。右クリックメニューで上へ / 下へ(`moveRow`)。
  - 日本語と英語の切り替え(`localeText` を signal で変える)。
  - ネイティブの `<dialog>`(`showModal`)の中に、テンプレート 30 行のグリッドと右クリックメニュー。
- **サーバー**(`$D/S6/solid/server.mjs`): 5506 番 1 つで、`/react/` と `/solid/` は本番ビルド、`/` は Solid の dev を返します。比べる操作はすべて 3 通り(React 本番 / Solid 本番 / Solid dev)で回しました。

### 2. 確かめた操作(問題が無かった範囲も含む)

結果は下の S6-01 を除き、React 版と同じでした。

- **iPhone 13 と iPad Mini(Chromium、hasTouch / isMobile)**(`t2-mobile.cjs`)
  - CDP のタッチで縦・横にスワイプしてスクロールでき、選択は作られませんでした。
  - タップでアクティブセルになり、ダブルタップで編集が始まりました。入力欄は 16px なので iOS の拡大は起きません。
  - select の候補(高さ 44px)をタップして確定できました。
  - 列メニュー(⋮ は常に見え、項目は 44px)から列フィルターを開き、候補を外すと絞り込めました。
  - 下部バーは 2 段に折り返し、はみ出しはありませんでした。
  - 展開カードを開いて入力欄をタップできました。
  - 横向きにしてもはみ出しはありませんでした。
  - 行ドラッグは、タッチとマウスのどちらでも並べ替えと `onRowMove` が働きました(`t9-drag.cjs`)。
  - タッチでの列幅の変更も React と同じでした。
- **キーボードだけ**(`t3-keys.cjs` / `t3b-detail.cjs`)
  - Tab 1 回でグリッドに入って出られました。
  - アクティブセルが無いときは `::after` の枠が見えました。
  - `Alt+↓` で列メニューが開き、Esc でグリッドへ戻りました。
  - `Shift+F10` で右クリックメニューが開きました。
  - トグル列の Enter / Space で開閉できました。
  - カードの中の Tab は「最終列 → input → textarea → 3 つのボタン → 外」の順でした。カードの「閉じる」を押すとフォーカスは表へ戻り、カード内の矢印キーは表へ伝わりませんでした。
- **axe-core**(`t4-axe.cjs`): 表、列メニュー、フィルター(text / set)、エディタ 4 種、右クリック、展開、ツールパネル、ダイアログを検査し、指摘の種類と件数が React と完全に一致しました。
  - 編集中の `aria-required-children` はドキュメントに書かれているとおりでした。
- **aria の属性と読み上げの木**(`t5-aria.cjs`): 最初の状態、展開して範囲を選んだ状態、編集中、ダイアログの 7 時点で比べ、差は 0 でした。
  - `aria-rowcount=201`、`aria-colcount=9`、ボタンの名前(「詳細を開く」「場所 の列メニュー」)も一致しました。
- **reduced-motion / forced-colors / ダーク**(`t6-media.cjs`): `ssg-motion-off` が本体とポータルの両方に付き、スクショは React とピクセル単位で一致しました。
- **`<dialog>` の中**(`t7-dialog.cjs`): 列メニュー、フィルター、select の候補、右クリックメニューはダイアログの中で前面に出て、押せました。
  - フィルターの Esc では閉じるのはポップアップだけでした。範囲を選んでいるときの Esc は選択解除で、ダイアログは開いたままでした。
  - 1 セルのときの Esc でダイアログが閉じ、フォーカスは開いたボタンへ戻りました。
  - 編集と Ctrl+Z も効きました。
- **言語の切り替え**(`t8-lang.cjs`): 175 種の文字列と属性(aria-label、placeholder、ツールチップ)を集めて比べました。
  - en にした後、日本語は 0 件でした。
  - en → ja と戻すと、最初の ja と同じになりました。
  - en の文字列の集合は React と同じでした。
- **開発時の警告**: Solid dev のコンソールには、どの操作でも警告が出ませんでした。

### 3. 所見

**S6-01 タッチでのタップの当たり判定が React 版と違う**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | 使いにくさ |
| 範囲 | Solid だけ |
| 出る環境 | dev / 本番とも |
| 確度 | Chromium のエミュレーションで確実。実機の Android と iOS では確かめていない |

- **checkbox 列**: 16px の箱の近くをタップしたときの結果が違います(セルの左端からの距離)。

| タップした位置 | React | Solid |
| --- | --- | --- |
| 5px | 切り替わる | 切り替わらない |
| 18px(箱の上) | 切り替わる | 切り替わる |
| 35px | 切り替わる | 切り替わらない |
| 60px | 切り替わらない | 切り替わらない |

  - Solid は箱の真上を押したときだけ切り替わります(ドキュメントの「チェックボックスそのものを押すと」どおり)。
- **展開トグル**: ボタンの 4px 外をタップすると、Solid では開き、React では開きません。
- **原因**: Chromium のタッチの位置合わせ(touch adjustment)の差です。
  - React はハンドラを付けた要素に空の `onclick` を付けます。そのため Chromium がタップを checkbox へ寄せます(pointerdown の target が `.ssg-row-checkbox`)。
  - Solid の委譲イベントでは `onclick` が null で、target は `.ssg-body-cell` のままでした。
- **期待**: 両版で同じ当たり判定。できれば CSS の `pointer: coarse` で checkbox の的を広げ、iOS でも同じにする。
- **証拠**: `$D/S6/solid/dbg4.cjs`(当たり位置の表)、`dbg7.cjs`(target と `onclick`)、`dbg9.cjs`(トグル)。アプリは `$D/S6/solid/src/App.tsx` と `$D/S6/react/src/App.tsx`。
- 行選択の checkbox では確かめていません。

**S6-02 展開行を開くと、`.ssg-tab-exit[aria-hidden="true"]` に `tabindex="0"` が付く**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | 不具合 |
| 範囲 | React 版も同じ |
| 確度 | 確実 |

- axe の `aria-hidden-focus`(serious)に当たります。
- 証拠: `$D/S6/solid/dbg8.cjs`、`t4-axe.cjs`

**S6-03 合成列(行ドラッグ / 展開トグル)の列見出しが空**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | 不具合 |
| 範囲 | React 版も同じ |
| 確度 | 確実 |

- axe の `empty-table-header`(minor)に当たります。

**S6-04 条件付き書式の chips の既定色のコントラストが足りない**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | 見た目 |
| 範囲 | React 版も同じ |
| 確度 | 確実 |

- 「不良」(critical)の文字 #dc2626 と背景 #fee2e2 で 3.95:1 です(基準は 4.5:1。axe の `color-contrast`)。

**S6-05 展開行の `render` の呼び直しの規則が README の「React 版との違い」に無い**

| 項目 | 内容 |
| --- | --- |
| 重要度 | 低 |
| 種類 | ドキュメント |
| 範囲 | Solid だけ |
| 確度 | 確実 |

- **Solid 版の挙動**: 行が変わっても `render` は呼び直さず、カードの DOM は同じまま `ctx.row` だけが新しい行になります。
- **困った点**: カードの入力の初期値を書き込み可能な派生シグナル `createSignal(() => props.row.x)` で持つと、表で同じ行の別のセルを編集しただけで未保存の入力が消えます。React の `useState` の書き方では残ります。逆に、Ctrl+Z に追従するのは Solid の書き方だけです。
- **証拠**: `$D/S6/solid/t10-card.cjs`

---

## 4. Solid の利用者として

ドキュメントは React の書き方なので、次の点を Solid のページに書いてほしいです。

- 通知(`onSortChange` など)の中で signal を読むときの扱い。今は `untrack` が要ります(S2-01)。
- Solid 2 での SSR の組み方(Vite 8 の SSR、ルーター、サーバーの描画で出るもの)と、URL 同期の例(S2-03 / S2-04)。
- 展開行のカードの状態の持ち方と、`render` / `ctx.row` の反応性(S6-05)。
- `ref` の受け方は README で分かりました。`<For>` の中身が値であることなど、Solid 2 の基本は Solid 側の資料で足りました。

## 5. 要望

- 利用者の通知は untrack で呼んでほしいです。SSRM のストアは memo にして、relay の tear を無くしてほしいです(S2-01 / S2-02)。
- タッチの端末では、checkbox の的を CSS で広げて、React / Solid / iOS で同じにしてほしいです(S6-01)。
- 展開トグルの名前に行の識別を入れられるとよいです(今はどの行も「詳細を開く」。React も同じ)。