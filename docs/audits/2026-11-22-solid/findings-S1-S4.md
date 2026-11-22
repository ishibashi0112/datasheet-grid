# S1(在庫・発注表)と S4(テストと型)の点検の報告

`@ishibashi0112/spreadsheet-grid-solid@0.1.0`(tarball)を Solid 2.0.3 / Vite 8.3.8 で使いました。高の所見はありません。中は 1 件(S1-01)で、Solid 版だけに出ます。ほかの所見はすべて低で、多くは React 版 1.2.1(npm)でも同じでした。

以下 `$D` = `audit/dogfood/2026-11-22-solid` です。

自分で起こした規則違反が 1 件あります。サーバーを起動するときに `cd` がサブシェルの中だけで効き、`/home/user/datasheet-grid/dev.pid` を書いてしまいました。気づいてすぐに消し、そのプロセスも止めました。リポジトリの中は読んでいません。点検の後、自分が起動したサーバー(PID 2388 = 5501 の dev、PID 23613 = 5504 の preview)は PID で止めました。ブラウザは残っていません。

---

## S1 在庫・発注表(ポート 5501)

### 1. 作ったもの
- `$D/S1/`(Vite 8 + `@solidjs/vite-plugin` 3.0.1 + Tailwind v4.3.5。`style.layer.css` と `@layer theme, base, ssg-base, components, utilities;`、`theme="class"` のダーク)。
- 2,000 品目の在庫表です。列は次のとおりです。
  - 品番: 左に固定、読み取り専用
  - 品名: 必須(mark)
  - 区分: select、`clipboard: 'label'`、set フィルター
  - 数量: number、min 0 / max 99999 / integer、合計
  - 単価: reject で 100 万以下、平均、円の書式
  - 金額: `getValue`
  - 入荷予定日: date
  - 要発注: checkbox
  - 備考: multiline
  - 状態: select と renderCell の切り替えボタン
  - 操作: 削除ボタン
- 確定した行は状態の列だけ書けます(`canEditCell`)。
- 表の上に登録フォームを置きました。品名・区分・数量を入れて Enter で足し、`flush()` の後に `getViewRowIndex` / `getColIndex` / `startEditing` で足した行の数量を編集し始めます。
- ツールバー: 元に戻す / やり直す、選択した行を削除、CSV(`includeTotalRow` / `escapeFormulas`)、状態の保存と復元(localStorage)、1000 行目へ、`focus()` / `startEditing()`、IME の直接入力の切り替え、ダーク。
- 行の持ち方はタブで切り替えます: signal(`createSignal`)/ `createStore` / 持たない。
- 右クリックメニューに独自の項目を足し、`totalRow` / `fillHandle` / `find` / `enableRowSelection` も使いました。
- 操作は Playwright Chromium の本物の入力で回しました(`$D/S1/e2e/*.cjs`、スクショは `$D/S1/shots/`)。

### 2. 確かめた操作(問題が無かった範囲を含む)
- **編集と元に戻す**: ダブルクリック / F2 / 打ち始めで編集し、Enter / Tab / Esc で確定・取り消し、Ctrl+Z / Ctrl+Y。multiline の Alt+Enter、checkbox の Space とクリック、select エディタ、date に `2026/11/1` を打つ、いずれも問題ありません。
- **Excel からの TSV の貼り付け**:
  - 全角の「１，２００」は 1200、「１５０」は 150 として読みます。
  - `2026/11/1` は 2026-11-01、区分は表示名から値へ、`TRUE` / `FALSE` / `1` は checkbox として読みます。
  - reject の列は飛ばし、mark の列には「0〜99999 で入力してください」「整数で入力してください」が出ます。
  - `11/2` と知らない区分は、ドキュメントどおり生のまま残ります。
  - 確定した行への貼り付けは飛ばします。
- **フィルハンドル**:
  - 数量の連続データは 3, 4, (確定した行は飛ばす), 6, 7 でした。
  - 日付の連続データ、値のツールチップ、離した後の「連続データ / セルのコピー」の選び直しも正しく動きます。
  - 元に戻すは 1 回で戻ります。
- **IME の直接入力**(CDP の IME で確認):
  - text 列は「林檎」で編集を始めます。
  - number 列は「１２」が 12 になります。
  - select 列と読み取り専用の列では捨てます。
  - 表の上のフォームの入力は奪いません。
- **CSV**: BOM、合計の行、`'=SUM(A1:A9)` のエスケープ、改行を含む値の引用はどれも正しく出ます。
- **メニューと検索**:
  - 列メニュー、set フィルター、フィルターの管理とツールパネル、列の固定(`onColumnsChange` も)は問題ありません。
  - 右クリックメニューの独自の項目(この行を削除 / ここから編集)も動きます。
  - Ctrl+F の検索は 4 件に印が付き、Enter で移り、Esc でグリッドへフォーカスが戻ります。
- **ハンドル**:
  - `getState` / `applyState` で保存して戻すと元どおりになります。
  - `scrollToRow(999, {align:'center'})` と `focus()` は動きます。
  - `startEditing()` は F2 と同じく末尾にカーソルを置いて開きます。
- **renderCell のボタン**:
  - 状態の切り替えは `ctx.setValue` で書けます。
  - 削除は `applyRows` で消え、Ctrl+Z で戻ります。
  - ボタンを押すとそのセルが選ばれますが、React 版も同じです。
- **表の上のフォーム**:
  - フォームの Enter / Tab / Ctrl+Z / Delete / 矢印はグリッドに効きません(IME の直接入力が有りでも無しでも)。
  - 編集中にフォームを押すと、編集を確定してフォームにフォーカスが残ります。
- 外から `setRows` すると履歴が消えます(ドキュメントどおり)。
- **見た目**:
  - Tailwind の preflight と共存でき、`classNames` に書いたユーティリティも効きます。
  - ダークはポップアップとツールチップまで効きます(`$D/S1/shots/dark-*.png`)。
- **行選択**: チェックボックスで選び、削除して、元に戻すまで問題ありません。
- **マウントとアンマウント**:
  - メニューやエディタを開いたまま外しても、ポップアップは消え、エラーは出ません。window のリスナーは 16 のままです。
  - `display:none` のタブから出しても正しく描きます。
  - ヒープの増え方は Playwright の ElementHandle が外した DOM を握っていたせいで、evaluate で待つ形に変えると増えませんでした(所見にしていません)。
- renderCell は選択を動かしても呼び直されません(README どおり)。JSX の中の `isActive` / `rowIndex` は反応します。
- **本番ビルド**(`vite build` + preview)でも主な操作の台本(t1 / t3 / t4 / t6 / t7 / t8 / t11 / t13)を回し直し、結果は同じで、console への出力もありませんでした。

### 3. 所見

**S1-01** 中 / 不具合(またはドキュメント)/ Solid だけ / 確度: 確実 / dev・本番の両方
**題名: `createStore` で行を持つと「元に戻す」が効かない(dev では警告が大量に出る)**
- **再現手順**:
  1. `$D/S1/min/min-store.tsx` を `http://localhost:5501/min-store.html?mode=store` で開きます。行は `rows={state.rows}`、`onRowsChange={(next) => setState((s) => { s.rows = next })}` です。
  2. セルを編集して Ctrl+Z を押します。
- **期待**: signal のときと同じく元に戻ります。
- **実際**:
  - 編集のたびに `canUndo()` が false で、Ctrl+Z もハンドルの `undo()` も効きません。`applyRows` も元に戻せません。
  - ストアの中を直接変える書き方(項目の変更・push・splice)はグリッドに映ります。
- **dev の警告**:
  - 読み込み時に `HUGE_FAN_IN`「Computation "computed" tracked 6006 sources」が出ます(2,000 行、StorePage の SpreadsheetGrid)。
  - 編集のたびに `STRICT_READ_UNTRACKED`「Reactive value "state.1" / "state.id" / "state.name" read directly in an effect callback」が出ます(1 回の編集で約 16〜24 件、5 回で 80 件)。
  - `s.rows = next` で `IMMUTABLE_UPDATE_IN_STORE` が出ます。Solid が勧める「中を直接変える」書き方と、グリッドの「新しい配列で返す」約束が食い違っています。
- **本番**: 警告は出ませんが、元に戻すは同じく効きません。
- **回避策**: signal で持てば効きます。`rows={snapshot(state.rows)}` でも効きますが、その場合はストアの中を直接変えてもグリッドに映らなくなります。
- **証拠**: `$D/S1/e2e/min-store.cjs` / `$D/S1/e2e/min-store-msg.cjs` / `$D/S1/e2e/min-store-mutate.cjs` / `$D/S1/e2e/t9-store-warn.cjs`。
- Solid の README に store での持ち方の説明はありません。store で持ちたい利用者は多いはずなので、対応するか、少なくとも「signal で持つ」とはっきり書く必要があります。

**S1-02** 低 / ドキュメント / Solid だけ(React 版は `flushSync`)/ 確度: 確実 / dev・本番の両方
**題名: 行を足した直後に `getViewRowIndex` / `startEditing` を呼ぶには `flush()` が要るが、Solid の README に書いていない**
- **再現手順**:
  1. `$D/S1/` のフォームで行を足します。
  2. `setRows` の直後に `getViewRowIndex(key)` → `startEditing(...)` を呼びます。
- **実際**:
  - `flush()` が無いと「added 100001 view=-1」になり、エディタは開きません(`?noflush` で確認)。
  - `flush()` の後では view=2000 になり、エディタが開きます。
- React 版のドキュメントは `flushSync` で書いています。Solid 版の README / ガイドには `flush()`(`solid-js`)の案内がありません。
- **証拠**: `$D/S1/e2e/t8b-noflush.cjs`、`$D/S1/src/pages.tsx`(onAdd)。

**S1-03** 低 / 不具合 / React 版も同じ / 確度: 確実 / dev
**題名: 書けるセルが 1 つも無い貼り付けでも `onRowsChange` が呼ばれ、空の元に戻すが積まれる**
- **再現手順**: `canEditCell` で書けないセルだけに貼り付け、続けて Ctrl+Z を押します。
- **期待**: 何も変えない操作は通知も履歴も残しません(Delete キーはそう動きます)。
- **実際**:
  - changes=1、`canUndo()`=true、`onPasteSkipped` は 1 回です。
  - 次の Ctrl+Z は何も起きないように見えます。
- **最小再現**: Solid `$D/S1/min/min-paste.tsx`(`min-paste.html`)、React `$D/S1/react-cmp/src/min-paste.tsx`、台本 `$D/S1/e2e/min-paste.cjs`(両方で同じ結果)。

### 4. Solid の利用者として
- 書き方は React 版とほぼ同じで、列定義はそのまま写せます。`ref={grid}` に変数でも関数でも渡せるのも楽でした。
- 貼り付け・フィルハンドル・IME・CSV など、在庫表で要る機能はどれも Excel の感覚で動きました。
- 一番の落とし穴は store で行を持てないこと(S1-01)です。Solid の利用者はまず `createStore` を選ぶので、ここは最初に当たります。
- 次の落とし穴は `flush()` です(S1-02)。React の `flushSync` を知らない利用者には分かりません。

### 5. 要望
- Solid の README に「行は signal で持つ / store を使うなら…」の節と、`flush()` の使いどころの節がほしいです。
- CSV で列を外すオプションがほしいです。今は操作列のボタンの列が、見出し ' ' の空の列として出ます。

---

## S4 テストと型(ポート 5504。サーバーは使わず、本番ビルドのプレビューにだけ使いました)

### 1. 作ったもの
- `$D/S4/`:
  - 在庫の部品 `src/InventoryGrid.tsx`。
  - Vitest 5.1.1 のテストを jsdom 31 と happy-dom 21 の 2 プロジェクトで回します。使ったのは `@solidjs/testing-library@1.0.0-rc.2` / user-event 14.6.13 / jest-dom 7 です。
  - `src/setup.ts`: `installJsdomLayoutStubs`(`/testing`)、`await preloadGridPopups()`、`afterEach(cleanup)`。globals が無いと自動の後片付けが効かないため、`afterEach(cleanup)` を足しています。
- テスト 28 本がすべて緑で、警告もありません:
  - `src/InventoryGrid.test.tsx`: 描画、編集、元に戻す、コピー、貼り付け、ハンドル、列メニューのフィルター、date エディタ。
  - `src/wrapper.test.tsx`: `merge` / `omit` の汎用の包み部品と、ref の 2 つの形。
  - `src/timing.test.tsx`、`src/compare.test.tsx`。
- 比べるための React 版: `$D/S4/vitest.react.config.ts`、`$D/S4/react/*`。
- SSR: `$D/S4/ssr/run-ssr.mjs`(Solid)、`$D/S4/ssr/run-ssr-react.mjs`(React)。
- 型: `$D/S4/types/src/usage.tsx`(`@ts-expect-error` を含む)、`$D/S4/types/lib/`(d.ts を出す)、`$D/S4/types/pnpm-lib/`、`$D/S4/types/pnpm-react-lib/`、`$D/S4/types/react-lib/`、`$D/S4/ts58/`(TypeScript 5.8.3)。

### 2. 確かめた操作(問題が無かった範囲を含む)
- **テスト**:
  - README の Quick start の形がそのまま通ります。
  - user-event で、ダブルクリックの編集、打ち始め、Shift+矢印のコピー(clipboard)、`user.paste('１，２００')` が動きます。
  - ハンドルの `selectRange` / `exportCsv` / `getState` / `applyState` のソートが動きます。
  - 列メニューを開いて「フィルター…」から A だけに絞ると 4 行になります。
  - happy-dom でも同じ結果です。
- **包み部品**: `merge` / `omit` で包み、`ref` を変数でも関数でも渡せます。
- **SSR**: `renderToString` は window が無くても動きます。左に固定した列のセルだけが出て中央のセルは空ですが、React 版も同じなので所見にしていません。
- **型**:
  - 確かめた組み合わせ: TypeScript 7.0.2 と 5.8.3、bundler と nodenext、`strict` + `exactOptionalPropertyTypes`、`skipLibCheck: false`。
  - インラインの列定義から行の型を推論します。
  - 間違いはエラーになります: `valueGetter`、number エディタのオプションの誤り、行の項目名の誤り、`rowKeyGetter` がオブジェクトを返す、`onRowsChange` に `number[]`。
  - `createSpreadsheetGrid`(lite)、`localeTextEn`、`installJsdomLayoutStubs` も型が通ります。
  - npm(hoisted)では、出した d.ts に `/internal/` / `/dist/` のパスが入りません。機能の部品は `GridFeature<K>` の名前で書かれます。
  - TypeScript 7 で d.ts を出すには `rootDir` が要ります。これは TypeScript 側の仕様です。

### 3. 所見

**S4-01** 低 / ドキュメント / Solid だけ / 確度: 確実
**題名: README の「Node(Vitest + jsdom)では `solid` か `browser` の条件で解決する」の書き方では足りない**
- プラグイン無しで `resolve: { conditions: ['browser'] }` だけを書くと、import した時点で「Error: Client-only API called on the server side. Run client-only code in onSettled, or conditionally run client-only component with <Show>.」が出ます(`@solidjs/web/dist/server.dev.js` ← `spreadsheet-grid-solid/dist/index.js:152`)。
- `ssr.resolve.conditions` だけでも、`externalConditions` だけを足しても同じエラーでした。
- 通ったのは、`resolve.conditions` と `ssr.resolve.conditions` と `ssr.resolve.externalConditions` の 3 か所すべてに `['browser']` を書いたときだけです。
- 「`@solidjs/vite-plugin` を入れる」を第一の案にし、条件だけで済ませる形を書くなら 3 か所とも書くとよいです。
- **最小再現**: `$D/S4/noplugin/grid.test.ts`。失敗するのは `$D/S4/vitest.noplugin.config.ts`(プラグイン無し)と `$D/S4/vitest.noplugin2.config.ts`(`resolve.conditions` だけ)、通るのは `$D/S4/vitest.noplugin9.config.ts`。

**S4-02** 低 / ドキュメント / Solid だけ(React 版は act)/ 確度: 確実
**題名: テストで signal を変えたり fireEvent を送ったりした直後は、DOM に映るまで `flush()` か microtask の待ちが要る**
- `setRows` の直後に数えると 5 行で、`flush()` の後に 2 行になります。
- `aria-selected` は `flush()` まで false のままです。
- `fireEvent.keyDown('a')` だけではエディタが開かず、`flush()` の後に開きます。
- testing のガイドに Solid での書き方がありません。
- **証拠**: `$D/S4/src/timing.test.tsx`。

**S4-03** 低 / ドキュメント(または不具合)/ React 版も同じ / 確度: 確実
**題名: `selectRange` の直後の `exportCsv({ scope: 'selection' })` が空、`applyState({ sort })` の直後の `exportCsv()` が古い並び**
- `getSelection()` はすぐに新しい値を返しますが、エクスポートは Solid では `flush()` の後、React では act の後でないと反映しません。
- ドキュメントは選択の読み取りがすぐ効く書き方になっています。
- **証拠**: `$D/S4/react/debug.test.tsx`、`$D/S4/src/InventoryGrid.test.tsx` の 71 行目。

**S4-04** 低 / 型 / React 版も同じ / 確度: 確実
**題名: pnpm で `numberFormatter()` の結果を推論のまま export すると、d.ts が書けない**
- 出るエラー:
  - TypeScript 7 は TS2883、5.8 は TS2742 です。
  - 文言は「cannot be named without a reference to 'CellValueFormatterParams' from '.pnpm/@ishibashi0112+spreadsheet-grid-core@1.2.1/...'」です。
- README の勧めどおり core を直接入れても出ます。
- 原因は、d.ts が `numberFormatter` を `@ishibashi0112/spreadsheet-grid-core/internal/logic/valueFormatters` から再公開していることです。`numberParser` / `restoreColumnsFromState` も同じ形です。
- npm(hoisted)では出ません。
- **回避策**: `GridColumn<Item>[]` か `CellValueFormatter<Item>` を注釈します。そうすると core を入れていなくても通り、d.ts は solid の入口の名前だけで書かれます。
- **再現**: `$D/S4/types/pnpm-lib/`(Solid)、`$D/S4/types/pnpm-react-lib/`(React)。

**S4-05** 低 / 型 / React 版も同じ / 確度: 確実
**題名: select エディタの `options` に readonly(`as const`)の配列を渡せない**
- `filterOptions` には渡せるので、そろっていません。
- **再現**: `$D/S4/types/repro/readonly-options.tsx`、`$D/S4/types/react-lib/src/ro.tsx`。

**S4-06** 低 / 型 / React 版も同じ / 確度: 確実
**題名: `SpreadsheetGridProps<T>` に `T extends object` の制約が無いのに、部品のほうは制約を要る**
- 汎用の包み部品を `<T>` で書くと TS2322 になり、`<T extends object>` と書く必要があります。
- **再現**: `$D/S4/types/lib/src/index.tsx`(直した後)、`$D/S4/types/react-lib/src/index.tsx`。

**S4-07** 低 / ドキュメント(テスト)/ React 版も同じ / 確度: 確実
**題名: jsdom / happy-dom + user-event で number のセルに数字を打ち始めると順が入れ替わる**
- `'42'` が `'24'` に、`'123'` が `'231'` になります。実ブラウザでは正しく入ります。
- testing のガイドに注意がありません。
- **証拠**: `$D/S4/src/InventoryGrid.test.tsx` の 41 行目の注記(テストは 1 文字にして避けています)。

**S4-08** 低 / ドキュメント / React 版も同じ / 確度: 確実
**題名: 値と表示名が別の select 列で、set フィルターの候補が値のまま**
- 候補が A / B / C のまま出て、`valueFormatter` や `editor.options` の表示名を使いません。
- 表示名で出すには `filterOptions` を書く必要がありますが、「値と表示名が別の列」の節に書いてありません。
- **証拠**: `$D/S4/src/InventoryGrid.test.tsx` の 85 行目。

**S4-09** 低 / 不具合 / React 版も同じ / 確度: 確実
**題名: 選んだ行を消した後も、選択の数とキーが残る**
- 消した後の値: `getSelectedRowKeys()`=[2,3]、`getSelectedRowCount()`=2、`getSelectedRowData()`=[]。
- 元に戻すと再び選ばれた状態になります。
- 数とデータが食い違うのが分かりにくいです。
- **証拠**: `$D/S4/src/compare.test.tsx`、`$D/S4/react/compare.test.tsx`。

### 4. Solid の利用者として
- `/testing` の部品と `preloadGridPopups` のおかげで、jsdom でも happy-dom でもテストはすぐ書けました。
- 型は TypeScript 5.8 から 7 まで、strict + `exactOptionalPropertyTypes` で素直に通ります。
- つまずいたのは次の 3 つです:
  - Solid 特有のタイミング(`flush()`)
  - Vitest の設定でプラグインが要ること
  - pnpm で d.ts を出すときの注釈

### 5. 要望
- testing のガイドに Solid の節がほしいです: `flush()`、`afterEach(cleanup)`、プラグインか 3 か所の conditions、数字の打ち始めの注意。
- `numberFormatter` などを公開の型で再公開して、pnpm でも推論のまま export できるようにしてほしいです。
- select の `options` で readonly の配列を受けてほしいです。