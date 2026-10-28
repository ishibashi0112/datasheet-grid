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
pnpm run audit:test            # 基本 + 1M 行 + SSRM + ライフサイクル + 機能群 + 所見追試 + 集計 + 合計行 + フィルハンドル + 見送り分 + 遅延読み込み + 優先順位
node audit/harness/t-basic.mjs # 個別に 1 本だけ
node audit/harness/perf-big.mjs            # 1M 行の計測(dev ビルド)
HARNESS_BASE=http://127.0.0.1:5178/ node audit/harness/perf-big.mjs  # 本番ビルド(vp build → vp preview --port 5178)に対して
```

- Chromium は `SSG_AUDIT_CHROME`(実行ファイルパス)で指定できる。未指定なら Claude Code クラウド環境の既知パス、無ければ playwright-core の既定解決(`npx playwright install chromium` 済みが前提)。
- シナリオは `main.tsx` の `?s=<scenario>` で切り替わる: `basic` / `big` / `autoheight` / `grouping` / `detail` / `label` / `rowdrag` / `ssrm` / `empty` / `height` / `two`。`&strict=1` で StrictMode、`&n=<rows>` で行数、SSRM は `&noinit=1` で `initialRowCount` 未指定、autoheight は `&detail=1` で展開行を併用。
- `window.__grid`(ハンドル)/ `window.__rows()` / `window.__setRows` / `window.__setProps` / `window.__setColumns` / `window.__events`(コールバック記録)/ `window.__errors`(console.error / warn)/ `window.__listeners`(window / document リスナー数)/ `window.__ssrm`(SSRM モック制御)を公開しているので、ブラウザの DevTools から手で叩いて追試できる。
- `t-aggregates.mjs` は選択範囲の集計(下部バー)の値・表示・100 万行の時間分割・SSRM の部分集計。
- `t-total.mjs` は合計行(`totalRow`)の値・下端固定・最終行が合計行に隠れないこと(スクロール / 矢印キー / `scrollToRow` / `scrollToBottom`)・横スクロールと固定列の揃い・列ドラッグ(live)・行が少ないとき・ダークテーマ・100 万行・auto-height / グルーピング / ラベル行 / SSRM との併用。
- `t-fill.mjs` はフィルハンドル(`fillHandle`)のハンドルの位置・ドラッグ(点線 / 値のツールチップ / 自動スクロール)・連続データ / コピー・`Ctrl` で入れ替え・`Escape`・上 / 左へ・固定ペインをまたぐ・`validate` の reject / 編集不可を飛ばす・埋めたあとのボタンとメニュー(マウス / キーボード)・元に戻す / やり直し・ダブルクリック・出さないとき・ダークテーマ・グルーピング / ラベル行 / SSRM / 100 万行。
- `t-leftovers.mjs` は §11 で見送り、2026-10-12 に対応した所見(`docs/audits/2026-10-04/README.md` §12)の確認: B-09 flex の幅が整数 px で横スクロールバーが出ない / L-15 相対日付プリセットが深夜 0 時・スリープ明けの focus で翌日へ追従し、プリセットが無ければ何もしない・SSRM は取り直す(「今月」は月内の 0 時では取り直さずスクロールも保ち、月が変わるときだけ取り直す)(`open(…, { beforeGoto: (p) => p.clock.install(…) })` で Playwright の時計を差し込む)/ B-10 100 万行のソート中の編集で並びが正しい(ソート列以外 / ソート列 / 行のその場書き換え)/ M-04 開発ビルドでも 100 万行のソートが数十秒かからない。
- `t-lazy.mjs` は列フィルターポップオーバー / ツールパネルの部品の遅延読み込み(lazy-popups): 先読みを止めると初期表示では読み込まない / 開いたときにその部品だけ読み込む / 読み込みが遅く(`page.route` で遅延)ても出たあと入力欄へフォーカスが入り、複合フィルターも画面内に収まる / 読み込み中に Escape で閉じられる / マウント後の暇なときに先読みし、先読み後は次のフレームで出る / 読み込みに失敗(`route.abort`)しても例外にせず、閉じてキーボード操作を続けられる。失敗後の開き直しはブラウザが失敗した import をキャッシュするため `INFO` として出すだけ。
- `t-priority.mjs` はキーとポインタの優先順位(差し込み式への移行で処理の順番が変わっていないかの見張り。2026-10-24 時点の実際の挙動を期待値にしている): Escape が 1 回で 1 つだけ効く順番(編集 → 列メニュー / フィルター / 右クリックメニュー / ツールパネル → 検索バー → 選択の解除)/ ドラッグ中の Escape(範囲選択・列・フィルハンドル・行。列と行のドラッグは現状、選択の解除にも届く)/ ヘッダーの見出し・⋮・右クリック・幅の境界・grip とセルのダブルクリックの割り当て / `find` の有無と Ctrl+F / Ctrl+C 後とツールチップ表示中の Escape。
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

## 出力の読み方

- `PASS` / `FAIL`: 期待どおり / 不具合または回帰。`FAIL` が 0 件であることが基準。
- `PENDING(判断待ち・未解消 / 解消済み)`: 監査所見のうち**挙動変更を伴うため未修正**のもの(`docs/audits/2026-10-04/README.md` §9)の追試。FAIL には数えない。修正したら「解消済み」に変わるので、そのとき `check` に格上げする。

## 注意

- テストは `waitIdle` の固定待ち時間を含むため、極端に遅いマシンではタイミング起因の FAIL が出ることがある(再実行で安定するものは所見ではない)。
- 列フィルター / グローバルフィルターの評価は低優先度の遅延レンダー(`useDeferredValue`)で反映されるため、`applyState` 等でフィルターを変えた直後は「ソートは新しく、フィルターは古い」表示が本番ビルドで約 0.1 秒、dev ビルドで 0.1〜0.3 秒続く(CPU が混んでいるとさらに長い)。その直後に行 index でセルを触る / 書き出す確認では、`waitIdle` ではなく `waitForViewRows(page, n)`(表示行数が n になるまで待つ)を使う(2026-10-24、t-basic のエクスポート 2 件 / t-total の「編集で再計算」が負荷の高いときだけ FAIL していた原因)。
- 1M 行シナリオの dev ビルド計測は React の開発ビルド固有の遅さを含む(所見 M-04 の props 差分は 2026-10-12 に解消したが、開発ビルドは本番より遅い)。性能判断は本番ビルド(`HARNESS_BASE` で preview を指す)で行うこと。