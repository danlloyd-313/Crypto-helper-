// Fetching live data from CoinGecko and alternative.me, with a small cache
// and a queue so we stay inside CoinGecko's free rate limit.

const CG = 'https://api.coingecko.com/api/v3';
const FNG = 'https://api.alternative.me/fng/';
const CACHE_MINUTES = 15;
const GAP_MS = 1300; // space between CoinGecko calls

let lastCall = 0;
let chain = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cacheGet(key) {
  try {
    const raw = localStorage.getItem('co:' + key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > CACHE_MINUTES * 60e3) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem('co:' + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage full or blocked: carry on without cache */
  }
}

async function getJSON(url, { queued = false, retries = 3 } = {}) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      if (queued) {
        const wait = lastCall + GAP_MS - Date.now();
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();
      }
      const res = await fetch(url);
      if (res.status === 429 && attempt < retries) {
        await sleep(8000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    }
  };
  if (!queued) return run();
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

async function cached(key, fn) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await fn();
  cacheSet(key, data);
  return data;
}

export function getMarkets(ids) {
  const list = [...ids].sort().join(',');
  return cached('markets:' + list, () =>
    getJSON(`${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(list)}&price_change_percentage=7d,30d`, { queued: true })
  );
}

// Daily closes for the past year: [{t, p}]
export function getHistory(id) {
  return cached('hist:' + id, async () => {
    const j = await getJSON(`${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=365&interval=daily`, { queued: true });
    const seen = new Map();
    for (const [t, p] of j.prices || []) seen.set(new Date(t).toISOString().slice(0, 10), p);
    return [...seen.entries()].map(([d, p]) => ({ t: Date.parse(d), p }));
  });
}

export function searchCoins(query) {
  return cached('search:' + query.toLowerCase(), async () => {
    const j = await getJSON(`${CG}/search?query=${encodeURIComponent(query)}`, { queued: true });
    return (j.coins || []).slice(0, 8).map((c) => ({
      id: c.id,
      name: c.name,
      symbol: (c.symbol || '').toUpperCase(),
      rank: c.market_cap_rank,
      thumb: c.thumb,
    }));
  });
}

export function getMood() {
  return cached('fng', async () => {
    const j = await getJSON(`${FNG}?limit=60`);
    return (j.data || [])
      .map((d) => ({ t: +d.timestamp * 1000, v: +d.value, label: d.value_classification }))
      .sort((a, b) => a.t - b.t);
  });
}

export async function getBtcWeekly() {
 const res = await fetch('btc-weekly.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Bitcoin history missing');
  const j = await res.json();
  const start = Date.parse(j.start);
  return j.closes.map((p, i) => ({ t: start + i * 7 * 864e5, p }));
}
