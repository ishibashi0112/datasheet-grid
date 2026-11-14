// esbuild で minify・React を外部化して、初期 JS(入口から静的 import でたどれるチャンク)の gzip を測る
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');
const esbuild = require(path.join(__dirname, '..', 'sizetool', 'node_modules', 'esbuild'));
const APP = path.join(__dirname, '..', 'app');
const OUT = path.join(__dirname, '..', 'sizetool', 'out');
(async () => {
  const names = ['lite-none', 'lite-standard', 'lite-standard-ssrm', 'lite-app', 'full', 'mixed'];
  for (const n of names) {
    const outdir = path.join(OUT, n);
    fs.rmSync(outdir, { recursive: true, force: true });
    const r = await esbuild.build({
      entryPoints: [path.join(APP, 'size', n + '.tsx')], bundle: true, minify: true, format: 'esm', splitting: true,
      outdir, metafile: true, jsx: 'automatic', write: true, logLevel: 'error',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      absWorkingDir: APP, define: { 'process.env.NODE_ENV': '"production"' },
    });
    const outputs = r.metafile.outputs;
    const entry = Object.keys(outputs).find((k) => outputs[k].entryPoint);
    const seen = new Set();
    const walk = (k) => { if (seen.has(k)) return; seen.add(k); for (const im of outputs[k].imports) if (im.kind === 'import-statement' && outputs[im.path]) walk(im.path); };
    walk(entry);
    let gz = 0, raw = 0, lazy = 0;
    for (const k of Object.keys(outputs)) {
      if (!k.endsWith('.js')) continue;
      const b = fs.readFileSync(path.join(APP, k));
      const g = zlib.gzipSync(b, { level: 9 }).length;
      if (seen.has(k)) { gz += g; raw += b.length; } else lazy += g;
    }
    console.log(n.padEnd(20), 'initial gzip', (gz / 1024).toFixed(2) + 'KB', ' raw', (raw / 1024).toFixed(1) + 'KB', ' lazy gzip', (lazy / 1024).toFixed(2) + 'KB', ' chunks', seen.size);
  }
})();
