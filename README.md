# Crypto outlook

A plain-English read on whether the crypto market is heading higher or lower.

- **The verdict**: where the market sits on a five-stage scale, from falling to overheated.
- **Entry score**: search any coin for a score out of 100 based on how cheap it is, whether it's turning up, and the market backdrop, with a risk label based on its size.
- **What could happen next**: 2,000 simulated futures for the next 18 months, under three economy scenarios, plus what Bitcoin did after its past bottoms.
- **Are we near the bottom? / Has the climb started?**: nine simple signs, each marked yes, nearly or not yet.
- **Market mood** and **how past Bitcoin bottoms compare**.

It's a static site with no build step and no server. Prices load live in the visitor's browser from CoinGecko's free API and the Fear & Greed Index. Bitcoin's long-term weekly history lives in `data/btc-weekly.json` and a GitHub Action refreshes it daily from Kraken.

Not financial advice.

## Publish on GitHub Pages

1. Create a new repository on GitHub and upload everything in this folder (or push it with git).
2. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
3. Go to **Settings → Actions → General** and, under "Workflow permissions", choose **Read and write permissions** so the daily data update can commit.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Run it locally

Any static server works, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. (Opening `index.html` directly from disk won't work because browsers block modules on `file://`.)

## Change the coins

The four coins the market signs are based on are set at the top of `js/app.js`:

```js
const CORE = ['bitcoin', 'ripple', 'stellar', 'solana'];
```

Use CoinGecko ids (the last part of a coin's CoinGecko URL).

## Files

- `index.html`: page structure and all the wording
- `css/style.css`: the look, with light and dark mode
- `js/api.js`: fetching live data, with a 15-minute cache
- `js/analysis.js`: the signs, the verdict, the entry score and past cycles
- `js/sim.js`: the simulations and economy scenarios
- `js/charts.js`: the charts
- `js/app.js`: wires it all together
- `scripts/update-btc.mjs` and `.github/workflows/update-data.yml`: daily Bitcoin history refresh

## Notes

- CoinGecko's free API allows a limited number of requests per minute. The site spaces its requests out and caches results for 15 minutes, so a first visit takes a few seconds to fill in.
- Scenario nudges are rough: +15% a year for "carries on", +55% for "rates fall" and −40% for "recession" for Bitcoin, scaled by how much each coin tends to move compared with Bitcoin. They're in `js/sim.js` if you want to tune them.
