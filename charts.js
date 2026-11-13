// Small hand-rolled SVG charts: no libraries, so the site loads fast and
// works offline once cached.

const NS = 'http://www.w3.org/2000/svg';
const WEEK = 7 * 864e5;

export const fmtUsd = (v) => {
  if (v == null || !isFinite(v)) return '–';
  if (v >= 1000) return '$' + Math.round(v).toLocaleString('en-GB');
  if (v >= 100) return '$' + v.toFixed(0);
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.1) return '$' + v.toFixed(3);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toPrecision(3);
};
export const fmtDate = (t, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(t).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function text(parent, x, y, str, attrs = {}) {
  const t = el('text', { x, y, class: 'ch-label', ...attrs }, parent);
  t.textContent = str;
  return t;
}

function tooltip(box) {
  let tip = box.querySelector('.ch-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'ch-tip';
    tip.hidden = true;
    box.appendChild(tip);
  }
  return tip;
}

function placeTip(tip, box, xPx) {
  const w = box.clientWidth;
  tip.style.left = Math.min(Math.max(0, xPx - tip.offsetWidth / 2), w - tip.offsetWidth) + 'px';
}

function tipLines(tip, lines) {
  tip.replaceChildren(
    ...lines.map(([cls, str]) => {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = str;
      return d;
    })
  );
}

function logTicks(lo, hi, count = 5) {
  const out = [];
  const nice = [1, 1.5, 2, 3, 5, 7];
  const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
  for (let e = e0; e <= e1; e++) for (const n of nice) {
    const v = n * 10 ** e;
    if (v >= lo && v <= hi) out.push(v);
  }
  if (out.length <= count) return out;
  const step = Math.ceil(out.length / count);
  return out.filter((_, i) => i % step === 0);
}

// past: [{t,p}] daily; bands: weekly [{p10..p90}] starting today;
// overlays: [{label, path:[multiples], cls}]
export function fanChart(box, { past, bands, overlays = [], label }) {
  box.querySelectorAll('svg').forEach((s) => s.remove());
  const W = Math.max(300, box.clientWidth), H = W < 520 ? 260 : 320;
  const m = { t: 12, r: 12, b: 28, l: 0 };
  const now = past.at(-1).t, start = past[0].t;
  const end = now + (bands.length - 1) * WEEK;
  const startP = past.at(-1).p;

  // Scale to the price and the simulated range; past-recovery lines can stretch
  // it, but by no more than 1.6x, and anything above is clipped.
  const vals = past.map((d) => d.p).concat(bands.flatMap((b) => [b.p10, b.p90]));
  const baseHi = Math.max(...vals);
  const overHi = Math.max(0, ...overlays.flatMap((o) => o.path.map((x) => x * startP)));
  const lo = Math.min(...vals) * 0.92;
  const hi = Math.max(baseHi, Math.min(overHi, baseHi * 1.6)) * 1.05;
  const ticks = logTicks(lo, hi);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': label }, null);
  box.prepend(svg);

  // measure tick label width for left margin
  let widest = 40;
  for (const v of ticks) {
    const probe = text(svg, 0, 0, fmtUsd(v));
    widest = Math.max(widest, probe.getComputedTextLength());
    probe.remove();
  }
  m.l = Math.ceil(widest) + 12;

  const X = (t) => m.l + ((t - start) / (end - start)) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (H - m.t - m.b);

  ticks.forEach((v) => {
    el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'ch-grid' }, svg);
    text(svg, m.l - 8, Y(v) + 4, fmtUsd(v), { 'text-anchor': 'end' });
  });

  // future shading
  el('rect', { x: X(now), y: m.t, width: X(end) - X(now), height: H - m.t - m.b, class: 'ch-future' }, svg);

  const bandPath = (a, b) =>
    'M' + bands.map((d, i) => `${X(now + i * WEEK)},${Y(d[a])}`).join('L') +
    'L' + bands.map((d, i) => `${X(now + i * WEEK)},${Y(d[b])}`).reverse().join('L') + 'Z';
  el('path', { d: bandPath('p10', 'p90'), class: 'ch-band-outer' }, svg);
  el('path', { d: bandPath('p25', 'p75'), class: 'ch-band-inner' }, svg);
  el('path', { d: 'M' + bands.map((d, i) => `${X(now + i * WEEK)},${Y(d.p50)}`).join('L'), class: 'ch-median' }, svg);

  const clipId = 'clip' + Math.random().toString(36).slice(2, 8);
  const cp = el('clipPath', { id: clipId }, el('defs', {}, svg));
  el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, cp);
  overlays.forEach((o) => {
    el('path', { 'clip-path': `url(#${clipId})`, d: 'M' + o.path.map((x, i) => `${X(now + i * WEEK)},${Y(x * startP)}`).join('L'), class: 'ch-overlay ' + (o.cls || '') }, svg);
  });

  el('path', { d: 'M' + past.map((d) => `${X(d.t)},${Y(d.p)}`).join('L'), class: 'ch-past' }, svg);
  el('line', { x1: X(now), x2: X(now), y1: m.t, y2: H - m.b, class: 'ch-today' }, svg);
  el('circle', { cx: X(now), cy: Y(startP), r: 4.5, class: 'ch-dot' }, svg);

  // x labels
  const xl = [[start, fmtDate(start, { month: 'short', year: 'numeric' }), 'start'], [now, 'Today', 'middle'], [end, fmtDate(end, { month: 'short', year: 'numeric' }), 'end']];
  if (W > 520) xl.splice(2, 0, [now + 52 * WEEK, fmtDate(now + 52 * WEEK, { month: 'short', year: 'numeric' }), 'middle']);
  xl.forEach(([t, s, a]) => text(svg, X(t), H - 8, s, { 'text-anchor': a }));

  // hover
  const tip = tooltip(box);
  const guide = el('line', { y1: m.t, y2: H - m.b, class: 'ch-guide', visibility: 'hidden' }, svg);
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = start + ((px - m.l) / (W - m.l - m.r)) * (end - start);
    let x, lines;
    if (t <= now) {
      const d = past.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
      x = X(d.t);
      lines = [['d', fmtDate(d.t)], ['', fmtUsd(d.p)]];
    } else {
      const i = Math.max(0, Math.min(bands.length - 1, Math.round((t - now) / WEEK)));
      const b = bands[i];
      x = X(now + i * WEEK);
      lines = [['d', `In ${i} weeks (${fmtDate(now + i * WEEK, { month: 'short', year: 'numeric' })})`], ['', `Middle ${fmtUsd(b.p50)}`], ['m', `Likely ${fmtUsd(b.p25)} – ${fmtUsd(b.p75)}`]];
      overlays.forEach((o) => { if (o.path[i] != null) lines.push(['m', `${o.label}: ${fmtUsd(o.path[i] * startP)}`]); });
    }
    guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tipLines(tip, lines);
    placeTip(tip, box, (x / W) * r.width);
  };
  svg.onpointerleave = () => { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); };
}

export function moodChart(box, rows) {
  box.querySelectorAll('svg').forEach((s) => s.remove());
  const W = Math.max(280, box.clientWidth), H = 200;
  const m = { t: 10, r: 10, b: 26, l: 30 };
  const t0 = rows[0].t, t1 = rows.at(-1).t;
  const X = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Daily Fear and Greed score over the last 60 days' });
  box.prepend(svg);
  el('rect', { x: m.l, y: Y(25), width: W - m.l - m.r, height: Y(0) - Y(25), class: 'ch-zone-fear' }, svg);
  el('rect', { x: m.l, y: Y(100), width: W - m.l - m.r, height: Y(75) - Y(100), class: 'ch-zone-greed' }, svg);
  text(svg, m.l + 6, Y(25) + 14, 'Extreme fear');
  text(svg, m.l + 6, Y(100) + 14, 'Extreme greed');
  [0, 25, 50, 75, 100].forEach((v) => text(svg, m.l - 6, Y(v) + 4, String(v), { 'text-anchor': 'end' }));
  el('line', { x1: m.l, x2: W - m.r, y1: Y(50), y2: Y(50), class: 'ch-grid' }, svg);
  el('path', { d: 'M' + rows.map((r) => `${X(r.t)},${Y(r.v)}`).join('L'), class: 'ch-past' }, svg);
  el('circle', { cx: X(t1), cy: Y(rows.at(-1).v), r: 4.5, class: 'ch-dot' }, svg);
  const n = W > 480 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    text(svg, X(t), H - 8, fmtDate(t, { day: 'numeric', month: 'short' }), { 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
  }
  const tip = tooltip(box);
  const dot = el('circle', { r: 3.5, class: 'ch-dot', visibility: 'hidden' }, svg);
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect();
    const t = t0 + ((((e.clientX - r.left) / r.width) * W - m.l) / (W - m.l - m.r)) * (t1 - t0);
    const d = rows.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    dot.setAttribute('cx', X(d.t)); dot.setAttribute('cy', Y(d.v)); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tipLines(tip, [['d', fmtDate(d.t)], ['', `${d.v} · ${d.label}`]]);
    placeTip(tip, box, (X(d.t) / W) * r.width);
  };
  svg.onpointerleave = () => { tip.hidden = true; dot.setAttribute('visibility', 'hidden'); };
}

export function sparkline(box, hist) {
  box.replaceChildren();
  const W = Math.max(160, box.clientWidth), H = 48;
  const ps = hist.map((d) => d.p);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  const X = (i) => (i / (ps.length - 1)) * W;
  const Y = (v) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', 'aria-hidden': 'true' }, box);
  el('path', { d: 'M' + ps.map((v, i) => `${X(i)},${Y(v)}`).join('L'), class: 'ch-spark' }, svg);
}
