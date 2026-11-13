// Refreshes data/btc-weekly.json with Bitcoin weekly closes from Kraken.
// Kraken returns the latest ~720 weeks, so new weeks are merged into the
// existing file and older history is kept.
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../data/btc-weekly.json', import.meta.url);
const WEEK = 7 * 864e5;

const res = await fetch('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080');
if (!res.ok) throw new Error(`Kraken returned ${res.status}`);
const body = await res.json();
if (body.error?.length) throw new Error(body.error.join(', '));
const key = Object.keys(body.result).find((k) => k !== 'last');
const fresh = body.result[key].map(([t, , , , close]) => [t * 1000, Math.round(+close)]);

const old = JSON.parse(await readFile(FILE, 'utf8'));
const start = Date.parse(old.start);
const byWeek = new Map(old.closes.map((p, i) => [start + i * WEEK, p]));
for (const [t, p] of fresh) byWeek.set(t, p);

const times = [...byWeek.keys()].sort((a, b) => a - b);
const closes = [];
for (let t = times[0]; t <= times.at(-1); t += WEEK) {
  closes.push(byWeek.get(t) ?? closes.at(-1));
}

const out = {
  source: 'Kraken XBT/USD weekly closes',
  start: new Date(times[0]).toISOString().slice(0, 10),
  interval_days: 7,
  updated: new Date().toISOString().slice(0, 10),
  closes,
};
await writeFile(FILE, JSON.stringify(out));
console.log(`Saved ${closes.length} weeks, latest close $${closes.at(-1)}`);
