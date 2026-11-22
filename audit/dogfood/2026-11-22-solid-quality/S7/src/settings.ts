// 試す書き方の切り替え(画面上部の「書き方」で変えて読み直す)
export type Settings = {
  /** 行を読む形: memo = createMemo(async) / deferred = createDeferred */
  loadMode: 'memo' | 'deferred'
  /** 保存の action を始める場所: direct = onRowsChange の中 / onFlush = onFlush の中 / timeout = setTimeout(0) */
  saveMode: 'direct' | 'onFlush' | 'timeout'
  /** <Loading on={projectId}> を付けるか */
  loadingOn: boolean
  /** タブの切り替え: switch = <Switch>/<Match> / show = <Show> 2 つ */
  tabMode: 'switch' | 'show'
  /** fillHandle を付けるか(付けると保存中の編集開始で止まる) */
  fill: boolean
}

const KEY = 's7-settings'
const defaults: Settings = { loadMode: 'memo', saveMode: 'direct', loadingOn: false, tabMode: 'switch', fill: true }

function read(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

export const settings: Readonly<Settings> = read()

export function saveSettings(next: Partial<Settings>) {
  localStorage.setItem(KEY, JSON.stringify({ ...settings, ...next }))
  location.reload()
}
