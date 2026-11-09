const { execSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const APP = path.join(__dirname, '..', 'app');
const res = {};
for (const n of ['react-only', 'lite-none', 'lite-standard', 'lite-standard-ssrm', 'lite-app', 'full', 'mixed']) {
  execSync(`npx vite build --config vite.size.config.ts`, { cwd: APP, env: { ...process.env, SIZE_ENTRY: n }, stdio: 'pipe' });
  const dir = path.join(APP, 'dist-size', n);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.vite', 'manifest.json'), 'utf8'));
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
  const seen = new Set();
  const walk = (k) => { if (seen.has(k)) return; seen.add(k); for (const i of manifest[k].imports || []) walk(i); };
  walk(entryKey);
  let gz = 0; let all = 0;
  for (const k of Object.keys(manifest)) {
    const f = manifest[k].file; if (!f.endsWith('.js')) continue;
    const g = zlib.gzipSync(fs.readFileSync(path.join(dir, f)), { level: 9 }).length;
    all += g; if (seen.has(k)) gz += g;
  }
  res[n] = gz;
  console.log(n.padEnd(20), 'initial gzip', (gz / 1024).toFixed(2), 'KB  (all js', (all / 1024).toFixed(2), 'KB)', ' minus react', res['react-only'] ? ((gz - res['react-only']) / 1024).toFixed(2) + 'KB' : '');
}
