# 1-6 後半の実アプリの所見(S8・S11)

2026-11-22。0.1.0 の HEAD(7749665)を pack した tarball で作った。`$D` = 作業した時のスクラッチ(`dogfood-q`)。アプリのソースは `audit/dogfood/2026-11-22-solid-quality/`。以下は担当の報告のまま。

## 報告(S8・S11)

S8 と S11 の 2 本を作って確かめました。いちばん重いのは S8-01(高・Solid だけ)です。サーバーとブラウザでタイムゾーンが違う SSR では、固定列に別の行の日付が残り、そのセルを直すと別の予約が書き換わります。S11 では、Shadow DOM の中だけ効かない操作が 4 つ見つかりました(ツールチップ / IME の直接入力 / メニューの ↑↓ / ツールパネルのフォーカス)。どれも React 版 1.2.1 でも同じです。

パスの `$D` は `/tmp/claude-0/-home-user/3e0b10c7-25c1-5991-99b0-b5ddd5fe5ce3/scratchpad/dogfood-q` です。自分で起動したサーバー(3508 / 5508 / 5511)とブラウザはすべて止め、残っていないことを確かめました。今残っている Chromium は S12 のものです。

---

# S8. 予約表(日付と SSR)

## 1. 作ったもの
- **構成**:
  - Vite 8.3.8 の SSR。Node のサーバー `$D/S8/server.js` は自分で書きました(dev は middlewareMode + ssrLoadModule、本番は `dist/client` + `dist/server`)。
  - solid-js 2.0.3、@solidjs/web 2.0.3、@solidjs/router 2.0.1、@solidjs/vite-plugin 3.0.1(`ssr: true`)、TypeScript 6.0、グリッドは tarball の 0.1.0。
  - 描き方は `renderToStream`(既定)と `renderToString`(`?_ssr=string`)の両方。`provideRequestEvent(createRequestEvent(req))` で包み、クライアントは `hydrate`。本番の形は `NODE_ENV=production`。
- **予約のページ `/`**(687 行。種を固定したデータで、2026-10-01〜12-31)。列は 8 つ:
  - 日付: 左に固定、date エディタ、dateSet、曜日つきの書式、validate
  - 開始 / 終了: 時刻の validate
  - 部屋: select / set
  - 予約者: textSet
  - 人数: number(min 1・integer)、定員の validate、aggFunc sum
  - 用途: 複数行、flex
  - 登録日時: Date の値、読み取り専用、dateSet、Asia/Tokyo の Intl 書式
- **ツールバー**: すべて / 今日 / 今月 / 過去 30 日 / 11 月後半 / CSV。
- **URL との同期**: フィルターと並びを URL のクエリと同期します。クエリから `initialState` を作り、`onStateChange` → `setSearchParams`、戻る / 進むは `applyState`。
- **そのほかの props**: totalRow / enableContextMenu / find / imeDirectInput。
- **ほかのページ**: 会議室の一覧 `/rooms`。今週 `/week` は `createSignal(async)` + `<Loading>` で、300ms 待ってから行を返します。
- **React 1.2.1 の比べるアプリ**: `$D/S8/react-min/`(同じ形の SSR の最小の再現 + 同じ予約表 `cmp.html`)。
- **Solid の最小の再現**: `$D/S8/min/`。

## 2. 確かめた操作
特に書いていないものは、dev と本番(`NODE_ENV=production`)の両方で問題がありませんでした。

- **SSR の HTML とハイドレーション後の比べ(タイムゾーンが同じとき)**:
  - JS なしで取ったサーバーの描画と、ハイドレーションした後を比べました。下部バーの件数、`aria-rowcount`、先頭の行がすべて一致し、警告もありませんでした。
  - 試した URL: `/`、`?date=today|thisMonth|last30days`、`?from&to`、`?room=`、`?sort=`、`?f=`(登録日時の範囲)。
  - 組み合わせ: stream / string × サーバー UTC・東京 × ブラウザ UTC・東京。
- **タイムゾーンがずれたとき**(サーバー東京 / ブラウザ ホノルル):
  - `?date=today` は件数がサーバーのまま(1 件。ブラウザでは 2 件のはず)で、Hydration key miss が出ます。既知の S2-22 と同じです。
  - 日付の範囲の条件では、S2-22 とは別の形のずれが出ました(S8-01)。
- **深夜 0 時をまたぐ**(`page.clock`): どれも日付の変わり目に追従しました。
  - 今日: 1 件 → 12 件
  - fastForward で 3 時間進める: 追従
  - 今月(11/30 → 12/1): 211 → 228 件
  - 過去 30 日: 202 → 213 件
- **date エディタ**: Solid と React は同じ結果です。
  - 読めた形: 「2026/11/1」「2026年11月7日」「2026-11-09」「11/12/2026」。半角で打ち始めた後に続けた全角(２０２６／１１／５、年月日、．、－)も読みました。「2026/11/17 10:00」は日付だけ読みます。
  - 読めない「11/1」「2026/2/30」には「日付で入力してください(例: 2026/3/15)」と出て、Escape で元に戻ります。
- **URL の同期とページの行き来**:
  - ボタン / 列フィルター / 列メニューのソート / 範囲の日付欄 → URL に書かれます。戻る / 進むを 3 回 → 表の条件が戻ります。
  - 編集中・列フィルターを開いたまま・列メニューを開いたまま・右クリックメニューで別のページへ移っても、ポップアップは残りません。戻るとグリッドが URL の条件で付き直します。
  - 自分のアプリでは、effect の apply で `location.query` を読んで STRICT_READ_UNTRACKED が出ていました。compute で読むように直すと消えました。
- **今週のページ(非同期の行)**:
  - stream: 本番で殻が 29ms、グリッドが 327ms のチャンクで届きます。
  - string: HTML にグリッドは無く、ハイドレーションの後に出ます。
  - クライアントの遷移(読み込み中 → 1.3 秒後に表)、編集と元に戻す: どれも問題ありませんでした。
- **そのほか**: CSV の出力、列フィルターの出る位置(右寄せ・端では 8px に収める。React と同じ)。
- 重さで目立つものはありませんでした。

## 4. 所見

### S8-01 高 / 不具合 / Solid だけ / 回帰ではない(新しいアプリ。前の点検にこの条件は無い)
**題名**: SSR でサーバーとブラウザのタイムゾーンが違うとき、Date の値の列に日付の範囲の dateSet を `initialState` で入れると、固定列のセルにサーバーの行の文字が残る。そのセルを編集すると別の行が書き換わる。

- **再現(最小)**: `$D/S8/min/src/App.tsx`(40 行)。
  - 列: `label`(左に固定)と `at`(Date、dateSet)。
  - `initialState` に `{kind:'dateSet', condition:{mode:'range', from:'2026-11-03', to:'2026-11-05'}, set:null}`。
  - `TZ=Asia/Tokyo node server.js`(5508)で起動し、Playwright の `timezoneId: 'Pacific/Honolulu'` で開きます(`$D/S8/e2e/min-tz.cjs`)。
- **期待と実際**:
  - 期待: 固定列と中央の列が同じ行を出す。
  - 実際: 中央の列はブラウザで絞り込んだ行(2026-11-03T15:00Z …)を出すのに、固定列は「行6〜行13」(サーバーの行)のままです。
  - React 1.2.1(`$D/S8/react-min/`)は「Hydration failed … regenerated on the client」で作り直され、固定列は「行8〜行15」で中央の列とそろいます。
  - Solid は「Hydration key miss … A detached element was created instead」「Hydration completed with 10 unclaimed server-rendered node(s)」「UNSCOPED_HOLE_ALLOCATED_IDS」を出したまま、直りません。
- **アプリでの影響**:
  - `?f={"createdAt":{"kind":"dateSet","condition":{"mode":"range","from":"2026-11-01","to":"2026-11-03"},"set":null}}` で開きました(サーバー東京 / ブラウザ ホノルル)。
  - 件数はサーバーの 18 件のままです。ホノルルで正しいのは 16 件。
  - 18 行のうち 2 行は、固定列の「日付」がその行の日付と違います。スクロールしても並べ替えても直りません。
  - 固定列に「2026/11/03(火)」と見えているセルを 2026/12/24 に直すと、別の予約(キー 268、登録 2026/11/04 17:18)の日付が書き換わりました。CSV の `2026-12-24,11:30,12:30,E,山本,3,予算会議,…` で確かめています。
  - サーバーは UTC、利用者は日本、のようなよくある構成で起きます。
- **証拠**: `$D/S8/shots/min-Pacific_Honolulu.png`(Solid)、`react-min-Pacific_Honolulu.png`(React)、`tz-stale-prod.png`、`tzmis-stream-7.png`。台本は `$D/S8/e2e/tz-stale.cjs`、`tz-edit.cjs`。
- dev と本番の両方で起き、確度は確実です。
- **S2-22 との違い**: S2-22(相対プリセット、件数・行数のずれ)と根は同じかもしれません。ただ今回は、相対プリセットではなく絶対の範囲で起き、固定列の中身が別の行になり、編集が別の行に入ります。

### S8-02 低 / 不具合 / React 版も同じ / 回帰ではない
**題名**: 列フィルターの日付の入力欄(範囲の開始日・終了日)が、全角・年月日・ドットを読まない。セルの date エディタは同じ文字を読むので、2 つの入力欄で食い違う。

- **再現**: `?from=2026-11-16&to=2026-11-30` で日付の列フィルターを開き、開始日に次を打ちます。
  - 「２０２６／１１／２０」「2026年11月21日」「２０２６－１１－２２」「2026.11.23」は、どれも `aria-invalid=true` で条件が変わりません。
  - 「2026/11/24」だけ効きます。
- **証拠**: `$D/S8/e2e/filter-date-fw.cjs`(Solid 3508 / React cmp 5508)。
- dev で確かめ、確度は確実です。

### S8-03 低 / 不具合 / React 版も同じ / 回帰ではない
**題名**: 相対プリセット(今日)の dateSet フィルターを開いたまま 0 時をまたぐと、表は新しい日に移るのに、ポップアップの値の木が古い日のまま。

- **再現**: `?date=today` で 23:59:30 に列フィルターを開き、`page.clock.runFor(60s)` で 0 時を越えます。
- **期待と実際**:
  - 表は 12 件の 11/23 に変わります。
  - ポップアップの値の木は「22 日」で「一致 1 件」のままです。開き直すと「23 日」になります。
- **証拠**: `$D/S8/e2e/midnight2.cjs`、`midnight2-react.cjs`、`$D/S8/shots/midnight-*`。
- dev で確かめ、確度は確実です。

### S8-04 低 / ドキュメント(不具合寄り)/ React 版も同じ / 回帰ではない
**題名**: 今日の絞り込みで編集中に 0 時をまたぎ、その行が絞り込みから外れると、打ちかけが黙って捨てられ、フォーカスが BODY に落ちる。

- **再現**: `?date=today` で 23:59:30 に用途のセルを編集し、「打ちかけ」まで打ちます。そのまま 0 時を越えます。
- **期待と実際**:
  - 期待: 確定するか残すか、ドキュメントに書いてあること。
  - 実際: エディタが閉じて値は保存されず、`document.activeElement` が BODY になり、キー操作が効かなくなります。
- **証拠**: `$D/S8/e2e/midnight.cjs`(シナリオ `editing`)、`midnight2.cjs` / `midnight2-react.cjs`。
- dev と本番の両方で起き、確度は確実です。

### S8-05 低 / 不具合(見た目)/ React 版も同じ / 回帰ではない
**題名**: select の候補を開いたまま並びが変わると(`applyState` でソートを外す / URL の戻る)、エディタは新しい行の位置へ動くのに、候補の一覧は元の位置に残ってエディタに重なる。

- **再現と実際**:
  - Solid は、開いたとき候補の上端 238 / エディタ 200 が、並びの後は候補 238 / エディタ 236 になります。
  - React も、202 / 164 → 202 / 200 と同じ動きです。
  - 選んだ値は正しい行(キー 251)に入ります。
- **証拠**: `$D/S8/e2e/select-reorder.cjs`。
- dev で確かめ、確度は確実です。

**記録(所見にはしない)**: dev で `[EFFECT_RELAY_TEAR] … after effect "clampSelectionToRowCount" relayed it by writing "signal"` が出ました。README の「Development diagnostics」の effect の名前の一覧に `clampSelectionToRowCount` はありません。

## 5. Solid の利用者として
- README の SSR の手順(`createRequestEvent` / `provideRequestEvent` の import 元)どおりに書けました。
- Solid のページに書いてほしいこと:
  - URL と同期する例。`initialState` で入れて、戻る / 進むは `applyState`。自分が書いた URL と区別する方法と、effect の compute で `location.query` を読むことも。
  - 日付の条件(相対プリセットだけでなく範囲も)は、Date の値の列ではタイムゾーンで結果が変わり、SSR ではサーバーのタイムゾーンで決まること。
  - `renderToString` は非同期の行を待たないこと。

## 6. 要望
- `imeDirectInput` を date の列にも効かせてほしいです。今は対象外で、IME オンのまま日付を打ち始めると文字が消えます。エディタは全角の日付を読める作りです。
- 列フィルターの日付の入力欄も、セルのエディタと同じ形(全角・年月日)を読んでほしいです。
- Date の値の CSV は `Tue Nov 03 2026 22:18:00 GMT-1000 (ハワイ・アリューシャン標準時)` の形で出ます。ISO や列の書式で出す方法を案内してほしいです(React 版では確かめていません)。

---

# S11. 埋め込みウィジェット(Shadow DOM と iframe)

## 1. 作ったもの
- **構成**: Vite 8.3.8 + solid-js 2.0.3 + @solidjs/web 2.0.3 + TypeScript、npm。
- **カスタム要素 `<stock-widget>`**(`$D/S11/src/element.tsx`):
  - `attachShadow({mode:'open'})` して、Shadow root の中へ `render` します。
  - CSS は `@ishibashi0112/spreadsheet-grid-solid/style.css?inline` を Shadow root の `<style>` へ入れます。
  - 属性: `popup`(shadow = Shadow の中の要素を `popupContainer` に / body / auto)、`css`(shadow / document / both)、`theme`。
  - `disconnectedCallback` で dispose します。
- **ホストのページ**(`$D/S11/index.html`): 強い全体の CSS を置きました。
  - `html{font-size:20px}`、`body{line-height:2; font-family:Georgia}`、`*{box-sizing:content-box}`、button / input の装飾、`[role=menu]{outline}`。
- **同じ部品を別の形でも**:
  - `<iframe src=frame.html>`: iframe のページが自分のバンドルを読みます。
  - `portal.html`: 親のページが、同じオリジンの空の iframe の document へ描きます。
- **StockWidget**(`$D/S11/src/StockWidget.tsx`): 500 行、7 列。
  - 列: 品番(左に固定)、品名(textSet + cellNote)、カテゴリ(select / set)、在庫数(number、dataBar、sum)、単価、入荷日(date / dateSet)、状態(select、chips)。
  - getContextMenuItems: コピー / 行の削除 / フィルターを管理…
  - そのほか: fillHandle、find、totalRow、imeDirectInput、showCellOverflowTooltip、onColumnsChange。
- **最小の再現**: `$D/S11/min/`(Solid)と `$D/S11/react-min/`(React 1.2.1 + React 19)。どちらも 1 ページに Shadow の中とふつうの DOM の表を 1 つずつ置き、`portal.html` も付けました。

## 2. 確かめた操作
特に書いていないものは問題がありませんでした。本番ビルド(vite build + preview)でも同じ結果です。

- **Shadow の中**(CSS は inline、`popupContainer` は Shadow の中の要素):
  - クリック、矢印、打ち始め / F2 / ダブルクリックの編集、Enter / Tab / Esc、Ctrl+C / V / Z、Delete。
  - Ctrl+F の検索。バーは Shadow の中に出て、mark と Escape も効きます。
  - マウスで範囲を選ぶ、フィルハンドル、列の幅、列の並べ替え(ドキュメントどおり `onColumnsChange` が要りました)。
  - select の候補(マウス / キーボード)。
  - 列フィルター(マウス: チェック・検索・外を押すと閉じる・中を押しても閉じない。キーボード: Alt+↓ → Enter → 打つ → Enter → Escape)。
  - 右クリックメニュー(マウス / Shift+F10)。
  - 「列の固定」の小メニュー(マウス)、ツールパネル。
  - 最終列で Tab を押すとグリッドの外の次のボタンへ移り、Shift+Tab で戻ります。
- **テーマ**: `theme="dark"` / `"auto"`(OS がダーク)で、表もポップアップも暗い色が正しく付きました(セル rgb(26,27,30)、パネル rgb(37,38,43))。Shadow の中に出す形でも、`css=both` で body に出す形でも同じです。
- **iframe(`frame.html`)**: 上の操作はすべて問題ありませんでした。ツールチップ、IME の直接入力、メニューの矢印キーもここでは効きます。
  - 最初、自分のミスで `.stock-widget` に高さを付けておらず、表が全行の高さまで伸びていました。これは `height` の説明に書いてあるとおりの動きです。
- 重さで目立つものはありませんでした。dev では HUGE_FAN_OUT(購読者 2,057〜4,548)が出ます。既知の診断です。ただし props を spread していなくても出ます(README では spread のときだけのように読めます)。

## 4. 所見
S11-01〜S11-04 は、iframe とふつうの DOM では起きず、Shadow DOM の中だけで起きます。原因の見当は、dist(core の controllers)で切り分けて付けたものです。

### S11-01 中 / 不具合 / React 版も同じ / 回帰ではない
**題名**: Shadow DOM の中では、ツールチップがまったく出ない(省略した文字の全文 `showCellOverflowTooltip`、メモ `cellNote`、`data-ssg-tooltip`)。

- **再現**: `$D/S11/min/index.html` と `$D/S11/react-min/index.html` で、`$D/S11/e2e/min-cmp.cjs` を回します。
- **期待と実際**:
  - ふつうの DOM: 「はみ出し → visible」「メモ → visible」。
  - Shadow: どちらも「なし」です。`.ssg-tooltip` の要素自体が作られません。`popupContainer` を Shadow の中にしても同じです。
- **原因の見当**: `tooltipController` は window の pointerover / focusin で `e.target` を見ます。Shadow の外では、その target が host に付け替えられています。
- **証拠**: `$D/S11/shots/min-solid-shadow-tip.png`、`min-react-shadow-tip.png`、`tip-shadow.png`、`tip-iframe.png`。
- dev と本番の両方で起き、確度は確実です。メモは Shadow の中では読む方法がありません。

### S11-02 中 / 不具合 / React 版も同じ / 回帰ではない
**題名**: Shadow DOM の中では、`imeDirectInput` の IME の直接入力が効かない。変換を確定しても編集が始まらず、打った文字が消える。

- **再現**: 品名のセルを選び、CDP の `Input.imeSetComposition` → `Input.insertText('テスト')` で IME の入力をまねます(`$D/S11/e2e/shadow-ime.cjs`、`min-cmp.cjs`)。
- **期待と実際**:
  - イベントは入力受けまで届いています(`compositionend data=テスト`)。
  - それでも `ime.value=""`、エディタなしで、打った文字は消えます。
  - 半角で打ち始めるときは効きます。iframe とふつうの DOM では「editor value="テスト"」になります。
- **原因の見当**: core の `imeInputController` が確定のときに `ownerDocument.activeElement !== input` を見ています。Shadow の中では、document の activeElement は host です。
- **回避**: F2 / Enter で編集を始めてから打つ。
- dev と本番の両方で起き、確度は確実です。

### S11-03 中 / 不具合(キーボード操作)/ React 版も同じ / 回帰ではない
**題名**: Shadow DOM の中では、列メニューと右クリックメニューで ↑↓ が効かない。↓ はいつも先頭へ、↑ はいつも末尾へ移る。

- **再現**: Alt+↓ で列メニューを開き、↓ を 2 回押します。または Shift+F10 で右クリックメニューを開き、↓ を 3 回押します(`$D/S11/e2e/min-keys.cjs`、`menukeys.cjs`)。
- **期待と実際**:
  - 期待: 1 つずつ下へ移る。iframe とふつうの DOM ではそうなります。
  - Shadow: ずっと「フィルター…」/「いち」のままです。Home / End は効きます。
  - キーボードだけの利用者は、先頭と末尾以外の項目を選べません。
- dev と本番の両方で起き、確度は確実です。

### S11-04 中 / 不具合(キーボード操作)/ React 版も同じ / 回帰ではない
**題名**: Shadow DOM の中では、ツールパネルを開いても中へフォーカスが移らない。Tab で中へ入ってから Escape で閉じると、フォーカスが BODY に落ちる。

- **再現**: 右クリックメニュー → `openFilterManager()` を呼ぶ項目、と進みます(`$D/S11/e2e/min-keys.cjs`)。
- **期待と実際**:
  - ふつうの DOM: 開くと「フィルター」のタブへ移り、Escape で入力受けへ戻ります。
  - Shadow: 開いてもフォーカスは入力受けのままです。Tab → Escape で BODY になります。
- dev と本番の両方で起き、確度は確実です。

### S11-05 中 / ドキュメント + 不具合 / React 版も同じ / 回帰ではない
**題名**: Shadow DOM で使う方法がドキュメントに無い。既定の `popupContainer: 'auto'` は Shadow root を考えずに document.body へ出すので、ポップアップに見た目が付かず、ページの CSS がかかる。

- **ドキュメントにあるもの**: API リファレンスで shadow root に触れているのは `/ai` のバーだけです。
- **見つけた方法**: CSS は `style.css?inline` を Shadow root の `<style>` に入れ、`popupContainer` に Shadow の中の要素を渡します。
- **実際**: 既定のままだと、メニュー・列フィルター・select の候補・ツールパネルが body の直下に出ます。背景は透明、位置は static で、ページの下に出ます。ホストの button と `[role=menu]` の装飾もかかります。
- **証拠**: `$D/S11/shots/prod-auto-1-menu.png`、`auto-shadowcss-*.png`、`$D/S11/e2e/popups.cjs`、`min-auto.cjs`(Solid と React のどちらも `document(BODY)`)。
- dev と本番の両方で起き、確度は確実です。

### S11-06 低 / ドキュメント / React 版も同じ / 回帰ではない
**題名**: 本体のセル・バー・ポップアップの文字は、ページの font-size / line-height / font-family を受け継ぐのに、見出しだけ 13px に固定されている。Shadow DOM でも防げない(受け継ぐプロパティは境界を越えるため)。

- **再現**: ページに `html{font-size:20px} body{line-height:2}` を置きます(`$D/S11/e2e/fonts.cjs`)。
- **実際**: セルは 20px / 40px になり、見出しは 13px のままです。行の高さは 36px のままなので、状態のチップが切れます。
- **証拠**: `$D/S11/shots/theme-_popup_shadow_theme_dark_noframe_1.png`。
- 確度は確実です。

### S11-07 低 / ドキュメント(対応範囲)/ React 版も同じ / 回帰ではない
**題名**: 親のページから同じオリジンの iframe の document へ描く形(react-frame-component のような形)では、効かない操作がある。

- **効かない操作**: 列の幅のドラッグ、フィルハンドル、ツールチップ、メニューの ↑↓、メニューの Escape。
- **効く操作**: クリック、キー入力、編集、コピー、範囲のドラッグ、IME。
- **再現**: `$D/S11/min/portal.html` / `$D/S11/react-min/portal.html` で `$D/S11/e2e/min-portal.cjs` を回します。
  - 両方とも「列の幅 120→120 | フィル 0,10,20(変わらない)| ツールチップ なし | ↓ でも先頭のまま | Escape の後もメニュー 1」でした。
- 対応するかどうかがドキュメントに無いので、ドキュメントの所見にしました。
- dev と本番(`$D/S11/portal.html`)の両方で起き、確度は確実です。

## 5. Solid の利用者として
- Shadow DOM の使い方のページがほしいです:
  - `style.css?inline` を Shadow root に入れる
  - `popupContainer` に Shadow の中の要素を渡す
  - `disconnectedCallback` で dispose する
  - 効かない機能(S11-01〜04)
- iframe で使うときの注意もほしいです: 高さを親からつなぐこと、親から描く形には対応しないこと(S11-07)。
- ページの文字の指定を受け継ぐこと(S11-06)と、それを止める書き方(`.ssg-root{font-size:…; line-height:…}`)。

## 6. 要望
- `popupContainer: 'auto'` で `getRootNode()` が ShadowRoot のときは、その中に出してほしいです。
- イベントの target と activeElement を、Shadow DOM に対応した読み方(`composedPath()[0]` / `getRootNode().activeElement`)にしてほしいです(S11-01〜04 が直るはずです)。