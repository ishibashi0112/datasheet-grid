export type Lang = 'ja' | 'en'
const dict = {
  ja: { title: '現場点検', place: '場所', item: '項目', result: '結果', value: '数値', memo: 'メモ', photo: '写真', ok: '良', warn: '要確認', ng: '不良', inspector: '担当者', action: '対応メモ', save: '保存', close: '閉じる', addPhoto: '写真を追加', openDialog: 'テンプレートから追加', dialogTitle: '点検テンプレート', cancel: 'キャンセル', moveUp: '上へ', moveDown: '下へ', lang: 'English', grid: '点検一覧', tmpl: 'テンプレート' },
  en: { title: 'Site inspection', place: 'Location', item: 'Item', result: 'Result', value: 'Value', memo: 'Memo', photo: 'Photo', ok: 'OK', warn: 'Check', ng: 'Fail', inspector: 'Inspector', action: 'Action notes', save: 'Save', close: 'Close', addPhoto: 'Add photo', openDialog: 'Add from template', dialogTitle: 'Inspection templates', cancel: 'Cancel', moveUp: 'Up', moveDown: 'Down', lang: '日本語', grid: 'Inspections', tmpl: 'Templates' },
}
export const tr = (lang: Lang) => (k: keyof (typeof dict)['ja']) => dict[lang][k]
