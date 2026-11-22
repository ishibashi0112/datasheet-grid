// 埋め込み先のページ: <stock-widget> を定義する。URL の ?popup= / ?css= / ?theme= で作り方を変えて試す。
import { defineStockWidget } from './element'

const params = new URLSearchParams(location.search)
const el = document.getElementById('w1')!
for (const key of ['popup', 'css', 'theme']) {
  const v = params.get(key)
  if (v) el.setAttribute(key, v)
}
if (params.get('noframe')) document.getElementById('f1')?.remove()
defineStockWidget()
