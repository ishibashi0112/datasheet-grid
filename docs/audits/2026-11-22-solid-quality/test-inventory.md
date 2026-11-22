# React 版のテストの棚卸し(Solid 版の比較テスト)

段階 4-1 で、React 版の jsdom のテスト(`packages/react/src` の `*.test.ts(x)`。99 ファイル)が見ている場面を、Solid 版の比較テスト(`packages/solid/src/parity`。React 版の `/lite` と Solid 版へ同じ props・同じ操作を流し、DOM・通知・命令的 API の戻り値を比べる)がどこまで見ているかを数えた。比較テストは DOM を丸ごと比べるので、ある状態まで動かせば、その状態の属性(role / aria / data-* / class / style)は全部比べる。

記号: ◎ = 比較テストでほぼ同じ場面を見ている / ○ = 主な場面を見ている / △ = 一部だけ / × = 見ていない / — = Solid 版には当てはまらない / → 1-5 = 段 1-5(Solid らしい使い方・SSR)で見る。

## 数

| | ◎ | ○ | △ | × | — | → 1-5 |
| --- | --- | --- | --- | --- | --- | --- |
| 移す前(2026-11-22 の 0.1.0) | 24 | 9 | 43 | 11 | 12 | 0 |
| 移した後 | 40 | 17 | 28 | 0 | 12 | 2 |

Solid 版のテストは 0.1.0 の 16 ファイル・173 件から 20 ファイル・250 件へ(比較テストのファイルは 9 → 13。足した比較テストは 77 件)。足した場面で React 版と Solid 版の差は出なかった。

## 比較テストの仕組みに足したもの

- 機能の入れ忘れの見張り(`harness.tsx`): `/lite` は機能セットに無い機能の prop を黙って無視する(開発時の警告だけ)ので、テストの `features` に入れ忘れると両方とも「何もしない」で同じになり、比べても差が出ない。警告が出たらテストを落とし、機能なしの構成をわざと比べる場面だけ、確かめる機能のキーを `allowMissingFeatures` に並べる。入れた時点で、自作のバーの検索(`filtering` が無かった)とラベル行のエクスポート(`export` が無かった)の 2 つが空振りだったのが分かり、直して比べても差は無かった。
- `callOrder: 'byName'`(通知の名前ごとの順番だけ比べる。docs/solid/README.md の「残した違い」)、`wrapperEvents`(グリッドを包む要素のイベントのハンドラ。伝播を止めたかを比べる)、`act` の待ち 0(次のフレームの前の状態を見る)。

## 残したもの(△)

部品ごとのテスト(`view/*` / `editors/*` / `CellEditorLayer`)と、1 つのファイルに細かい場合が多いもの(aria / cellEvents / enterMove / filterPopoverLive / grouping / height / localeText / motion / numberRules / slotProps / verticalAlign ほか)。主な場面は比較テストで DOM ごと比べているので、残りは 1-2(React 版と Solid 版へ同じでたらめな操作を流して比べる)で広く見る。L-12(タッチの端末の候補の行の高さ)と M-01 は CSS だけの変更で、Solid 版は同じ CSS を写す。

## ファイルごと

| React 版のテスト | 移す前 | 移した後 | Solid 版の比較テスト / 理由 |
| --- | --- | --- | --- |
| `CellEditorLayer.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `GridShell.features.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.activeCellFollows.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.activity.integration.test.tsx` | — | — | React の `<Activity>`。Solid 版の同じ場面(`<Show>` の切り替え)は 1-5 |
| `SpreadsheetGrid.aria.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.asyncOptions.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.canEditCellIndex.integration.test.tsx` | × | ◎ | history(RD-4) |
| `SpreadsheetGrid.cellEvents.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.checkboxEditor.integration.test.tsx` | △ | ○ | state(checkedValue)・editing |
| `SpreadsheetGrid.clipboardSynthetic.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.columnDragGrip.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.conditionalFormat.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.copyRange.integration.test.tsx` | △ | ◎ | edits(FC-21)・focus |
| `SpreadsheetGrid.dateSetOptions.integration.test.tsx` | ◎ | ◎ | popups(L-06 を追加) |
| `SpreadsheetGrid.detail.integration.test.tsx` | △ | ○ | selectionDetail(C-N6 / C-N7 を追加) |
| `SpreadsheetGrid.devWarnings.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.editFocus.integration.test.tsx` | △ | ○ | focus(AP-05 / AP-11・RA-3)・edits(AP-10)。編集中のアンマウント(AP-12 / RA-1)は 1-5 |
| `SpreadsheetGrid.editSession.integration.test.tsx` | △ | ◎ | edits(FC-01 / 09 / 10 / 11 / 13 / 17 / 18) |
| `SpreadsheetGrid.enterMove.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.escapeInDialog.integration.test.tsx` | × | ◎ | focus(AP-17・RA-6) |
| `SpreadsheetGrid.export.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.fillHandle.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.filterEscape.integration.test.tsx` | × | ◎ | focus(QA-1 / RV-K2) |
| `SpreadsheetGrid.filterPopoverLive.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.find.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.grouping.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.handleFocusEdit.integration.test.tsx` | △ | ◎ | edits(DU-02 / 03 / 16・N-1〜4・N2-1) |
| `SpreadsheetGrid.headerAlign.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.height.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.hiddenPopovers.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.highlightChanges.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.hoverCross.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.imeDirectInput.integration.test.tsx` | △ | ◎ | interaction(G-2・F-06) |
| `SpreadsheetGrid.initialState.integration.test.tsx` | × | ◎ | state(DU-12・RA-5・N2-4) |
| `SpreadsheetGrid.initialState.ssr.test.tsx` | × | → 1-5 | SSR の確かめで見る |
| `SpreadsheetGrid.integration.test.tsx` | △ | ○ | state(RD-5 / M-03 / L-02)・popups(DU-07)・basic |
| `SpreadsheetGrid.jsdomLayoutStubs.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.labelRow.integration.test.tsx` | △ | ○ | rowModels(エクスポートも比べるように直した) |
| `SpreadsheetGrid.lazyPopups.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.localeEn.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.localeText.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.manualMode.integration.test.tsx` | △ | ◎ | edits(RD-8) |
| `SpreadsheetGrid.menuKeyboard.integration.test.tsx` | △ | ○ | focus(AP-33) |
| `SpreadsheetGrid.motion.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.multilineEditor.integration.test.tsx` | △ | ○ | state(enterKey)・editing |
| `SpreadsheetGrid.numberRules.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.numberStartKey.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.pasteSkipped.integration.test.tsx` | × | ◎ | history(onPasteSkipped・A-08) |
| `SpreadsheetGrid.pinnedRows.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.popupContainer.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.renderHeaderControls.integration.test.tsx` | × | ◎ | focus(V-16) |
| `SpreadsheetGrid.rowDrag.integration.test.tsx` | ◎ | ◎ | interaction(AP-15 / E-06 を追加) |
| `SpreadsheetGrid.rowDragCommit.integration.test.tsx` | △ | ◎ | interaction(FC-02 / FC-12 / FC-31) |
| `SpreadsheetGrid.rowHover.integration.test.tsx` | × | ◎ | focus・rowModels(C-06) |
| `SpreadsheetGrid.scrollApi.integration.test.tsx` | △ | ◎ | edits(G-08) |
| `SpreadsheetGrid.selectAllFiltered.integration.test.tsx` | ○ | ○ | 前から比べていた(細かい場合の一部は無い) |
| `SpreadsheetGrid.selectionAggregates.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.sharedCore.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.slotProps.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `SpreadsheetGrid.ssrCurrentTime.ssr.test.tsx` | × | → 1-5 | SSR の確かめで見る |
| `SpreadsheetGrid.ssrmEdit.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.totalRow.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `SpreadsheetGrid.undoRedo.integration.test.tsx` | × | ◎ | history(DU-21) |
| `SpreadsheetGrid.validation.integration.test.tsx` | △ | ○ | history(reject / mark・貼り付け・Delete)・editing |
| `SpreadsheetGrid.valueLabels.integration.test.tsx` | × | ◎ | state(groupLabel・select の clipboard) |
| `SpreadsheetGrid.verticalAlign.integration.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `ai/GridAskBar.integration.test.tsx` | — | — | Solid 版に `/ai` は無い(段 3 の候補) |
| `apiReferencePages.test.ts` | — | — | 文書の検査(React 版の API_REFERENCE.md とサイト) |
| `createSpreadsheetGrid.recreate.integration.test.tsx` | — | — | 描くたびに作り直したときの警告。Solid のコンポーネントの本体は 1 回だけ走る |
| `cssContract.test.ts` | — | — | CSS の検査。Solid 版は React 版の CSS をそのまま写す |
| `editors/CheckboxCell.test.tsx` | ◎ | ◎ | 前から比べていた |
| `editors/CustomCellEditor.test.tsx` | ◎ | ◎ | 前から比べていた |
| `editors/DateCellEditor.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `editors/NumberCellEditor.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `editors/SelectCellEditor.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `editors/editorRejection.test.tsx` | ◎ | ◎ | 前から比べていた |
| `features/filtering.autoInfer.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `features/full.test.ts` | — | — | React 版の機能の表 |
| `labelRowTypeGuard.types.test.tsx` | — | — | 型の検査(Solid 版は type-tests/solid) |
| `lite.integration.test.tsx` | ◎ | ◎ | 前から比べていた |
| `model/gridTypes.core.test.ts` | — | — | 型の検査(core) |
| `skill.test.ts` | — | — | Skill の検査(Solid 版に Skill は無い。段 2 の候補) |
| `themes/themes.test.ts` | — | — | CSS の検査。Solid 版は同じテーマの CSS を写す |
| `valueFormatters.types.test.ts` | — | — | 型の検査(Solid 版は type-tests/solid) |
| `view/ColumnChooserPanel.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/ColumnFilterPopover.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/ColumnMenuPopover.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/FilterDateField.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/FilterManagementPanel.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/GridBodyLayer.cellNote.test.tsx` | ◎ | ◎ | 前から比べていた |
| `view/GridBodyLayer.cellStyleContext.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/GridBodyLayer.rowStyleContext.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/GridBodyLayer.validationMarks.test.tsx` | ◎ | ◎ | 前から比べていた |
| `view/GridDetailLayer.test.tsx` | ◎ | ◎ | 前から比べていた |
| `view/GridFilterChipBar.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/GridScrollHint.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/PopoverEscapeClose.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `view/ToolPanel.test.tsx` | △ | △ | 部品の細かい場合の一部だけ(下の「残したもの」) |
| `withRefProp.test.tsx` | — | — | React 18 の forwardRef |