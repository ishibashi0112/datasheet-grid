// SSR の確かめで使う時刻とタイムゾーン(render.mjs / vitest.config.ts / fixtures.tsx で共有)。
//   描く時刻は FIXED_NOW に固定し、タイムゾーンだけを変える(サーバー = UTC+14、クライアント = UTC-11 で、今日が 1 日ずれる)。
export const FIXED_NOW = Date.parse('2026-11-22T12:00:00Z');
export const SERVER_TZ = 'Pacific/Kiritimati';
export const CLIENT_TZ = 'Pacific/Pago_Pago';
// サーバーのタイムゾーンでの今日と、クライアントのタイムゾーンでの今日。
export const SERVER_TODAY = '2026-11-23';
export const CLIENT_TODAY = '2026-11-22';