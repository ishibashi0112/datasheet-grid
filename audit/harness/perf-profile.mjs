import { open, waitIdle } from './pw.mjs';
const { page, close } = await open('big');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
const run = async (label, sort) => {
  await cdp.send('Profiler.start');
  const t = await page.evaluate((s) => { const t0 = performance.now(); window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: s }); return Math.round(performance.now() - t0); }, sort);
  const { profile } = await cdp.send('Profiler.stop');
  // self time 集計
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i += 1) {
    const n = byId.get(profile.samples[i]);
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} @ ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log(`\n### ${label}: sync ${t} ms`);
  for (const [k, v] of top) console.log(`${(v / 1000).toFixed(0).padStart(7)} ms  ${k}`);
  await waitIdle(page, 300);
};
await run('sort qty desc', [{ columnKey: 'qty', direction: 'desc' }]);
await run('sort none', []);
await close();