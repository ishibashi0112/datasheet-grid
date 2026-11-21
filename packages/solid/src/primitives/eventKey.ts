// 追加(段階 3-2): キーの名前を React の合成イベントと同じに読みます。WebKitGTK は Shift+Tab の keydown を key='Unidentified'
//   (keyCode 9)で送ります(WebDriver だけでなく本物のキーボードでも。X のキーを送って確かめた)。React の合成イベントは keyCode
//   から 'Tab' に直すので、React 版は Shift+Tab で左のセルへ動き、Solid 版はブラウザの既定のフォーカスの移動になっていました。
//   Tab を見るところ(シェル / エディタ / ポップアップの中で回すフォーカス / フィルハンドルのメニュー)はこれを通します(core
//   logic/domGuards の isTabKeyEvent。ほかのキーは React と同じ値が来る)。core のコントローラが document で受けるキーは React 版も
//   元のイベントを読むので、そのままで同じです。
import { isTabKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';

export const readEventKey = (event: KeyboardEvent): string => (isTabKeyEvent(event) ? 'Tab' : event.key);

// core のエディタのキーの割り当て(logic/editorKeys / logic/selectEditorState)へ渡す形です(React 版の
//   editors/editorKeyBindings の詰め替えと同じ。key だけ読み直す)。
export const toEditorKeyEvent = (event: KeyboardEvent) => ({
  key: readEventKey(event),
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  shiftKey: event.shiftKey,
  isComposing: event.isComposing,
  keyCode: event.keyCode,
  currentTarget: event.currentTarget,
  preventDefault: () => event.preventDefault(),
});