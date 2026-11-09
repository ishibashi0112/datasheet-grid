// Mock market data for the stock board.

export type Status = 'Trading' | 'Halted' | 'Pre-market' | 'Closed';

export type Quote = {
  symbol: string;
  name: string;
  sector: string;
  exchange: 'NYSE' | 'NASDAQ' | 'AMEX';
  last: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  marketCap: number;
  status: Status;
  target: number | null;
  memo: string;
  updatedAt: string; // ISO timestamp
};

const SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Energy',
  'Industrials',
  'Consumer Staples',
  'Consumer Discretionary',
  'Utilities',
  'Materials',
  'Real Estate',
  'Communication Services',
];

const WORDS = [
  'Apex', 'Blue', 'Cedar', 'Delta', 'Echo', 'Falcon', 'Granite', 'Harbor', 'Iron', 'Juniper',
  'Keystone', 'Lumen', 'Maple', 'Nova', 'Orion', 'Pioneer', 'Quantum', 'River', 'Summit', 'Titan',
  'Union', 'Vertex', 'Willow', 'Xenon', 'Yield', 'Zenith',
];
const SUFFIX = ['Holdings', 'Systems', 'Labs', 'Energy', 'Capital', 'Foods', 'Motors', 'Health', 'Networks', 'Materials'];

// Small deterministic PRNG so every reload shows the same universe.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function generateQuotes(count: number): Quote[] {
  const rnd = mulberry32(42);
  const used = new Set<string>();
  const out: Quote[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    let symbol = '';
    do {
      const len = 2 + Math.floor(rnd() * 3);
      symbol = '';
      for (let k = 0; k < len; k++) symbol += String.fromCharCode(65 + Math.floor(rnd() * 26));
    } while (used.has(symbol));
    used.add(symbol);
    const name = `${WORDS[Math.floor(rnd() * WORDS.length)]} ${WORDS[Math.floor(rnd() * WORDS.length)]} ${SUFFIX[Math.floor(rnd() * SUFFIX.length)]}`;
    const prevClose = round2(5 + rnd() * 495);
    const last = round2(prevClose * (1 + (rnd() - 0.5) * 0.06));
    const change = round2(last - prevClose);
    const r = rnd();
    const status: Status = r < 0.9 ? 'Trading' : r < 0.95 ? 'Pre-market' : r < 0.98 ? 'Halted' : 'Closed';
    out.push({
      symbol,
      name,
      sector: SECTORS[Math.floor(rnd() * SECTORS.length)],
      exchange: rnd() < 0.5 ? 'NASDAQ' : rnd() < 0.85 ? 'NYSE' : 'AMEX',
      last,
      prevClose,
      change,
      changePct: round2((change / prevClose) * 100),
      volume: Math.floor(rnd() * 20_000_000),
      high: round2(Math.max(last, prevClose) * (1 + rnd() * 0.01)),
      low: round2(Math.min(last, prevClose) * (1 - rnd() * 0.01)),
      marketCap: Math.floor(prevClose * (1e6 + rnd() * 5e9)),
      status,
      target: rnd() < 0.3 ? round2(prevClose * (0.8 + rnd() * 0.5)) : null,
      memo: '',
      updatedAt: now,
    });
  }
  return out;
}

/** Return a new array where `n` random trading rows got a new price. Untouched rows keep their reference. */
export function tick(rows: readonly Quote[], n: number, rnd: () => number = Math.random): Quote[] {
  const next = rows.slice();
  const now = new Date().toISOString();
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rnd() * next.length);
    const q = next[i];
    if (!q || q.status === 'Halted' || q.status === 'Closed') continue;
    const last = round2(Math.max(0.01, q.last * (1 + (rnd() - 0.5) * 0.004)));
    const change = round2(last - q.prevClose);
    next[i] = {
      ...q,
      last,
      change,
      changePct: round2((change / q.prevClose) * 100),
      volume: q.volume + Math.floor(rnd() * 5000),
      high: Math.max(q.high, last),
      low: Math.min(q.low, last),
      updatedAt: now,
    };
  }
  return next;
}