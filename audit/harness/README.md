# 監査ハーネス(audit/harness)

2026-10-04 の全体監査(`docs/audits/2026-10-04/`)で使った、ライブラリを実ブラウザ(既定は Chromium。Firefox / WebKit は「他のブラウザで回す」)で叩く自動検証です。
ルートのゲート(tsc / eslint / vitest / build)の**対象外**で、定期的な「壊れていないか」確認に手動で回します。

## 使い方

```bash
# 1. 依存(ルートの devDependencies に playwright-core を含む)
vp install

# 2. ハーネスの dev サーバー(port 5177。ライブラリのソースを直接 import)
pnpm run audit:dev

# 3. 別ターミナルでシナリオを実行(PASS / FAIL を標準出力に出す)
pnpm run audit:test            # 基本 + 1M 行 + SSRM + ライフサイクル + 機能群 + 所見追試 + 集計 + 合計行 + フィルハンドル + 見送り分 + 遅延読み込み + 優先順位 + 1.0 前の最終チェック + アプリを作って確かめたチェック(段階 1 / DevBI / 段階 2)+ 英語 + ダイアログの中のポップアップ + 固定行 + 1.2.0 + ツールパネルの枠の光り + Shadow DOM の中のグリッド
node audit/harness/t-basic.mjs # 個別に 1 本だけ
node audit/harness/perf-big.mjs            # 1M 行の計測(dev ビルド)
HARNESS_BASE=http://127.0.0.1:5178/ node audit/harness/perf-big.mjs  # 本番ビルド(vp build → vp preview --port 5178)に対して
```

- Chromium は `SSG_AUDIT_CHROME`(実行ファイルパス)で指定できる。未指定なら Claude Code クラウド環境の既知パス、無ければ playwright-core の既定解決(`npx playwright install chromium` 済みが前提)。
- シナリオは `main.tsx`(Solid 版は `solid/main.tsx`。下の「Solid 版で回す」)の `?s=<scenario>` で切り替わる: `basic` / `big` / `autoheight` / `grouping` / `detail` / `label` / `rowdrag` / `ssrm` / `empty` / `height` / `two`。`&strict=1` で StrictMode、`&n=<rows>` で行数、SSRM は `&noinit=1` で `initialRowCount` 未指定、autoheight は `&detail=1` で展開行を併用。
- `window.__grid`(ハンドル)/ `window.__rows()` / `window.__setRows` / `window.__setProps` / `window.__setColumns` / `window.__events`(コールバック記録)/ `window.__errors`(console.error / warn)/ `window.__listeners`(window / document リスナー数)/ `window.__ssrm`(SSRM モック制御)を公開しているので、ブラウザの DevTools から手で叩いて追試できる。
- `t-aggregates.mjs` は選択範囲の集計(下部バー)の値・表示・100 万行の時間分割・SSRM の部分集計。
- `t-total.mjs` は合計行(`totalRow`)の値・下端固定・最終行が合計行に隠れないこと(スクロール / 矢印キー / `scrollToRow` / `scrollToBottom`)・横スクロールと固定列の揃い・列ドラッグ(live)・行が少ないとき・ダークテーマ・100 万行・auto-height / グルーピング / ラベル行 / SSRM との併用。
- `t-fill.mjs` はフィルハンドル(`fillHandle`)のハンドルの位置・ドラッグ(点線 / 値のツールチップ / 自動スクロール)・連続データ / コピー・`Ctrl` で入れ替え・`Escape`・上 / 左へ・固定ペインをまたぐ・`validate` の reject / 編集不可を飛ばす・埋めたあとのボタンとメニュー(マウス / キーボード)・元に戻す / やり直し・ダブルクリック・出さないとき・ダークテーマ・グルーピング / ラベル行 / SSRM / 100 万行。
- `t-leftovers.mjs` は §11 で見送り、2026-10-12 に対応した所見(`docs/audits/2026-10-04/README.md` §12)の確認: B-09 flex の幅が整数 px で横スクロールバーが出ない / L-15 相対日付プリセットが深夜 0 時・スリープ明けの focus で翌日へ追従し、プリセットが無ければ何もしない・SSRM は取り直す(「今月」は月内の 0 時では取り直さずスクロールも保ち、月が変わるときだけ取り直す)(`open(…, { beforeGoto: (p) => p.clock.install(…) })` で Playwright の時計を差し込む)/ B-10 100 万行のソート中の編集で並びが正しい(ソート列以外 / ソート列 / 行のその場書き換え)/ M-04 開発ビルドでも 100 万行のソートが数十秒かからない。
- `t-lazy.mjs` は列フィルターポップオーバー / ツールパネルの部品の遅延読み込み(lazy-popups): 先読みを止めると初期表示では読み込まない / 開いたときにその部品だけ読み込む / 読み込みが遅く(`page.route` で遅延)ても出たあと入力欄へフォーカスが入り、複合フィルターも画面内に収まる / 読み込み中に Escape で閉じられる / マウント後の暇なときに先読みし、先読み後は次のフレームで出る / 読み込みに失敗(`route.abort`)しても例外にせず、閉じてキーボード操作を続けられる。失敗後の開き直しはブラウザが失敗した import をキャッシュするため `INFO` として出すだけ。
- `t-priority.mjs` はキーとポインタの優先順位(差し込み式への移行で処理の順番が変わっていないかの見張り。2026-10-24 時点の実際の挙動を期待値にしている): Escape が 1 回で 1 つだけ効く順番(編集 → 列メニュー / フィルター / 右クリックメニュー / ツールパネル → 検索バー → 選択の解除)/ ドラッグ中の Escape(範囲選択・列・フィルハンドル・行。列と行のドラッグは現状、選択の解除にも届く)/ ヘッダーの見出し・⋮・右クリック・幅の境界・grip とセルのダブルクリックの割り当て / `find` の有無と Ctrl+F / Ctrl+C 後とツールチップ表示中の Escape。
- `t-final.mjs` は 1.0 前の最終チェック(`docs/audits/2026-11-05/`)の所見のうち実ブラウザで確かめたもの: FC-01 固定列で ↓ を押し続けても縦に追従する / FC-02 行ドラッグ(live / ghost × `rowKeyGetter` の有無)を離した後の画面の並びがデータと同じ / FC-03 行ドラッグのハンドル列をコピーの TSV に入れない / FC-17 number 列を英字から打ち始めるとその文字が見える(ブラウザの警告なし)/ FC-09 何も変えない確定で `onRowsChange` を呼ばない。
- `t-devbi.mjs` は DevBI(このライブラリを使うアプリ)からの報告(2026-11-07)の確認: 列幅の自動調整のあと最長の値が「…」で切れない(3 つのフォント × compact / standard。文字の幅は Range で測り、セルの中の幅と比べる)/ body 直下のポップアップ(列メニュー・右クリックメニュー・ツールパネル・ツールチップ・列のゴースト)へ表で決まったトークンが写る(`.ssg-root { … }` / 祖先のセレクタと祖先の変数)・ポップアップの側だけの指定(`.ssg-menu-panel` / `classNames.popover` の style)と密度の寸法は写さない・開いたままテーマを変えても利用側の値が残る・別の目のレビューの指摘(列の固定のサブメニュー / 表に書いた密度の寸法は写さない / 既定値と同じ `classNames.popover` の style は残す / 開いたときと開いたまま写し直すときに色の transition が走らない(止めるクラスを効かなくすると走ることも確かめる)/ 開いたまま `<html>` のクラスだけでダークにしても写し直す)/ `getRowClassName` のクラスを `.ssg-body-row.<class>` で書くと opacity が 1 回だけ効く(素のクラスでは 2 回)/ 列見出しの寄せ(`headerAlign`。書かなければ `align`): 右寄せは文字の右端が中身の右端・並べ替えの矢印がラベルの左・ホバーの操作が左端・幅の把手は右のまま、中央は文字がラベルの中央、左と `headerAlign: 'left'` は今までどおり。geckodriver の Firefox は `(hover: none)` になるので、操作はタッチ端末の並び(通常の並びの中で余白なし)で確かめる。
- `t-stage2.mjs` は実際にアプリを作って確かめたチェック(`docs/audits/2026-11-07/`)の段階 2(0.63.0)の確認: C-N2 展開行があるときの `Tab` の順番(最終列 → その行のカード → 表の外。ほかの行のカードは通らない。`Shift+Tab` は逆順、カードの無い行はそのまま外へ)/ DU-13 `theme="class"` が `<html class="dark">` / `[data-theme="dark"]` に合わせ、列メニュー(body 直下)も同じ / DU-22 左固定列が無い表でも行番号の列は横にスクロールしても流れない / DU-14 複数行のエディタ(改行を残して開く・`Alt+Enter` で改行・`Enter` で改行ごと確定・中がスクロールする長い文でも `PageUp` / `PageDown` はグリッドも入力欄も動かさない)/ DU-32 auto-height で伸びた行のどのセルも箱は行の高さ / DU-24 列メニューの「この列でグループ化」と「グループ化を外す」/ G1 自動グループ列のセルの番地(下部バー)/ DU-11 グルーピング中もフィルターの管理にグループ元の列 / DU-10 小計の行(`includeGroupRows`。`isRowExportable` で除いた行は数えない)/ DF-23 グリッドが隠れたら列メニューを閉じる。
- `t-i18n.mjs` は英語対応(`localeText={localeTextEn}`。ハーネスは `?lang=en` で渡す)の確認: 最初の描画・列メニューと列フィルター(数値 / 文字 / 候補 / 日付 / 自動)・日付の範囲の印とカレンダー(曜日 / 月)・ツールパネルの 3 つのタブ・セル内検索・右クリックメニュー・フィルターのチップと合計行・組み込みの検査のメッセージと印のツールチップ・フィルハンドルの値のツールチップと埋めたあとのボタン / メニュー・グループの行に、ハーネスのデータ(列の見出し・値・利用側の検査のメッセージ・右クリックメニューの項目)を除いて日本語(かなと漢字・全角の記号・「〜」「、」などの約物)が残らない / 上部 / 下部のバーの件数・要約・番地・選択範囲の大きさ・集計が英語 / L-N1 展開トグルの列と行ドラッグのハンドルの列のセルの番地(`Cell Details 7` / `Cell Move 5`)/ 開発時の警告は言語によらず日本語の行と英語の行の 2 行。
- `t-popups.mjs` はダイアログの中のグリッドのポップアップ(1.1.0 / AP-07 `popupContainer`。ハーネスは `?s=dialog&host=native` = `<dialog>` の `showModal()` / `?s=dialog&host=radixlike` = Radix の Dialog の模擬(`role="dialog"` + translate で真ん中 + body の pointer-events: none + 外側のフォーカス / 押下の記録)): 列メニュー・列フィルターの入力・右クリックメニュー(`Shift+F10` も)・select の候補・ツールパネル・ツールチップ・列ドラッグのゴーストがダイアログの中に出て、見えて押せて、位置がトリガーに合う / Radix の模擬で外側のイベントが起きない / `popupContainer="body"` にすると body の直下で押せない(1.0.2 までの不具合の再現)/ ダイアログの無いページは今までどおり body の直下で translate なし。
- `t-pinned.mjs` は固定行(1.1.0 `pinnedTopRows` / `pinnedBottomRows`): 3 ペインに描く / 上は列見出しのすぐ下・下は合計行のすぐ上 / スクロール範囲が固定行ぶん伸びる / スクロール・`Ctrl+Home` / `Ctrl+End` / `↑` / `scrollToRow` で本体の行が固定行の裏に隠れない / 横スクロールと固定列で見出しと揃う / 行ホバーが外れる / 押しても選択・編集が動かない / 範囲選択のドラッグを固定行の上へ動かすと上へ自動スクロール / `aria-rowcount` と行の番号 / エクスポートの `includePinnedRows` / ダークの色 / 列ドラッグ(live)で固定行のセルも付いてくる / 行が少ないとき / 100 万行(scroll-space)/ SSRM。スクリーンショット `.out/pinned-light.png` / `pinned-dark.png`。
- `t-v120.mjs` は 1.2.0 の追加と修正: 1 セル / 2 行のコピーを範囲へ貼ると範囲を埋める・元に戻す 1 回・`pasteFillsSelection={false}` は 1 回だけ(A-08)/ `activeCellFollows` の `'position'` と `'row'`(並びが変わっても押した行に付いていく・スクロールしない・位置だけでは `onActiveCellChange` を呼ばない・矢印キーでそこまで動く。B-04)/ `isAtBottom()` と `onScroll` の `atBottom`(basic / 100 万行)/ 右クリックメニューの名前(RV3-H2)/ 背の高い行の上にそろえたセルの 1 行のエディタ / `canDropRow`(E-07)/ タッチの端末のメニューの項目の高さ(L-12。CDP のタッチの模擬)。最後に 1.2.0 の見直し(QG / QH)の修正: 全選択は並びが変わってもそのまま(QG-1)・列幅のドラッグ中に並びが変わっても付いていく(QG-4)・下の固定行の上の行のエラーの吹き出し(QH-6)・タッチの右クリックメニューが画面に収まる(QH-2)・select の候補の一覧がスクロールしない(QH-1)・右寄せの見出しの ⋮ とつまみ(QH-4)・列フィルターとツールパネルの的の大きさ(QH-5)・上が見出しに隠れたセルと拡大縮小の中の IME の変換中の入力受け(QH-3 / QH-7)。タッチと IME は Chromium だけ(ほかは skip)。
- `t-toolpanel-flash.mjs` はツールパネルを開いたまま開き直したときの枠の光り(0.46.1 から出ていなかった。2026-11-20 に Solid 版の確認で見つけた): 開いた直後は光らない / 開き直すと光り、終われば `ssg-toolpanel--flash` が外れる / 現れるときの動きをやり直さない(パネルが薄くならない)/ 続けて開き直しても光る / `motion="off"` では光らない。
- `t-shadow.mjs` は Shadow DOM の中のグリッド(1.3.0 / Solid 版の品質の段 2 S11-01〜05。`?s=shadow` = `shared.ts` の `mountPoint` が open の Shadow root の中に CSS の `<style>` と包む要素 `.shadow-app` を置き、その中に描く): Shadow root の中の CSS が当たる / ツールチップが出る(本物のマウス)/ 列メニュー(`Alt+↓`)と右クリックメニュー(`Shift+F10`)の ↓↑ が 1 つずつ動き、項目を本物のマウスで押せ、Shadow root の外を押すと閉じる / 列メニュー・列フィルター・右クリックメニュー・ツールパネル・ツールチップは `.shadow-app` の中に出て見た目が付く / ツールパネルを開くと選ばれたタブへフォーカス、`Escape` でグリッドへ戻る / `imeDirectInput` の変換の確定で編集が始まる(CDP の IME の模擬。Chromium だけ)。`wd.mjs` の CSS の探し方はこの host の Shadow root の中も見る(Playwright の CSS のロケーターと同じ)。
- `t-v130.mjs` は 1.3.0(Solid 版の品質の段 2)で直した所見の実ブラウザでの確かめ(Shadow DOM は `t-shadow.mjs`): `imeDirectInput` の待機中の入力受けが `PageDown` の後もアクティブセルに重なる / 範囲を `Escape` で外した後の `Ctrl+C` はアクティブセルの 1 セル / 編集していた行が絞り込みから外れたら打ちかけをその行へ確定し、フォーカスはグリッドに残る / エディタを開いたまま別のセルを押してすぐ打った文字がそのセルのエディタに残る。React 版と Solid 版(`SSG_AUDIT_FRAMEWORK=solid HARNESS_BASE=http://127.0.0.1:5179/`)の両方で回す。axe の確認は `AXE_PATH` に axe-core の `axe.min.js` を渡したときだけ(WebDriver のブラウザでは中身をページで評価する)。headless の Firefox(geckodriver)は `hover: none` / `pointer: none` を返すので、ホバーの前提の RV5-4 は SKIP する(WebKitGTK と Chromium で見る)。
- `t-v141.mjs` は 1.4.1 で直した AP-11 の実ブラウザでの確かめ: custom エディタを開いたまま別のセル・列見出しを押すと、グリッドが編集を終えてエディタを閉じ、矢印キーが効き、フォーカスはグリッドに残る / onBlur で確定しない作り(ハーネスの既定)は打ちかけを書かない / onBlur でその場で(`window.__customEditorBlur = 'sync'`)・50ms 後に(`'timeout'`)`ctx.commit` する作りは、その値を編集していたセルに書き、押したセルがアクティブのまま / エディタの中を押しても閉じない。React 版と Solid 版(`SSG_AUDIT_FRAMEWORK=solid HARNESS_BASE=http://127.0.0.1:5179/`)の両方で回す。
- `t-verify.mjs` は監査所見(RD-1 / RD-2 / C-1 / L-01 / C-3 / B-01 / B-02 / B-03 / V-02 …)の再現スクリプト。修正後は FAIL → PASS に変わることを確認する回帰テストとして使う。

## 他のブラウザで回す(2026-10-28 追加)

`SSG_AUDIT_BROWSER` でブラウザを切り替える。既定は `chromium`(従来どおり)。

| 値 | 中身 | 前提 |
| --- | --- | --- |
| `chromium` | Playwright の Chromium | 従来どおり |
| `firefox` / `webkit` | Playwright の Firefox / WebKit(2026-10-28 時点では配布元へ届かず**未検証**) | `npx playwright install firefox webkit` 済み(Mac など、Playwright の配布元へ届く環境) |
| `firefox-bidi` | 普通の Firefox を WebDriver BiDi で(Playwright の実験的な機能。2026-10 時点ではダブルクリックが届かず多くの確認が落ちるので `geckodriver` を勧める) | `SSG_AUDIT_FIREFOX` に Firefox の実行ファイル |
| `webkitgtk` | Linux の WebKitGTK(Safari と同じ WebKit の Linux 版)を W3C WebDriver で(`wd.mjs`) | `apt install webkit2gtk-driver xvfb`。X が要るので `xvfb-run -a` で包む |
| `geckodriver` | Firefox + geckodriver を W3C WebDriver で(`wd.mjs`) | PATH に `geckodriver`、`SSG_AUDIT_FIREFOX` に Firefox。Linux では conda-forge の `firefox` / `geckodriver` パッケージ(`.conda` を展開するだけ。X は要らない)で入る |

```bash
# 例: Linux(クラウド環境を含む)で WebKitGTK に対して 1 本(xvfb-run の既定の画面 1280×1024 では 1400px 幅の確認が入らないので広げる)
xvfb-run -a -s "-screen 0 1920x1080x24" env SSG_AUDIT_BROWSER=webkitgtk node audit/harness/t-basic.mjs
# 例: Firefox(geckodriver)に対して 1 本
SSG_AUDIT_BROWSER=geckodriver SSG_AUDIT_FIREFOX=/path/to/firefox node audit/harness/t-basic.mjs
# 例: Mac で Playwright の WebKit に対して全部
SSG_AUDIT_BROWSER=webkit pnpm run audit:test
```

- 最初の行に `BROWSER <名前> <版>` を出す。
- ブラウザによって使えない機能(CDP の変換の模擬 / `page.route` / `page.clock` / `emulateMedia`)を使う確認は `pw.mjs` の `SUPPORTS` を見て飛ばし、`SKIP` と出す(FAIL には数えない)。WebDriver(`webkitgtk` / `geckodriver`)では `t-lazy` 全体と `t-leftovers` の L-15、`t-features` の IME の変換(入力受けへのフォーカスや変換を使わないキー操作は回す)、`t-lifecycle` の `theme="auto"` の追従、`t-verify` の RD-2 の実際の Ctrl+V(代わりにエディタへ paste イベントを送ってグリッドが横取りしないことを見る)が SKIP になる。
- `wd.mjs` は Playwright の Page / Locator / Mouse / Keyboard のうちハーネスが使う分だけを WebDriver で実装したもの。Playwright との違い:
  - ページのスクリプトより先には差し込めない(`addInitScript` とエラーの記録は `goto` の後から。それより前、最初の描画中のエラーは `goto` の直後にページの `window.__errors` から `pageErrors` へ写す)。ページのエラーと console は次にページを呼んだとき(操作 / `evaluate` / `close`)にまとめて回収する。
  - 操作の前に「要素がある・見える・動きが止まった」を待ち、その点で上に別の要素があればスクロールし直す。それでも隠れていれば `WARN(wd)` を出してそのまま押す(Playwright は押せるまで待ち、最後は timeout で落ちる。`WARN(wd)` の後の FAIL はまずこれを疑う)。複数の要素に当たったときは例外にせず先頭を使って `WARN(wd)` を出す。
  - `page.evaluate` の前に 1 フレーム待つ(WebKit では WebDriver のスクリプトが React の予約した再描画より先に走り、直前の `__setProps` が反映されていない状態を読むことがあるため)。キー / ポインタの操作の後も 1 フレーム待つ。そのため一瞬だけ出る状態を「出ないこと」で見る確認は Playwright より甘くなる。
  - 窓の中の大きさ(`innerWidth` / `innerHeight`)を頼んだ値にできなければ例外にする(別の幅のまま回さない)。
  - ドライバは自分のプロセスグループで起動し、終了時(Ctrl+C を含む)にドライバが起動したブラウザごと止める。
  - クリップボードの読み取りはテストからは許可できない(WebKit は拒み、Firefox は「貼り付け」の確認を出して待ち続ける)ので、グリッドが `writeText` / `execCommand('copy')` で**書けたときだけ**その文字列を覚えておき、`readText` はそれを返す(書く側の経路はそのまま動き、失敗はそのまま失敗になる)。Playwright の Firefox / WebKit / `firefox-bidi` にも同じ代役を `addInitScript` で入れる。
- Playwright は window の error のうち例外でないもの(`ResizeObserver loop completed with undelivered notifications` など)を `pageerror` にも console にも出さないので、`pw.mjs` が `addInitScript` で `console.error('[window.error] …')` へ流す(WebDriver と同じ範囲を `pageErrors` で拾うため。2026-10-28 追加)。
  - `webkitgtk` の右クリックはポインタだけ実際に動かし、`pointerdown` / `mousedown` / `contextmenu` / `pointerup` / `mouseup` をページ内で合成する。WebKitGTK 2.52 の WebDriver で右ボタンを押して離すと離したことが伝わらず(`mouseup` の `button` が 0 になり `buttons` に右ボタンが残る)、以降の左クリックが `pointerdown` にならない(素のページでも起きる自動操作側の不具合)。
  - 要素だけのスクリーンショット(`locator.screenshot`)と `clip` は画面全体の保存になる(記録用で判定には使っていない)。

## Solid 版で回す(2026-11-20 追加)

Solid 版(`packages/solid`)にも同じテストを回す。Solid 版のハーネスのページは `solid/`(`solid/main.tsx`。port 5179)で、React 版の
`main.tsx` と同じシナリオ・同じ `window.__*` を Solid 版のグリッドで公開する。計測・データ・列・SSRM のモックは `shared.ts` を共有
する(フレームワークの部品 = custom エディタの中身と展開行の中身だけをそれぞれのページで書く)。

```bash
pnpm run audit:dev:solid                       # Solid 版のハーネスの dev サーバー(port 5179)
SSG_AUDIT_FRAMEWORK=solid pnpm run audit:test  # 全部(ブラウザの切り替え SSG_AUDIT_BROWSER はそのまま使える)
SSG_AUDIT_FRAMEWORK=solid node audit/harness/t-basic.mjs
```

- 最初の行は `BROWSER <名前> <版> / FRAMEWORK solid`。
- React 版との違い: `&strict=1`(StrictMode)は普通に描くだけ、`__activity(false)`(`<Activity>` で隠す)は `display: none` で
  隠すだけ、`__renderCount` は部品の関数が動いた回数(Solid は最初の 1 回)。`t-lazy` も同じく回す(段階 3-3 から Solid 版も列フィルターの
  ポップオーバーとツールパネルの部品を後から読む。dev では `view/ColumnFilterPopover.tsx` / `view/toolPanelViews.ts` の別のモジュール)。
- Solid 版の dev サーバーは依存の事前バンドルを `node_modules/.vite-audit-harness-solid` に置く(React 版と同じ `node_modules/.vite` を
  使うと、片方が作り直したときにもう片方が `504 Outdated Optimize Dep` で開けなくなる)。
- Solid の Vite プラグインは `vite dev` で既定で Performance パネルのトラックを入れ、その計測(`solid-js/attribution`)で描き直しが
  重くなり(100 万行で遠くへスクロールした次のフレームまで約 0.5 秒。切ると React 版と同じ約 0.1 秒)、console に Solid の知らせ
  (`[EFFECT_RELAY_TEAR]` など)が出る。React 版と同じ条件で比べるため、ハーネスの既定では切る(`solid/vite.config.ts`)。
  プラグインの既定どおり入れるとき(利用者の開発時と同じ)は `SSG_AUDIT_SOLID_TRACKS=1 pnpm run audit:dev:solid`(port 5180。
  別の cacheDir なので既定のサーバーと並べて動かせる)で、そこで出る知らせが既知のもの(`docs/solid/README.md`「開発ビルドで Solid が
  出す知らせ」)だけかを `SSG_AUDIT_FRAMEWORK=solid SSG_AUDIT_SOLID_TRACKS=1 node audit/harness/t-solid-diagnostics.mjs` で見る
  (ふつうの `audit:test` には入れていない。トラックなしでは SKIP)。
- dev サーバーを動かしたまま `git stash` / `git checkout` でソースを入れ替えると、古いモジュールを配り続けることがある(React 版の
  ハーネスでも同じ。2026-11-20 に Solid 版で 1 回分の確認がこれで無駄になった)。入れ替えたらサーバーを立て直し、`curl -s http://127.0.0.1:5179/@fs/<絶対パス> | grep <新しいコード>` で確かめる。

### React 版と Solid 版へ同じでたらめな操作を流して比べる(2026-11-22 追加)

`t-diff.mjs`(Solid 版の測り直し 段階 4 の 1-2。`docs/audits/2026-11-22-solid-quality/`)。React 版(5177)と Solid 版(5179)の
dev サーバーを両方立てておく。種ごとに同じ操作の列(セルの押下 / Shift・Ctrl 付きの押下 / ダブルクリック / キー 28 種 /
打ち込みと確定 / 貼り付け / 見出しの押下 / スクロール / 行のチェック / グループと展開行の開閉 / blur / `Shift+F10`)を作り、
1 手ごとに両方の描いたセル(番地・文字・`aria-selected`・クラス)・エディタ・ポップアップ・バーの文字・フォーカス・
ハンドルの状態(`getState` / `getActiveCell` / `getSelection` / `getRowSelection` / `canUndo` / `canRedo`)・行のデータ・
通知・console のエラーと警告を比べる。食い違ったら、その種の操作の列と差を `.out/t-diff.json` に書いて次の種へ進む。

```bash
pnpm run audit:dev & pnpm run audit:dev:solid &
node audit/harness/t-diff.mjs                    # 既定: basic / grouping / label / detail / rowdrag × 種 8 個 × 120 手
SSG_DIFF_SCENARIOS=basic SSG_DIFF_SEEDS=20 SSG_DIFF_STEPS=300 node audit/harness/t-diff.mjs
SSG_DIFF_SCENARIOS=grouping SSG_DIFF_SEED=7 SSG_DIFF_SEEDS=1 SSG_DIFF_VERBOSE=1 node audit/harness/t-diff.mjs  # 1 つの種を 1 手ずつ
```

- 比べないもの: 時刻、`onScroll` / `onHoveredRowChange` の通知(フレームの区切りで回数が変わる)と行 / 列のホバーの印の
  クラス(動かないポインタの下で表がスクロールすると、React 版は印が前の行に残る = 記録の R5-2。`SSG_DIFF_KEEP_HOVER=1` で
  どちらも比べる)、動きのクラス(`motion="off"` で始める)、1 回の操作で別々の通知が呼ばれるときの通知の間の順番
  (`docs/solid/README.md`「残した違い(通知の順番)」。名前ごとの順番・中身・回数は比べる)。
- ハーネスのデータの違いを消すため、始める前に id の列を編集できなくし(行のキーを書き換えると React が同じキーの子の警告を
  出す)、貼り付けで足す行のキーを決まった値にする(ハーネスの `createRow` は時刻と乱数でキーを作る)。ラベル行のシナリオでは
  10 行ごとにラベル行を混ぜる。
- 1 手の後は、スクロールの位置が 3 フレーム続けて変わらなくなるまで待ってから比べる(なめらかなスクロールの途中で比べると、
  ポインタの下の行が違って見える)。

## 速さを比べる(React 版と Solid 版。2026-11-23 追加)

`perf-compare.mjs`(段 3-4。`docs/audits/2026-11-22-solid-quality/` の S5-22 / S12-03 / S12-04)は、2 つのハーネスの本番ビルドで
100 万行の `Ctrl+End` / `Ctrl+Home`、列の多い表(`?wide=190` = 約 200 列 × 2 万行。`shared.ts` の `withWideColumns`)で縦に
3000px ずつ 120 回飛ぶときの JS の時間(CDP の ScriptDuration)、同じ表のヒープと DOM のノードを、交互に測ります。

```bash
vp build --config audit/harness/vite.config.ts audit/harness --outDir /tmp/h-react --emptyOutDir
vp build --config audit/harness/solid/vite.config.ts audit/harness/solid --outDir /tmp/h-solid --emptyOutDir
# それぞれのフォルダを静的に配る(例: vp preview --config <同じ設定> --outDir <フォルダ> --port 5181 / 5182)
REACT_BASE=http://127.0.0.1:5181/ SOLID_BASE=http://127.0.0.1:5182/ node audit/harness/perf-compare.mjs 2
```

- マシンの混み具合で 1 割ほどぶれるので、比として見る。2026-11-23(段 3-4 の後)の値は Solid 版の CHANGELOG の 1.4.0 の「修正」。
- どこに時間がかかっているかは `--minify false` でビルドし、CDP の Profiler で関数ごとの時間を見る(Solid 版は solid-js の実行時、
  React 版は react-dom が別の名前で出る)。

## 出力の読み方

- `PASS` / `FAIL`: 期待どおり / 不具合または回帰。`FAIL` が 0 件であることが基準。
- `PENDING(判断待ち・未解消 / 解消済み)`: 監査所見のうち**挙動変更を伴うため未修正**のもの(`docs/audits/2026-10-04/README.md` §9)の追試。FAIL には数えない。修正したら「解消済み」に変わるので、そのとき `check` に格上げする。

## 注意

- テストは `waitIdle` の固定待ち時間を含むため、極端に遅いマシンではタイミング起因の FAIL が出ることがある(再実行で安定するものは所見ではない)。
- 列フィルター / グローバルフィルターの評価は低優先度の遅延レンダー(`useDeferredValue`)で反映されるため、`applyState` 等でフィルターを変えた直後は「ソートは新しく、フィルターは古い」表示が本番ビルドで約 0.1 秒、dev ビルドで 0.1〜0.3 秒続く(CPU が混んでいるとさらに長い)。その直後に行 index でセルを触る / 書き出す確認では、`waitIdle` ではなく `waitForViewRows(page, n)`(表示行数が n になるまで待つ)を使う(2026-10-24、t-basic のエクスポート 2 件 / t-total の「編集で再計算」が負荷の高いときだけ FAIL していた原因)。
- 1M 行シナリオの dev ビルド計測は React の開発ビルド固有の遅さを含む(所見 M-04 の props 差分は 2026-10-12 に解消したが、開発ビルドは本番より遅い)。性能判断は本番ビルド(`HARNESS_BASE` で preview を指す)で行うこと。