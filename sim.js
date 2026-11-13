// Simulates thousands of possible futures by replaying a coin's real daily
// moves from the past year in random order (in 5-day blocks, so calm and
// stormy stretches stay together), then nudging them by an economy scenario.

export const SCENARIOS = {
  steady: { label: 'Carries on', drift: 0.15, note: 'Rates and growth stay roughly where they are.' },
  cuts: { label: 'Rates fall', drift: 0.55, note: 'Cheaper money, like 2019–21, which has tended to lift crypto.' },
  recession: { label: 'Recession', drift: -0.4, note: 'Investors sell risky assets, as in 2022.' },
};

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hist: [{t, p}] daily; beta vs Bitcoin; returns weekly percentiles.
export function simulate(hist, { scenario = 'steady', beta = 1, weeks = 78, paths = 2000, block = 5 } = {}) {
  const r = [];
  for (let i = 1; i < hist.length; i++) r.push(Math.log(hist[i].p / hist[i - 1].p));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const centred = r.map((x) => x - m);
  const drift = (SCENARIOS[scenario].drift * beta) / 365;
  const days = weeks * 7;
  const start = hist.at(-1).p;
  const rand = rng(20261113 + scenario.length);
  const cols = Array.from({ length: weeks + 1 }, () => new Float64Array(paths));
  const len = centred.length;

  for (let k = 0; k < paths; k++) {
    let lp = 0;
    cols[0][k] = start;
    let d = 0;
    while (d < days) {
      const s = Math.floor(rand() * len);
      for (let j = 0; j < block && d < days; j++, d++) {
        lp += centred[(s + j) % len] + drift;
        if ((d + 1) % 7 === 0) cols[(d + 1) / 7][k] = start * Math.exp(lp);
      }
    }
  }

  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return cols.map((c) => {
    const s = Array.from(c).sort((a, b) => a - b);
    return { p10: q(s, 0.1), p25: q(s, 0.25), p50: q(s, 0.5), p75: q(s, 0.75), p90: q(s, 0.9) };
  });
}
