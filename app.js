import { getMarkets, getHistory, getMood, getBtcWeekly, searchCoins } from './api.js';
import {
  coinFacts, bitcoinCycle, bottomSigns, climbSigns, total, stage, STAGES,
  backdrop, entryScore, pastCycles, recoveryPaths, betaVsBtc,
} from './analysis.js';
import { simulate, SCENARIOS } from './sim.js';
import { fanChart, moodChart, sparkline, fmtUsd, fmtDate } from './charts.js';

// The coins the market signs are based on. Change these to track your own.
const CORE = ['bitcoin', 'ripple', 'stellar', 'solana'];

const state = {
  facts: new Map(),
  btcWeekly: null,
  mood: null,
  backdrop: 50,
  cycles: [],
  recoveries: [],
  extra: null,
  outcomeCoin: 'bitcoin',
  scoreCoin: 'bitcoin',
  scenario: 'steady',
  bands: null,
};

const $ = (id) => document.getElementById(id);
const gbp = (v) => '£' + Math.round(v).toLocaleString('en-GB');
const pct = (v, dp = 1) => (v == null ? '–' : `${Math.abs(v).toFixed(dp)}%`);
const signed = (v, dp = 1) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dp)}%`);
const fmtCap = (v) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${Math.round(v / 1e6)}M`);
const fmtScore = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

async function init() {
  try {
    const [btcWeekly, mood, markets] = await Promise.all([getBtcWeekly(), getMood(), getMarkets(CORE)]);
    state.btcWeekly = btcWeekly;
    state.mood = mood;
    for (const id of CORE) {
      const m = markets.find((x) => x.id === id);
      if (!m) continue;
      const hist = await getHistory(id);
      state.facts.set(id, coinFacts(m, hist));
    }
    computeMarket();
    renderAll();
  } catch (err) {
    console.error(err);
    $('hero-line').textContent = "Couldn't load live prices right now.";
    $('hero-sub').textContent = 'The free price service may be busy. Try refreshing in a minute.';
    $('asof').textContent = 'Offline';
  }
}

function computeMarket() {
  const core = CORE.map((id) => state.facts.get(id)).filter(Boolean);
  const btc = state.facts.get('bitcoin');
  const cycle = bitcoinCycle(state.btcWeekly, btc);
  const bSigns = bottomSigns({ mood: state.mood, btc, cycle, core });
  const cSigns = climbSigns({ mood: state.mood, core });
  const b = total(bSigns), c = total(cSigns);
  state.cycle = cycle;
  state.bSigns = bSigns;
  state.cSigns = cSigns;
  state.bottom = b;
  state.climb = c;
  state.stage = stage({ bottom: b, climb: c, mood: state.mood, cycle });
  state.backdrop = backdrop(b, c);
  state.cycles = pastCycles(state.btcWeekly);
  state.recoveries = recoveryPaths(state.btcWeekly, state.cycles);
}

function renderAll() {
  renderHero();
  renderSigns();
  renderCycles();
  moodChart($('mood-chart'), state.mood);
  renderRank();
  renderScore(state.scoreCoin);
  renderTabs();
  renderOutcomes();
}

function renderHero() {
  const now = new Date();
  $('asof').textContent = `Live · ${fmtDate(now)}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const line = document.querySelector(`[data-line="${state.stage}"]`);
  $('hero-line').textContent = line ? line.textContent : '';
  $('hero-sub').textContent = `${fmtScore(state.bottom)} of 5 bottom signs are showing. ${fmtScore(state.climb)} of 4 recovery signs are showing.`;
  const badge = $('stage-badge');
  badge.textContent = state.stage[0].toUpperCase() + state.stage.slice(1);
  badge.dataset.stage = state.stage;
  const idx = STAGES.indexOf(state.stage);
  document.querySelectorAll('#scale span').forEach((s, i) => {
    s.classList.toggle('on', i <= idx);
    s.classList.toggle('here', i === idx);
  });
}

function renderSigns() {
  const show = (signs, scoreEl, segEl) => {
    $(scoreEl).textContent = fmtScore(total(signs));
    $(segEl).replaceChildren(...signs.map((s) => {
      const d = document.createElement('span');
      d.className = s.score === 1 ? 'on' : s.score === 0.5 ? 'half' : '';
      return d;
    }));
    signs.forEach((s) => {
      const pill = document.querySelector(`[data-sign="${s.key}"]`);
      if (pill) {
        pill.textContent = s.met;
        pill.className = 'pill ' + (s.met === 'Yes' ? 'yes' : s.met === 'Nearly' ? 'nearly' : '');
      }
      const val = document.querySelector(`[data-val="${s.key}"]`);
      if (!val) return;
      if (s.key === 'drop') val.textContent = pct(s.value);
      else if (s.key === 'floor') val.textContent = signed(s.value);
      else if (s.key === 'timing') val.textContent = s.value.toFixed(1);
      else val.textContent = String(Math.round(s.value));
    });
  };
  show(state.bSigns, 'bottom-score', 'bottom-segs');
  show(state.cSigns, 'climb-score', 'climb-segs');
}

function renderCycles() {
  const btc = state.facts.get('bitcoin');
  const rows = state.cycles.map((c) => ({ label: c.label, drop: c.drop, months: c.months, now: false }));
  rows.push({ label: `${new Date(state.cycle.peakT).getUTCFullYear()}–${String(new Date().getUTCFullYear()).slice(2)}`, drop: btc.belowAth, months: state.cycle.monthsSincePeak, now: true });
  $('cycles-body').replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    if (r.now) tr.className = 'now';
    [r.label, `${Math.round(r.drop)}%`, r.months.toFixed(1)].forEach((v) => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    return tr;
  }));
}

// ---------- entry score ----------

function renderRank() {
  const coins = [...CORE.map((id) => state.facts.get(id)), state.extra && state.facts.get(state.extra)].filter(Boolean);
  const scored = coins.map((c) => ({ c, s: entryScore(c, state.backdrop) })).sort((a, b) => b.s.score - a.s.score);
  $('rank').replaceChildren(...scored.map(({ c, s }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c.id === state.scoreCoin));
    const name = document.createElement('span');
    name.textContent = c.name;
    const num = document.createElement('span');
    num.className = 'r-score';
    num.textContent = s.score;
    b.append(name, num);
    b.onclick = () => { state.scoreCoin = c.id; renderScore(c.id); renderRank(); };
    return b;
  }));
}

function setBar(id, v) {
  $(id).style.width = v + '%';
  $(id + '-v').textContent = `${v}/100`;
}

function renderScore(id) {
  const c = state.facts.get(id);
  if (!c) return;
  const s = entryScore(c, state.backdrop);
  $('sc-img').src = c.image || '';
  $('sc-img').hidden = !c.image;
  $('sc-name').textContent = c.name;
  $('sc-sym').textContent = c.symbol;
  $('sc-price').textContent = `${fmtUsd(c.price)} · ${signed(c.chg7)} this week`;
  $('sc-score').textContent = s.score;
  $('sc-word').textContent = s.word;
  setBar('sc-cheap', s.cheap);
  setBar('sc-turn', s.turn);
  setBar('sc-back', s.back);
  $('sc-cheap-t').textContent = c.belowAth == null ? 'No all-time high on record' : `${pct(c.belowAth)} below its all-time high`;
  $('sc-turn-t').textContent = `${signed(c.chg30)} this month, ${pct(c.vsAvg200)} ${c.vsAvg200 < 0 ? 'below' : 'above'} its 7-month average`;
  $('sc-back-t').textContent = state.stage === 'bottoming' ? 'Most bottom signs are showing across the market' : `The market is ${state.stage}`;
  const risk = $('sc-risk');
  risk.textContent = s.risk.level;
  risk.className = 'pill ' + s.risk.tone;
  const capTxt = c.cap ? `Market size ${fmtCap(c.cap)}` : 'Market size unknown';
  $('sc-risk-t').textContent = [capTxt + '. Smaller coins swing harder and fail more often.', ...s.risk.notes].join(' ');
  sparkline($('sc-spark'), c.hist);
}

// ---------- search ----------

let searchTimer, results = [], active = -1;
const q = $('q'), list = $('suggestions'), err = $('search-error');

function showResults() {
  list.replaceChildren(...results.map((r, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === active));
    if (r.thumb) { const img = document.createElement('img'); img.src = r.thumb; img.alt = ''; li.appendChild(img); }
    const name = document.createElement('span');
    name.textContent = r.name;
    const sym = document.createElement('span');
    sym.className = 'muted small';
    sym.textContent = r.symbol;
    const rk = document.createElement('span');
    rk.className = 'rank-no';
    rk.textContent = r.rank ? `#${r.rank}` : '';
    li.append(name, sym, rk);
    li.onmousedown = (e) => { e.preventDefault(); pick(r); };
    return li;
  }));
  list.hidden = results.length === 0;
}

q.addEventListener('input', () => {
  err.hidden = true;
  clearTimeout(searchTimer);
  const term = q.value.trim();
  if (term.length < 2) { results = []; showResults(); return; }
  searchTimer = setTimeout(async () => {
    try {
      results = await searchCoins(term);
      active = results.length ? 0 : -1;
      if (q.value.trim() !== term) return;
      showResults();
      if (!results.length) { err.textContent = `No coins found for "${term}".`; err.hidden = false; }
    } catch {
      err.textContent = "Search isn't responding. Try again in a moment.";
      err.hidden = false;
    }
  }, 350);
});

q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!results.length) return;
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    showResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (results[active]) pick(results[active]);
    else if (q.value.trim().length < 2) { err.textContent = 'Type at least two letters of a coin name.'; err.hidden = false; }
  } else if (e.key === 'Escape') {
    list.hidden = true;
  }
});
q.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 150));

async function pick(r) {
  list.hidden = true;
  q.value = '';
  results = [];
  if (!state.facts.has(r.id)) {
    $('score-card').classList.add('loading');
    try {
      const [m] = await getMarkets([r.id]);
      if (!m) throw new Error('No market data');
      const hist = await getHistory(r.id);
      if (hist.length < 10) throw new Error('Not enough history');
      state.facts.set(r.id, coinFacts(m, hist));
    } catch {
      err.textContent = `Couldn't load ${r.name}. It may be too new or not traded enough.`;
      err.hidden = false;
      $('score-card').classList.remove('loading');
      return;
    }
    $('score-card').classList.remove('loading');
  }
  if (!CORE.includes(r.id)) state.extra = r.id;
  state.scoreCoin = r.id;
  state.outcomeCoin = r.id;
  renderScore(r.id);
  renderRank();
  renderTabs();
  renderOutcomes();
}

// ---------- outcomes ----------

function tabButtons(container, items, current, onPick) {
  container.replaceChildren(...items.map(([key, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(key === current));
    b.textContent = label;
    b.onclick = () => onPick(key);
    return b;
  }));
}

function renderTabs() {
  const ids = [...CORE, ...(state.extra ? [state.extra] : [])];
  tabButtons($('coin-tabs'), ids.map((id) => [id, state.facts.get(id)?.symbol || id]), state.outcomeCoin, (id) => {
    state.outcomeCoin = id; renderTabs(); renderOutcomes();
  });
  tabButtons($('scenario-tabs'), Object.entries(SCENARIOS).map(([k, s]) => [k, s.label]), state.scenario, (k) => {
    state.scenario = k; renderTabs(); renderOutcomes();
  });
  $('scenario-note').textContent = SCENARIOS[state.scenario].note;
}

function renderOutcomes() {
  const c = state.facts.get(state.outcomeCoin);
  const btc = state.facts.get('bitcoin');
  if (!c || !btc) return;
  const beta = c.id === 'bitcoin' ? 1 : betaVsBtc(c.hist, btc.hist);
  state.bands = simulate(c.hist, { scenario: state.scenario, beta });
  state.beta = beta;
  drawFan();
  renderCalc();
}

function drawFan() {
  const c = state.facts.get(state.outcomeCoin);
  const overlays = $('show-history').checked
    ? state.recoveries.map((r, i) => ({ label: r.label, path: r.path.map((x) => x ** state.beta), cls: i ? 'alt' : '' }))
    : [];
  fanChart($('fan'), {
    past: c.hist,
    bands: state.bands,
    overlays,
    label: `${c.name} price over the past year and the simulated range for the next 18 months`,
  });
}

function renderCalc() {
  const amt = +$('amount').value;
  $('amount-out').textContent = gbp(amt);
  const start = state.facts.get(state.outcomeCoin).price;
  const end = state.bands.at(-1);
  const set = (id, v) => {
    const x = v / start;
    $(id).textContent = gbp(amt * x);
    $(id + '-x').textContent = `${x >= 1 ? '+' : '−'}${Math.abs((x - 1) * 100).toFixed(0)}%`;
  };
  set('out-bad', end.p10);
  set('out-mid', end.p50);
  set('out-good', end.p90);
}

$('amount').addEventListener('input', () => state.bands && renderCalc());
$('show-history').addEventListener('change', () => state.bands && drawFan());

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.bands) return;
    drawFan();
    moodChart($('mood-chart'), state.mood);
    renderScore(state.scoreCoin);
  }, 200);
});

init();
