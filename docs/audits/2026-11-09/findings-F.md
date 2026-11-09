# F. 見積書(React 18.3)報告

作業場所は `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/F/`(ポートは 5406)。5406 番の開発サーバーは PID で止め、残っているブラウザもない。以下の `pw/` はこのフォルダのスクリプト、`shots/` は画像のフォルダ。

## 1. 作ったもの

- **構成**:
  - Vite 7.3.7 + React 18.3.1 + `@types/react` 18.3.31 + TypeScript 5.9.3(strict / `skipLibCheck: false` / `verbatimModuleSyntax`)を npm で入れた。
  - グリッドは `@ishibashi0112/spreadsheet-grid@1.0.0`(core 1.0.0)。
  - `main.tsx` で `<StrictMode>` を付けた。
- **行の型**: `Section | Item` の判別共用体。
  - ラベル行は工事 / 材料 / 諸経費の 3 区分で、品目は 14 行。`?extra=N` で材料に N 行を足せる。
- **ラベル行(`labelRow`)の設定**:
  - 型ガード付きの `isLabelRow` と `getLabel` を使い、`sticky` と `height` 34 を指定した。
  - `render` で区分名・件数・小計(アプリで計算)と、ボタン「名前を変更」「＋ 行」を出した。
  - `exportText` は配列 `['【工事】','','','小計',小計,'']` にした。
- **列**:
  - 品名: custom エディタ。品目マスタを非同期に検索して候補をポップアップで出す(150〜450ms の遅延、abort 可)。
    - ↑↓ / Enter / Tab / Shift+Tab / Esc で操作でき、変換中は無視する。
    - 候補を選ぶと `setValue` で単位と単価も入る。必須の `validate` を `mark` で付けた。
  - 数量: number(min 0、step 0.5、`numberFormatter()`)
  - 単位: select
  - 単価: number(integer、円の書式)
  - 金額: `editable: false` の計算列。`getValue` で出し、`aggFunc: 'sum'` を付けた。
  - 備考: flex 1。text の `multiline` + `enterKey: 'newline'` + `autoHeight`。
- **合計行**: `totalRow` に「合計(税抜)」と出した。消費税と税込の額はグリッドの外のヘッダーに表示した。
- **行の操作**:
  - 行の挿入: ボタン、Ctrl/⌘+Enter、右クリックメニューの「上に挿入 / 下に挿入 / 複製」。
    - `flushSync(() => applyRows())` の後に `getViewRowIndex` / `getColIndex` → `startEditing` で編集を始める。
  - 行の削除: ボタン、Ctrl/⌘+Delete、右クリックメニュー。
  - 区分の追加と名前の変更、行ドラッグ(`enableRowDrag`。`?drag=live` で live 方式)。
- **その他**:
  - 検証ボタン: `getInvalidCells` → `getRowNumber` → `selectCell`。
  - CSV: `downloadCsv('見積書.csv', { includeLabelRows, includeTotalRow })`。
  - 印刷用の `@media print`、`?ime=1` で `imeDirectInput`、`?pin=1` で品名を固定。
- **最小再現の環境**: `mini.html` + `src/mini.tsx` に置いた(`?case=` で切り替え)。
  - 中身は ref の渡し方 3 通り、ポップアップ、ドラッグ、右クリックメニュー、検証、ガード無しの custom エディタ。
- **操作のスクリプト**: Playwright(Chromium、deviceScaleFactor 1)のスクリプトが `pw/01〜38`、スクリーンショットは `shots/`。
- **本番ビルド**: `tsc && vite build` が通った。
  - JS は 579.59 kB(gzip 188.12 kB。React 18 + 全部入りを含む)、CSS は gzip 13.04 kB。
  - `vite preview` でも主な操作を流し、開発版と同じ結果だった。

## 2. 確かめた操作(問題なかった範囲を含む)

**React 18 と警告**
- 開発版と本番版のどちらも、StrictMode で console の warning / error と pageerror は 0 件だった。
- ref は直接渡しても `forwardRef` で包んだ部品経由でも取れた。`forwardRef` の無い部品で包むと null になり React の警告が出るが、これはドキュメントどおり(pw/24)。

**型**
- 判別共用体の行、`labelRow` の型ガード、`CellEditorContext<Row>`、`setValue` で受けるオブジェクト(候補を選んだ値)は、注釈を足さずに `tsc` が通った。

**編集**
- number:
  - 全角の数字、カンマ付きの数字、`-` から打ち始めるとき、`min` を下回ったときの印を確かめた。
- select:
  - 単位の候補から選べた。
- 備考(multiline):
  - Enter で改行、Ctrl+Enter / Tab で確定、Esc で取り消し、自動の高さ。
  - 長い備考を編集したまま上下にスクロールしても問題なかった(pw/32)。
- 品名の custom エディタ:
  - Enter・Tab・Shift+Tab での確定と移動、Esc での取り消し。
  - 外をクリックしたときの blur での確定、候補を選んだときの単位・単価の展開。
  - 候補を選ぶ確定が undo 1 回で戻ることも確かめた。
  - ガードを付けずに Enter → blur としても 2 回確定にならず、Esc の後に blur しても確定されなかった(pw/38)。
- `imeDirectInput`:
  - text / number 列は IME オンのまま打ち始められた。
  - custom 列だけ変換が捨てられる(F-06)。

**行の挿入と削除**
- ボタン、ショートカット、右クリックメニューで挿入・削除し、挿入した行で編集を始められた。
- 選択した複数行の削除で、ラベル行は除外できた。

**行ドラッグ(ghost / live)**
- 区分をまたぐ移動、ラベル行の上半分・下半分へ落としたときの位置、undo / redo を確かめた。
- `isRowDraggable` でラベル行を止められた。
- ソート中はハンドルが無効になった。
- `moveRow` で品目を別の区分へ移せた。
- `moveRow` でラベル行を動かすと見出しだけが動き、品目は付いてこない(仕様と思われるので要望へ)。

**undo / redo**
- セルの編集、`applyRows`、貼り付け、ドラッグ、候補での確定が、混ざっても 1 手ずつ戻り、`onUndoRedoStateChange` も合っていた。

**貼り付け**
- ラベル行をまたぐ貼り付け、読み取り専用の金額列を飛ばすこと、末尾を越えた分を `createRow` で足すことを確かめた。
- Delete でセルを消すと、必須の印が付いた。
- コピーにラベル行は入らなかった。

**並べ替えと絞り込み**
- 区分の中だけで並べ替わり、ラベル行は動かなかった(shots/13-sorted.png)。
- グローバルフィルター(小計のずれは F-07)。

**エクスポート**
- `exportCsv` / `getExportData` / `downloadCsv` に `exportText` の配列が出て、`includeTotalRow` と BOM も付いた。

**ラベル行のボタン**
- 本物の行と、sticky で上に残ったときの複製のどちらでもボタンが効いた(pw/18)。
- 区分の追加後に表示も合っていた。

**ハンドル**
- `focus` / `startEditing` / `getState` / `applyState`。
- `scrollToRow`(sticky のラベル行と合計行に隠れなかった)/ `selectCell`。
- `getSelectedRows` / `getInvalidCells`(ラベル行は含まない、pw/36)/ `getRowNumber` / `canUndo`。

**キー操作**
- Ctrl+Home / Ctrl+End / PageUp / PageDown、Tab で表に入ると最初のデータ列に着くこと。

**列と表示**
- 列の幅の変更とダブルクリックでの自動の幅。
- 狭い画面と品名の固定(flex 列が 50px まで縮むのはドキュメントどおり)。
- 1,000 行規模で `autoHeight` の行をスクロールしても問題なかった。

**印刷**
- `emulateMedia print` + `page.pdf`。`height="100%"` のまま親の高さを auto にすると全行が出た(崩れ方は F-08)。

## 3. 所見

### F-01 [中] 不具合: 右クリックメニューの `onSelect` で `startEditing()` を呼ぶと、true を返すのにエディタがすぐ閉じる

- **最小再現**: `mini.html?case=ctx`
  1. `getContextMenuItems` の `onSelect` で `ref.current.startEditing()` を呼ぶ。
  2. セルを右クリックして、その項目を選ぶ。
- **期待**: 選んだセルの編集が始まる。
- **実際**:
  - `startEditing()` は true を返すが、エディタはすぐ閉じ、フォーカスは `.ssg-shell` へ戻る。
  - `setTimeout(() => startEditing(), 0)` にすると開く。
  - 行を挿入してから `startEditing` するパターンでも同じだった。
- **証拠**: pw/31-mini-ctx.cjs の出力。

  ```
  このセルを編集 {"started":true,"editor":false,"focus":"DIV.ssg-shell"}
  setTimeout 版   {"started":true,"editor":true}
  ```

  本体のアプリでは pw/29・pw/30 で再現した。
- **dev / 本番**: dev で確認。本番でも同じ手順で再現した。
- **確度**: 確実。
- **補足**: メニューを閉じたときのフォーカスの戻しが、開いたエディタを閉じていると思われる。ドキュメントにも「メニューから編集を始めるときは次のタスクで」とは書かれていない。

### F-02 [中] 使いにくさ / 不具合: 行ドラッグのハンドルを押してもグリッドにフォーカスが移らず、直後の Ctrl+Z が外の入力欄の文字を戻す

- **最小再現**: `mini.html?case=drag`
  1. 「外の入力欄」に abc → def と打つ。
  2. グリッドの行ドラッグのハンドルで 1 行動かす。
  3. Ctrl+Z を押す。
- **期待**: 行の移動が戻る(ドラッグした直後なので、利用者はグリッドを操作した気でいる)。
- **実際**:
  - フォーカスは外の入力欄(または BODY)に残ったまま。
  - Ctrl+Z で入力欄が abcdef → abc に戻り、行の移動は戻らない。
- **証拠**:
  - pw/26-mini-drag.cjs / pw/26b(最小再現)
  - pw/08(見積書の「件名」の入力欄)
  - pw/07(ページを開いた直後、フォーカスが BODY のとき。Ctrl+Z が効かない)
- **dev / 本番**: どちらでも起きた。
- **確度**: 確実。
- **回避策**:
  - `onRowMove` で `gridRef.current?.focus()` を呼ぶ。
  - または先にセルを 1 回クリックしておく。

### F-03 [中] ドキュメント: custom エディタのポップアップを枠の外へ描くと、スクロール領域で切れ、下の方の行では合計行に隠れる

- **根拠のドキュメント**: API_REFERENCE の custom の枠の説明に「枠より大きい部品…ははみ出して描いてよい」とある。それに沿って、候補の一覧を `position: absolute; top: 100%` でセルの下へ出した。
- **最小再現**: `mini.html?case=popup`
  - `totalRow` あり。最後のデータ行で編集を始め、候補を出す。
- **期待**: 一覧が全部見えて選べる。
- **実際**:
  - スクロール領域の下端で切れる。
  - sticky の合計行が上に重なり、候補の上の点が合計行に当たる。
  - 途中の行でも、下の方では同じことが起きる。
- **証拠**:
  - pw/25 の出力: `{"popupTop":380,"popupBottom":474,"scrollBottom":416,"hit":"ssg-total-label 合計"}`
  - shots/25-mini-popup-last.png / 18-popup-bottom-inline.png / 19-add-section.png
- **dev / 本番**: どちらでも起きた。
- **確度**: 確実。
- **回避策**:
  - `createPortal(…, document.body)` + `position: fixed` にすると問題ない(pw/18 の portal 版)。
  - このとき候補の `onMouseDown` で `preventDefault` すれば、クリックでエディタが閉じない。
- **提案**: ドキュメントに「表の高さを越える部品は portal で」と例を足してほしい。

### F-04 [低] 不具合(一貫性): 先頭のデータ列から Shift+Tab すると、行ドラッグのハンドル列に止まる

- **最小再現**: `mini.html?case=drag`
  1. 先頭のデータ列のセルを選ぶ。
  2. Shift+Tab を押す。
- **期待**: Home / Ctrl+← と同じく合成列を飛ばし、グリッドの外(または前の行の末尾)へ出る。
- **実際**:
  - ハンドル列に止まり、バーには「移動 3」と出る。
  - 外へ出るには Shift+Tab がもう 1 回要る。
  - エディタの中での Shift+Tab と、custom の `commit(v, 'left')` でも同じだった。
  - Home / Ctrl+← と、Tab でグリッドに入るときはハンドル列を飛ばす。
- **証拠**: pw/28-mini-shifttab.cjs、pw/20 / pw/21
- **dev / 本番**: dev で確認。
- **確度**: 確実。

### F-05 [低] ドキュメント: 検証のレシピが README の規則と食い違い、合成列があるとずれる

- **場所**: API_REFERENCE(1152 行付近)と docs `api/column.mdx`(163 行付近)の、`getInvalidCells` から最初のエラーへ移るレシピ。
- **期待**: 書かれたレシピで最初のエラーのセルへ移れる。
- **実際**:
  - レシピは `scrollToCell(first.sourceRowIndex, columns.findIndex(...))` と書いている。README の「データの index とビューの index を混ぜない」という規則と食い違う。
  - 行ドラッグのハンドルなどの合成列があると 1 列ずれる。
  - コメントの「rowKey からビュー index を自前解決」は古い。今は `getViewRowIndex` / `getColIndex` / `getRowNumber` がある。
- **確認**: `getViewRowIndex` + `getColIndex` に置き換えると正しく移れた(pw/36)。
- **確度**: 確実(ドキュメントの記述)。

### F-06 [低] 使いにくさ: `imeDirectInput` を使っても、custom エディタの列では IME の変換が捨てられる

- **最小再現**: `?ime=1` で品名のセルを選び、IME で「くろす」→「クロス」と確定する。
- **期待**: 変換した文字で品名の編集(候補の検索)が始まる。
- **実際**:
  - 何も起きない(これは記載どおり)。
  - 日本語の品名を打つには先に F2 が要る。
  - text / number の列は問題なかった。
- **証拠**: pw/17-ime.cjs
- **dev / 本番**: dev で確認。
- **確度**: 確実。
- **要望**: custom にも確定した文字を `initialText` として渡す選択肢がほしい(要望へ)。

### F-07 [低] 使いにくさ: 区分ごとの小計を出す API が無く、絞り込むと合計行と食い違う

- **状況**:
  - ラベル行の `render` の ctx には、絞り込んだ後の件数 `sectionRowCount` しか無い。
  - そのため小計は全行からアプリで計算するしかない。
- **最小再現**: グローバルフィルターに「クロス」と入れる。
- **期待**: 小計と合計行が同じ範囲の行で計算される。
- **実際**:
  - ラベル行は「1 件 小計 ¥791,250」(全行の小計)、合計行は 164,150(絞り込んだ後の合計)。
  - 区分の中の見えている行だけを ctx から取る方法が無い。
- **証拠**: pw/23、shots/23-filter-subtotal.png
- **dev / 本番**: どちらでも起きた。
- **確度**: 確実。

### F-08 [低] ドキュメント: 印刷の案内と印刷用の CSS が無い

- **最小再現**: 親の高さを auto にし、`height="100%"` のまま `emulateMedia('print')` で PDF にする。
- **期待**: ドキュメントに印刷のやり方がある。または、そのままである程度整って印刷される。
- **実際**:
  - 全行は出る。
  - ページの境目で行が上下に切れる。
  - 2 ページ目以降に列見出しが出ない。
  - 行ドラッグのハンドル列と下部バーも印刷される。
- **証拠**: shots/15-print.png、15-print-extra-page-1.png / 15-print-extra-page-2.png、boundary.png
- **確度**: 確実(見た目)。

### F-09 [低] 使いにくさ(a11y): 右クリックメニューをキーボードで開けない

- **最小再現**: セルを選んで Shift+F10 か ContextMenu キーを押す。
- **期待**: そのセルの右クリックメニューが開く。
- **実際**: 何も出ない。
- **証拠**: pw/29
- **確度**: 確実。

### F-10 [低] 使いにくさ: 最終列から Tab すると、ラベル行の `render` に置いたボタンへ DOM の順に入る

- **最小再現**:
  1. ラベル行の `render` にボタンを置く。
  2. 最終列のセルで Tab を押す。
- **期待**: ドキュメントの「最終列の Tab 1 回でグリッドの外へ」のとおり外へ出る。または、その順番がドキュメントに書かれている。
- **実際**:
  - いちばん上のラベル行のボタンから順にフォーカスが移り、その後で外へ出る。
  - `labelRow` のドキュメントには、`render` の中のボタンと Tab の関係が書かれていない。
- **証拠**: pw/22
- **確度**: 確実。
- **回避策**: ボタンに `tabIndex={-1}` を付ける。

### F-11 [低] 使いにくさ: 右揃えの列見出しで、マウスを乗せている間はソートの矢印が ⋮ の下に隠れる

- **最小再現**: 単価(右揃え)で並べ替え、その見出しにマウスを乗せる。
- **期待**: 並べ替えの向きが見えたまま。
- **実際**: ⋮ と重なって矢印が見えない。
- **証拠**: shots/14-sort-header*.png
- **確度**: 中(見た目の判断)。

## 4. ピン留め行

任意の行を固定する使い方は無かったが、次の 2 つは欲しかった。

- **下に複数の行を固定する**:
  - 合計(税抜)/ 消費税 / 御見積金額(税込)の 3 行を固定したい。
  - `totalRow` は 1 行だけなので、消費税と税込はグリッドの外のヘッダーに出した。
- **区分ごとの小計の行**:
  - 区分の末尾に小計の行を置きたい。
  - 今はラベル行の帯に小計を書いて代わりにしている(F-07 の食い違いが残る)。

## 5. 要望

1. ラベル行の `render` の ctx に、区分の集計(見えている行の列ごとの `aggFunc` の値)を渡してほしい。または区分の小計の行を出せるようにしてほしい(F-07)。
2. 合計行を複数の行にしたい(税抜 / 税 / 税込)。
3. 右クリックメニューをキーボード(Shift+F10 / ContextMenu キー)で開きたい(F-09)。
4. 区分ごと並べ替えたい。ラベル行をドラッグしたら、配下の行も一緒に動くようにしてほしい。
5. `imeDirectInput` で、custom エディタにも確定した文字を `initialText` で渡したい(F-06)。
6. 印刷の手順(印刷用の CSS、ハンドル列とバーを隠す、見出しを各ページに繰り返す)を案内してほしい(F-08)。
7. 行ドラッグのハンドルを押したらグリッドにフォーカスを移してほしい(F-02)。キーボードで行を動かす操作(例: Alt+↑↓)もあると嬉しい。
8. 右クリックメニューの `onSelect` で、`startEditing()` などがそのまま効くようにしてほしい(F-01)。