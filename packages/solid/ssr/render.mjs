// サーバーで fixtures の表を描き、HTML と、描いている間に現在時刻を読んだ場所を JSON で標準出力へ書く(globalSetup.ts が
//   子のプロセスで走らせる)。Vite の SSR と @solidjs/vite-plugin(ssr: true)で読み込む。描く時刻は FIXED_NOW に固定し、
//   タイムゾーンは表ごとに決める(fixtures の SERVER_TIME_ZONE_OF、無ければ SERVER_TZ)。
import { createServer } from 'vite';
import solid from '@solidjs/vite-plugin';

const dir = new URL('.', import.meta.url).pathname;
let FIXED_NOW = 0;
const RealDate = Date;
const reads = [];
let tracking = false;
class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      if (tracking) reads.push(new Error('new Date()').stack ?? 'new Date()');
      super(FIXED_NOW);
    } else {
      super(...args);
    }
  }
  static now() {
    if (tracking) reads.push(new Error('Date.now()').stack ?? 'Date.now()');
    return FIXED_NOW;
  }
}

const server = await createServer({
  configFile: false,
  root: dir,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, fs: { strict: false } },
  plugins: [solid({ ssr: true })],
  ssr: { noExternal: [/@ishibashi0112/] },
});
try {
  const { FIXED_NOW: fixedNow, SERVER_TZ } = await server.ssrLoadModule(`${dir}timeZones.ts`);
  FIXED_NOW = fixedNow;
  const mod = await server.ssrLoadModule(`${dir}entry-server.tsx`);
  const fixtures = await server.ssrLoadModule(`${dir}fixtures.tsx`);
  const { generateHydrationScript, renderToString } = await server.ssrLoadModule('@solidjs/web');
  const pages = {};
  const currentTimeReads = {};
  globalThis.Date = FixedDate;
  for (const name of Object.keys(fixtures.fixtures)) {
    // Node はタイムゾーンを process.env.TZ を書いたときに読み直す。
    process.env.TZ = fixtures.SERVER_TIME_ZONE_OF[name] ?? SERVER_TZ;
    reads.length = 0;
    tracking = true;
    try {
      pages[name] = mod.renderOne(name, renderToString);
    } finally {
      tracking = false;
    }
    currentTimeReads[name] = reads.map((stack) => stack.split('\n').slice(0, 4).join('\n'));
  }
  globalThis.Date = RealDate;
  process.stdout.write(JSON.stringify({ script: generateHydrationScript(), pages, currentTimeReads }));
} finally {
  await server.close();
}