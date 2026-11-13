// Turns raw prices into plain-English signals and scores.

export const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// Per-coin facts from a year of daily closes plus CoinGecko's market row.
export function coinFacts(market, hist) {
  const closes = hist.map((d) => d.p);
  const price = market.current_price ?? closes.at(-1);
  const n = closes.length;
  const avg200 = n >= 200 ? mean(closes.slice(-200)) : mean(closes);
  const low = Math.min(...closes);
  let gain = 0, loss = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  const rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  const ago = (days) => (n > days ? closes[n - 1 - days] : closes[0]);
  return {
    id: market.id,
    name: market.name,
    symbol: (market.symbol || '').toUpperCase(),
    image: market.image,
    price,
    cap: market.market_cap,
    rank: market.market_cap_rank,
    ath: market.ath,
    athDate: market.ath_date,
    belowAth: market.ath ? (1 - price / market.ath) * 100 : null,
    avg200,
    vsAvg200: (price / avg200 - 1) * 100,
    chg30: market.price_change_percentage_30d_in_currency ?? (price / ago(30) - 1) * 100,
    chg7: market.price_change_percentage_7d_in_currency ?? (price / ago(7) - 1) * 100,
    low,
    aboveLow: (price / low - 1) * 100,
    rsi,
    days: n,
    hist,
  };
}

const grade = (yes, nearly) => (yes ? { met: 'Yes', score: 1 } : nearly ? { met: 'Nearly', score: 0.5 } : { met: 'Not yet', score: 0 });

export function bitcoinCycle(btcWeekly, btc) {
  const last200 = btcWeekly.slice(-200).map((d) => d.p);
  const avg4y = mean(last200);
  const peakT = btc.athDate ? Date.parse(btc.athDate) : btcWeekly.reduce((a, b) => (b.p > a.p ? b : a)).t;
  const months = (Date.now() - peakT) / (30.44 * 864e5);
  return { avg4y, vsAvg4y: (btc.price / avg4y - 1) * 100, monthsSincePeak: months, peakT };
}

export function bottomSigns({ mood, btc, cycle, core }) {
  const m = mood.at(-1).v;
  const stretched = core.filter((c) => c.rsi < 30).length;
  return [
    { key: 'mood', ...grade(m <= 25, m <= 40), value: m },
    { key: 'drop', ...grade(btc.belowAth >= 70, btc.belowAth >= 45), value: btc.belowAth },
    { key: 'floor', ...grade(cycle.vsAvg4y <= 10, cycle.vsAvg4y <= 25), value: cycle.vsAvg4y },
    { key: 'timing', ...grade(cycle.monthsSincePeak >= 11 && cycle.monthsSincePeak <= 15, cycle.monthsSincePeak >= 9 && cycle.monthsSincePeak <= 17), value: cycle.monthsSincePeak },
    { key: 'stretch', ...grade(stretched >= 3, stretched >= 2), value: stretched, of: core.length },
  ];
}

export function climbSigns({ mood, core }) {
  const m = mood.at(-1).v;
  const above = core.filter((c) => c.vsAvg200 > 0).length;
  const holding = core.filter((c) => c.aboveLow > 5).length;
  const up = core.filter((c) => c.chg30 > 0).length;
  const n = core.length;
  return [
    { key: 'trend', ...grade(above >= Math.ceil(n * 0.75), above >= 1), value: above, of: n },
    { key: 'holding', ...grade(holding >= Math.ceil(n * 0.75), holding >= Math.ceil(n / 2)), value: holding, of: n },
    { key: 'mood_up', ...grade(m >= 50, m >= 40), value: m },
    { key: 'month', ...grade(up >= Math.ceil(n * 0.75), up >= 1), value: up, of: n },
  ];
}

export const total = (signs) => signs.reduce((s, x) => s + x.score, 0);

// Where we are on the five-stage scale.
export const STAGES = ['falling', 'bottoming', 'recovering', 'rising', 'overheated'];
export function stage({ bottom, climb, mood, cycle }) {
  const m = mood.at(-1).v;
  if (m >= 75 && cycle.vsAvg4y >= 100) return 'overheated';
  if (climb >= 3) return 'rising';
  if (climb >= 1.5) return 'recovering';
  if (bottom >= 3) return 'bottoming';
  return 'falling';
}

// Market backdrop out of 100: good when near a bottom or once a climb starts.
export const backdrop = (bottom, climb) => Math.round(clamp(0.7 * (bottom / 5) * 100 + 0.3 * (climb / 4) * 100));

export function entryScore(c, back) {
  const cheap = c.belowAth == null ? 50 : clamp((c.belowAth / 90) * 100);
  const turn = (clamp(((c.chg30 + 30) / 60) * 100) + clamp(((c.vsAvg200 + 25) / 50) * 100)) / 2;
  const score = Math.round(0.55 * cheap + 0.25 * turn + 0.2 * back);
  const word = score >= 70 ? 'Attractive entry' : score >= 55 ? 'Fair entry' : score >= 40 ? 'Wait and see' : 'Poor entry';
  return { cheap: Math.round(cheap), turn: Math.round(turn), back, score, word, risk: riskOf(c) };
}

export function riskOf(c) {
  const cap = c.cap || 0;
  let level = cap >= 100e9 ? 'Lower risk' : cap >= 10e9 ? 'Medium risk' : cap >= 1e9 ? 'Higher risk' : 'Very high risk';
  const notes = [];
  if (c.days < 300) {
    notes.push('Less than a year of price history');
    if (level === 'Lower risk' || level === 'Medium risk') level = 'Higher risk';
  }
  const tone = level === 'Lower risk' ? 'ok' : level === 'Medium risk' ? 'warn' : 'bad';
  return { level, tone, notes };
}

// Past Bitcoin cycles worked out from the weekly history.
const CYCLES = [
  { label: '2013–15', peakFrom: '2013-10-01', peakTo: '2014-03-01', lowFrom: '2014-06-01', lowTo: '2015-12-31' },
  { label: '2017–19', peakFrom: '2017-10-01', peakTo: '2018-03-01', lowFrom: '2018-06-01', lowTo: '2019-03-31' },
  { label: '2021–22', peakFrom: '2021-03-01', peakTo: '2021-12-31', lowFrom: '2022-06-01', lowTo: '2023-03-31' },
];

export function pastCycles(weekly) {
  const within = (a, b) => weekly.filter((d) => d.t >= Date.parse(a) && d.t <= Date.parse(b));
  return CYCLES.map((c) => {
    const peak = within(c.peakFrom, c.peakTo).reduce((a, b) => (b.p > a.p ? b : a));
    const low = within(c.lowFrom, c.lowTo).reduce((a, b) => (b.p < a.p ? b : a));
    return {
      label: c.label,
      peak, low,
      drop: (1 - low.p / peak.p) * 100,
      months: (low.t - peak.t) / (30.44 * 864e5),
    };
  });
}

// What Bitcoin did in the 78 weeks after each past bottom, as multiples of the bottom price.
export function recoveryPaths(weekly, cycles, weeks = 78) {
  return cycles.slice(1).map((c) => {
    const i = weekly.findIndex((d) => d.t === c.low.t);
    const path = weekly.slice(i, i + weeks + 1).map((d) => d.p / c.low.p);
    const yr = new Date(c.low.t).getUTCFullYear();
    return { label: `After the ${yr} bottom`, path };
  });
}

// Beta of a coin's daily returns against Bitcoin's.
export function betaVsBtc(hist, btcHist) {
  const btcMap = new Map(btcHist.map((d) => [d.t, d.p]));
  const xs = [], ys = [];
  for (let i = 1; i < hist.length; i++) {
    const a0 = btcMap.get(hist[i - 1].t), a1 = btcMap.get(hist[i].t);
    if (!a0 || !a1) continue;
    xs.push(Math.log(a1 / a0));
    ys.push(Math.log(hist[i].p / hist[i - 1].p));
  }
  if (xs.length < 30) return 1.3;
  const mx = mean(xs), my = mean(ys);
  let cov = 0, v = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); v += (xs[i] - mx) ** 2; }
  return clamp(cov / v, 0.5, 2.5);
}
