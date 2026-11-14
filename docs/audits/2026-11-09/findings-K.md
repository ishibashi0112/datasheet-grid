# アプリ K(テストと SSR と型)の報告

公開版 1.0.0 の点検は終わりました。いちばん重いのは K-01 です。値と Enter(または Tab)を 1 文字あたり 15 ms 以下の間隔で続けて打つと、確定した直後のキーが失われます。その結果、値の頭が欠けたり、値が別の行へずれたりします。本番ビルドの最小構成でも確実に再現します。バーコードリーダーの入力はこの速さです。

ほかに中が 2 件あります。テストのガイドにある「全列を描画」が事実と違うこと(K-02)と、React 18 で ref の素通しが型では通るのに実行すると null になること(K-07)です。残りは低です。修正はしていません。

## 1. 作ったもの

**在庫一覧の部品 `InventoryPanel`**
- ツールバーとグリッドでできた部品です。
- ツールバーのボタン:
  - **行を追加**: 次の順に動きます。
    1. `flushSync` で行を足す
    2. `getViewRowIndex` / `getColIndex` で位置を取る
    3. `startEditing` で編集を始める
  - **選択した行を削除**: `getSelectedRows` で選んだ行を外し、`applyRows` で書き戻します。
  - **保存**: `getInvalidCells` と `getRowNumber` で「N 行目の 列: メッセージ」を出します。
  - **CSV**: `exportCsv` で書き出します。
- `onFiltersChange` / `onSortChange` の内容をツールバーに要約して出します。
- 列は 10 本です。

  | 列 | 設定 |
  | --- | --- |
  | SKU | 左に固定、編集不可、text フィルター |
  | 品名 | textSet フィルター |
  | カテゴリ | select エディタ、set フィルター、valueFormatter でラベル表示 |
  | 倉庫 | set フィルター |
  | 在庫数 | number エディタ(min 0、integer) |
  | 単価 | `numberFormatter` |
  | 在庫金額 | `getValue` の計算列 |
  | 入荷日 | date エディタ |
  | 廃番 | checkbox エディタ |
  | 備考 | `validate` で 20 文字まで |

**構成**(Node 22.23.4)

| 構成 | ツールと版 | 中身 |
| --- | --- | --- |
| r19 | React 19.3.1、Vitest 5.1.0(jsdom 31 / happy-dom)、@testing-library/react 16.3.3、user-event 14.6.8、Vite 8.3.6 | テストと、実ブラウザ確認用のページ |
| r18 | React 18.3.1、@types/react 18.3 | r19 と同じソースとテスト |
| jest | Jest 30.5.2、jest-environment-jsdom、@swc/jest | CJS の dist を使う |
| next15 | Next.js 15.5.29 Pages Router、React 18.3.1、TS 5.8.3、reactStrictMode | 下のページ構成 |
| SSR | Node の ESM と CJS | `renderToString` とストリームのスクリプト |
| types | npm + React 19 の型、pnpm + React 18 の型 | グリッドを包む部品をライブラリとして `tsc --declaration` で d.ts にし、その d.ts を使う側のアプリも作った |

- next15 のページ構成:
  - `getServerSideProps`: 500 行。`?sort=` から `initialState` を作り、`totalRow` あり。
  - 英語ページ(SSG)。
  - ダークのページ: `html.dark` と `theme="class"`。
  - ref を渡す包む部品の比較ページ。
  - ページから `themes/shadcn.css` を import するページ。
- UI ライブラリは使っていません。
- TypeScript は 5.8.3 / 5.9.3 / 6.0.3 / 7.0.2 と、moduleResolution の bundler / nodenext の組み合わせで確かめました。

## 2. 確かめた操作

すべて StrictMode ありとなしの両方で確かめました。

**Vitest(r19 と r18 のそれぞれで同じテスト。jsdom、ドキュメント guides/testing のとおり `installJsdomLayoutStubs`)**
- 結果: 各 42 テスト(21 + 12 + 9)が緑です。`STRICT=1` の StrictMode でも緑です。
- `act` の警告と console の error / warn は全テストで 0 件でした。
- **描画**: 中央のペインの行数、見出し、`valueFormatter` / `numberFormatter` / `getValue` の表示、`ariaLabel`。
- **編集**:
  - 打ち始めてから Enter、ダブルクリック、`Ctrl+A` で全選択して打ち Tab、Escape で取り消し。
  - select エディタを ↓ と Enter で選ぶ。date エディタ(`fireEvent.change`)。number の integer と min の検査。checkbox(チェックボックスを押す / Space)。custom エディタの `ctx.commit` / `ctx.cancel`。
  - `validate` の印。
- **フィルター**: 列メニューから set のチェックボックス、textSet、number。グローバル検索。`onFiltersChange` / `onSortChange` の通知。列メニューからの並び替え。
- **キー操作**: 矢印、`Shift+矢印` の範囲、`Ctrl+Home` / `Ctrl+End`、Tab / `Shift+Tab`、範囲の Delete、`Ctrl+Z` / `Ctrl+Y`。
- **範囲選択とコピー、貼り付け**: 貼り付けは `user.paste` で、複数行・複数列の TSV。
- **右クリックメニュー**: role は menu / menuitem。
- **検索**: `Ctrl+F` で role search のバーが開く。
- **ハンドル**:
  - ref が入ること。`selectCell` / `selectRange` / `getSelection` / `getSelectedRows` / `getActiveCell`。act の外で呼んでも結果を読める。
  - `getState` / `applyState` / `onStateChange` / `getViewRowIndex` / `getRowNumber`。並べ替えと絞り込みの後も正しい。`initialState`。
  - `startEditing` / `focus`。編集できない列では `false` が返る。
  - `undo` / `redo` / `canUndo` / `canRedo` / `applyRows`。
  - `getInvalidCells`(非表示の列も対象)。
  - `exportCsv` の scope `selection` / `view`。値は生の値で出る(ドキュメントどおり)。
  - `scrollToRow` と `getVisibleRowRange`。
  - `restoreColumnsFromState` と `initialState` で、幅・並び・非表示が戻る。
- **rows の扱い**:
  - rows を戻さないスパイの `onRowsChange`: 新しい配列が来て、ほかの行は同じ参照、元の配列は変わらない。
  - deep-freeze した rows(Immer / Redux 相当): 編集・貼り付け・削除・元に戻す・並べ替え・チェックボックスで例外が出ない。
  - `rerender` で rows を減らすと、アクティブセルが範囲の中へ詰まる。
- **その他**:
  - `vi.useFakeTimers({ shouldAdvanceTime: true })` と user-event の `advanceTimers` の組み合わせで編集できる。素の useFakeTimers では user-event 自体が止まりますが、グリッドとは関係ありません。
  - `preloadGridPopups()`。
  - `installJsdomLayoutStubs` の戻し: 逆順に restore すれば完全に元へ戻る。
- **happy-dom**(r19): 33 テスト緑。

**Jest 30**
- 描画と編集、コピーと貼り付け、列フィルター、ハンドルの 4 テストが緑です(CJS の dist)。

**ハイドレーション(jsdom の `hydrateRoot`)**
- サーバーの HTML に 8 種類の構成でかぶせました: 素のまま / `theme="class"` / theme auto / `totalRow` / 行選択 / `initialState` / `find` / 固定列なし。
- React 19 と 18 のどちらも警告は 0 件です。

**SSR(Node の ESM と CJS × React 19 と 18)**
- `renderToString` を次の構成で試しました: 全部入り、英語、ダーク(class)、`initialState`、theme auto、機能を多数入れたもの、0 行、serverSide、`/lite`、`/ai` の `GridAskBar`。
- どれも落ちず、警告も出ず、`window` は未定義のままでした。
- ストリーム: `renderToPipeableStream` / `renderToReadableStream` / React 19 の `prerender`。React 18 は `react-dom/server.browser` の `renderToReadableStream` で確かめました。どれも問題ありません。

**Next.js 15 Pages Router + React 18.3(dev と `next build` + `next start` の両方)**
- SSR の HTML には、固定列と行番号のセルが中央 21 行・左 21 行ぶん入ります(固定列と行番号だけ描かれるのはドキュメントどおり)。
- ハイドレーションの警告は 0 件です。
- 操作:
  - 編集、計算列、合計行、コピー(TSV)、貼り付け、元に戻す。
  - 列メニューで並び替えると、`router.replace` で `?sort=qty.desc` が付く。
  - `?sort=price.desc` で開くと、SSR の時点で並んでいる。戻るボタンも正しく動く。
  - 行を追加してから `startEditing`: 501 行目のエディタにフォーカスが入る。
  - `scrollToRow` で末尾まで行く(`scrollTop` 17705 = 最大値)。
  - `focus()`、`Ctrl+Home` / `Ctrl+End`(下部バーの番地は H501)、`getState` の JSON。
- 英語ページ(SSG、`localeTextEn`): 下部バーが英語になる。
- ダーク: セルの背景が rgb(26, 27, 30) になる。
- ページから `themes/shadcn.css` を import しても `next build` が通る。
- JS を切ったときのスクリーンショット(固定列だけ見える)、CLS は 0。

**Vite 8 の実ブラウザ(Chromium、r19 / r18 × dev / 本番)**
- jsdom のテストと同じ操作の結果が一致し、コンソールは 0 件でした。
- 本番の main は React 込みで 198.7KB gzip、遅延チャンクは 5.8 / 5.0 / 2.1KB です。

**型**
- `GridColumn<Row>` の推論。`getValue` / `valueFormatter` / `rowKeyGetter` / `useRef<SpreadsheetGridHandle<Row>>`。
- 間違いが型エラーになることを `@ts-expect-error` で確かめました:
  - `valueFormatter` が数値を返す、`getValue` が行に無いプロパティを読む、`valueFormatter` の `row` が undefined かもしれない、`pinned: 'center'`、`filterType` の打ち間違い、select エディタに options が無い。
  - 行の型が違う ref、`rowKeyGetter` がキーでない値を返す、列の型と行の型が合わない。
  - AG Grid の書き方の `valueGetter` / `field` は TS2353 で弾かれる。
  - `labelRow` の型ガードの推論。
- d.ts の出力: TS 5.8 / 5.9 / 6.0 / 7.0 × bundler / nodenext のすべてで、`/internal/` / `/dist/` / `.pnpm` のパスが出ません。出した d.ts を使う側もコンパイルできます。
- pnpm で core を直接入れないと TS2742 / TS2883 になります(ドキュメントどおり)。core を入れると通ります。
- moduleResolution が node10 だと `/locales/en` が解決できません(対象外とドキュメントにあるとおり)。

## 3. 所見

### K-01 速い連続入力で、確定直後のキーが失われ、値が欠けたり別の行へずれたりする

- 重要度: **高**(間違った値が保存される。後述の条件のときだけ起きる) / 種類: 不具合 / 本番・dev の両方 / 確度: 確実

**再現手順(最小)**
1. 1 列 20 行のグリッドを用意します。`onRowsChange={setRows}`、StrictMode なし、本番ビルドです。
2. 1 行目のセルを押します。
3. 「4900⏎4901⏎4902⏎…」を、キーの間を空けずに送ります。CDP の `Input.dispatchKeyEvent` で、1 キーごとに GAP ms 空けて送りました。

**期待**: 1〜6 行目に 4900〜4905 が入る。

**実際**(各条件 6 回ずつの成功回数。測定は 2 回以上、繰り返しました):

| キーの間隔 | Enter で確定 | Tab で確定(6 列を右へ) |
| --- | --- | --- |
| 5 ms | 0/6 | 0/6 |
| 10 ms | 0/6 | 0/6 |
| 15 ms | 2/6 | 未測定 |
| 20 ms | 6/6 | 6/6 |
| 30 ms | 6/6 | 6/6 |

- 失敗した回の例:
  - Enter: `["4900","901","902","03","4904","05"]` / `["4910","911","12","913","14","4915"]`
  - 値が別の行へずれた回: `["4900","4902","903","904",…]`
  - トレースの 2 回: 12 / 34 / 56 と打って `["12","4","56",""]`、別の回は `["12","56","",""]`(2 行目に 56 が入る)
  - Tab: `["100","01","102","03","04","105"]`
- 実アプリの大きさ(2000 行 10 列、本番)では、0 / 5 / 10 ms で失敗し、20 ms 以上で通りました。
- dev で StrictMode あり 2000 行だと、80 ms でも失敗しました(1 回の描画が約 110 ms かかるため)。
- `imeDirectInput` を有効にしても、5 ms と 10 ms で失敗しました。

**仕組み(トレースから)**
1. Enter の keydown でエディタが外れ、フォーカスが body へ落ちます(約 6 ms 後に focusout、activeElement が body)。
2. `.ssg-shell` へフォーカスが戻るのは次のフレームです(さらに約 7 ms 後)。
3. その間に来たキーは body に届き、捨てられます。トレースでは `33.0 keydown 3 tgt=body act=body`。
4. 次のキーはシェルで新しい編集を始めてしまうため、値の頭が欠けます。続く Enter の届き先もずれることがあり、値が別の行へずれます。

**どこで起きるか**
- バーコードリーダー(HID キーボードとして 1 文字数 ms で打ち、末尾に Enter が付く)、RPA やキーボードマクロ、パスワードマネージャーなどの自動入力。在庫の画面では普通の使い方です。
- 人の手で打つ速さなら、本番では起きにくいです。
- Playwright の `keyboard.type`(1 キーずつ待つ)では 10/10 通るため、利用側の E2E テストでは気付けません。
- jsdom でも `user.keyboard('aa{Enter}bb{Enter}cc{Enter}')` が 6 回中 1 回 "bb" を失い、テストが不安定になります。

**回避策**: スキャナの文字間隔を 20〜30 ms 以上に設定する。または別の入力欄で受けてから `applyRows` で書く。

**証拠**
- 最小再現: /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/r19/src/repro.tsx(`?cols=6` で 6 列、`?ime` で `imeDirectInput`)
- 送るスクリプト(Enter): /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/r19/fasttype-cdp2.cjs(`PAGE=/repro.html COL=code GAP=5`)
- 送るスクリプト(Tab): /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/r19/fasttype-tab.cjs
- Tab の測定結果: /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/r19/fasttype-tab-prod.txt
- イベントのトレース: /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/r19/trace-repro-prod-gap5.txt(トレースのスクリプトは同じフォルダの fasttype-trace2.cjs)

### K-02 テストのガイドの「スタブ適用後は本体行 / 全列を描画」が事実と違う

- 重要度: 中(ドキュメントどおりに書くと動かない) / 種類: ドキュメント / jsdom / 確度: 確実
- **再現手順**: guides/testing の手順で `installJsdomLayoutStubs()`(既定 1200×600)を入れ、100 行のグリッドと、120px の列 20 本のグリッドを描きます。
- **期待**(ガイドの文「スタブ適用後は実グリッドが本体行 / 全列を描画する」): 全行・全列が DOM にある。
- **実際**:
  - 行は約 38 行、列は約 18 列しか描かれません。仮想化が効いたままです。
  - グリッドの `height` を変えても描かれる量は変わらず、スタブの大きさで決まります。
  - そのため、最後の列や 50 行目を探すテストは null になります。

### K-03 テストのガイドに、よく書く操作の書き方が無い

- 重要度: 低 / 種類: ドキュメント / jsdom / 確度: 確実
- ガイドに無く、自分で調べて分かったこと:
  - **貼り付け**: `user.keyboard('{Control>}v{/Control}')` では貼り付かない。グリッドは paste イベントの clipboardData を読むので、`user.paste()` を使う。
  - **コピー**: 書き出された中身を確かめる方法(navigator.clipboard の差し替え)。
  - **スクロール**: `scrollToRow` は jsdom では何もしない(スタブの `scrollTo` が no-op)。`.ssg-scroll-container` の `scrollTop` を書いて `fireEvent.scroll` を出すと描ける。
  - **ドラッグの範囲選択**: jsdom では座標が無いので `user.pointer` のドラッグが正しい範囲にならない(`end` が `{row:0,col:0}`)。`selectRange` か `Shift+矢印` を使う。
  - **確定のあと**: アクティブセルの移動とフォーカスの戻りが次のフレームになるので、`waitFor` が要る(K-01 と同じ原因)。
  - **date エディタ**: `fireEvent.change` で値を入れる(jsdom の一般的な制約)。
  - **Jest**: CSS の import に `moduleNameMapper` が要る(identity-obj-proxy など)。
  - **スタブを 2 回入れたとき**: 戻す順を逆にしないと、スタブが残る(同じ順に戻すと clientHeight が 600 のまま)。

### K-04 列メニューとフィルターのポップオーバーが、Testing Library の role で探しにくい

- 重要度: 低 / 種類: 使いにくさ(アクセシビリティ) / dev・本番の両方 / 確度: 確実
- 列メニュー `.ssg-menu-panel` には `role="menu"` が無く、項目はただの button です。右クリックメニューは menu / menuitem なので、作りがそろっていません。
- 並び替えの項目の読み上げの名前に矢印の記号が入ります(「↓降順で並び替え」)。`getByRole('button', { name: '降順で並び替え' })` では見つからず、正規表現が要ります。
- フィルターのポップオーバーには role も名前もありません。中の検索欄も placeholder だけで、ラベル(aria-label)がありません。

### K-05 エディタの読み上げの名前が、表記と違う

- 重要度: 低 / 種類: ドキュメント / 確度: 確実
- api/props のアクセシビリティの表には「`aria-label` は「(列名)を編集」」とあります。
- 実際は「品名 を編集」と、半角空白が入ります(文言の表の `editCell` = `{column} を編集` のほうは正しい)。
- このため `getByRole('group', { name: '品名を編集' })` では見つかりません。

### K-06 checkbox の「クリックで即トグル」は、チェックボックスそのものを押したときだけ

- 重要度: 低 / 種類: ドキュメント / 使いにくさ / 本番の実ブラウザで確認 / 確度: 確実
- api/column と guides/editing には「クリック / Space で即トグル」とあります。
- 実際: 幅 70px のセルのうち、16px のチェックボックスの外を押すと、アクティブセルになるだけで切り替わりません。ダブルクリックでも切り替わりません。Space とチェックボックスを押したときは切り替わります。
- 測定値: 端を押したあと `aria-checked` は false のまま → Space で true → チェックボックスを押して false。
- 確認スクリプト: /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/r19/checkbox-click.cjs

### K-07 React 18 で、包む部品に ref を素通しすると、型は通るのに ref が null

- 重要度: 中 / 種類: 型 / 確度: 確実
- **再現手順**: React 18 と @types/react 18 で、`function MyGrid(props: SpreadsheetGridProps<Item>) { return <SpreadsheetGrid {...props} /> }` を作り、`<MyGrid ref={r} />` と書きます。
- **型**: `SpreadsheetGridProps` に `ref` が含まれるので、エラーになりません。
- **実際**: `r.current` は null のままで、ハンドルの API がすべて使えません。
  - dev では「Function components cannot be given refs」の警告が出ます。
  - 本番では何も出ません(`plain=null forward=set`)。
- **回避策**: `forwardRef` で包む。ただし、この注意は API_REFERENCE にしかありません。
- **証拠**: Next 15 のページ /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/K/next15/pages/wrapper.tsx と、結果の check-dev.json / check-prod.json(同じフォルダ)。

### K-08 `exactOptionalPropertyTypes` で、省略可の prop に undefined を渡せない

- 重要度: 低 / 種類: 型 / 確度: 確実
- `density={cond ? 'compact' : undefined}` が TS2375 になります。省略可の prop に `| undefined` が付いていないためです。
- @tsconfig/strictest を使う利用者が当たります。条件付きのスプレッドで書けば回避できます。

### K-09 コールバックの引数の形が、そろっていない

- 重要度: 低 / 種類: 型(使いにくさ) / 確度: 確実
- `cellClassName` は ctx のオブジェクトを 1 つ受けます。
- `getRowClassName` は `(row, rowIndex, ctx)` の順番の引数です。
- `canEditCell` は `(rowIndex, colIndex, row, column, ctx)` の順番の引数です。
- `getRowClassName` をオブジェクトの引数で書いて、型エラーで気付きました(型が守ってくれるので低)。

### K-10 同梱の文書の、小さな食い違い

- 重要度: 低 / 種類: ドキュメント / 確度: 確実
- SKILL.md は API_REFERENCE.md を「約 1,800 行」としていますが、実際は 2,585 行です。
- API_REFERENCE.md の /lite の表は、`createSpreadsheetGrid` の戻り値を `<T>(props) => JSX.Element` と書いています。d.ts では型引数が `<T, L>` で、`displayName` も付いています。害はありません。

## 4. ピン留め行

無し。

## 5. 要望

- K-01 のついでに: 速い入力でもキーを取りこぼさないと、バーコードでの入力に使えます。
- テスト用の補助:
  - `/testing` のスタブで、`scrollTo` が `scrollTop` に反映されるようにしてほしい。
  - セルを取る関数(行と列キーでセルを返す、など)が欲しい。
- `GridColumn.key` を `keyof T` の候補で補完したい。今は `string` なので打ち間違いに気付けません。
- 列メニューに `role="menu"` を付け、フィルター欄にラベルを付けてほしい。
- 省略可の prop に `| undefined` を付けてほしい(K-08)。

起動したサーバーは PID を指定してすべて止め、ポート 5411 / 3411 は空いています。ほかのアプリのブラウザ(B のもの)には触っていません。
