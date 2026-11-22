import { createSignal } from 'solid-js'
// アプリ全体の設定(クライアントのモジュールの signal)
export const [density, setDensity] = createSignal<'compact' | 'standard' | 'comfortable'>('standard')
export const [showSave, setShowSave] = createSignal(true)

// 配色(既定は OS に合わせる)
export const [theme, setTheme] = createSignal<'light' | 'dark' | 'auto'>('auto')
