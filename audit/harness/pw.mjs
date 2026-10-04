// Playwright ランナー共通部。
import { chromium } from 'playwright-core';

import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// スクリーンショット等の出力先(audit/harness/.out/。.gitignore 済み)。
export const OUT = fileURLToPath(new URL('./.out/', import.meta.url));
mkdirSync(OUT, { recursive: true });

export const BASE = process.env.HARNESS_BASE ?? 'http://127.0.0.1:5177/';
// Chromium の実行ファイル: SSG_AUDIT_CHROME → Claude Code クラウド環境の既知パス → playwright-core の既定解決。
const KNOWN_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const CHROME = process.env.SSG_AUDIT_CHROME ?? (existsSync(KNOWN_CHROME) ? KNOWN_CHROME : undefined);

export async function open(scenario, { query = '', viewport = { width: 1400, height: 800 }, headless = true } = {}) {
  const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), headless });
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('[pageerror] ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') pageErrors.push(`[console.${m.type()}] ${m.text()}`);
  });
  await page.goto(`${BASE}?s=${scenario}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForSelector('.ssg-root', { timeout: 30000 });
  await page.waitForTimeout(150);
  return { browser, page, pageErrors, close: () => browser.close() };
}

export const results = [];
export function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
export function summary() {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fails.length}/${results.length} passed; ${fails.length} failed ==`);
  for (const f of fails) console.log('  FAIL', f.name, f.detail !== undefined ? JSON.stringify(f.detail) : '');
}

// グリッド操作ヘルパ。
export async function errorsOf(page) {
  return page.evaluate(() => window.__errors.splice(0));
}
export async function events(page, type) {
  return page.evaluate((t) => window.__events.filter((e) => !t || e.type === t), type);
}
export async function clearEvents(page) {
  return page.evaluate(() => void (window.__events.length = 0));
}
export function cell(page, rowIndex, colKey) {
  return page.locator(`.ssg-body-row[data-row-index="${rowIndex}"] .ssg-body-cell[data-ssg-col-key="${colKey}"]`).first();
}
export async function cellText(page, rowIndex, colKey) {
  return (await cell(page, rowIndex, colKey).textContent())?.trim();
}
export function header(page, colKey) {
  return page.locator(`.ssg-header-cell[data-ssg-col-key="${colKey}"]`).first();
}
export async function renderedRowIndexes(page) {
  return page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]').forEach((el) => set.add(Number(el.getAttribute('data-row-index'))));
    return [...set].sort((a, b) => a - b);
  });
}
export async function scrollContainer(page) {
  return page.locator('.ssg-scroll-container').first();
}
export async function scrollTo(page, top, left) {
  await page.evaluate(
    ({ top, left }) => {
      const sc = document.querySelector('.ssg-scroll-container');
      if (top !== undefined) sc.scrollTop = top;
      if (left !== undefined) sc.scrollLeft = left;
    },
    { top, left },
  );
  await page.waitForTimeout(80);
}
export async function focusGrid(page) {
  await page.locator('.ssg-shell').first().focus();
}
export async function waitIdle(page, ms = 120) {
  await page.waitForTimeout(ms);
}
// 貼り付けイベントを合成(Playwright の keyboard では clipboardData を注入できないため)。
export async function pasteText(page, text) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    const target = document.activeElement ?? document.querySelector('.ssg-shell');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
  }, text);
  await waitIdle(page);
}
export async function copyText(page) {
  return page.evaluate(() => {
    let out = null;
    const dt = new DataTransfer();
    const target = document.activeElement ?? document.querySelector('.ssg-shell');
    const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    out = dt.getData('text/plain');
    return out;
  });
}
export async function state(page) {
  return page.evaluate(() => window.__grid?.getState());
}
export async function rows(page) {
  return page.evaluate(() => window.__rows());
}