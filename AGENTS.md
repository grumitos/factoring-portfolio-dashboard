# AGENTS Instructions for Factoring Portfolio Dashboard

## Project Overview

Astro 6 web application (TypeScript + Tailwind CSS via PostCSS) that tracks a factoring investment portfolio. It reads optional investment data from local JSON files under `src/data/`, computes annualized returns / projected gains, and renders a single-page dashboard with Chart.js projections.

A helper Python script (`src/data/script.py`) converts local Excel files to the JSON files consumed by the app.

## Getting Started

1. Install dependencies with `npm install` (requires Node.js 22.12.0+ and npm 9.6.5+ for the current Astro 6 package).
2. Set up a `.env` file with:
   - `CURRENCY_FREAKS_API_KEY` -- API key for live USD/PEN rate (Currency Freaks). Optional; falls back to a default rate.
3. `npm run dev` -- dev server on `localhost:4321`.
4. `npm run check` -- Astro/TypeScript diagnostics.
5. `npm run build` -- static build to `dist/`.
6. `npm run preview` -- preview the built site locally.

There are no automated unit/integration tests; use `npm run check` and `npm run build` as the cheap repo gates.

## Folder Structure

```
src/
  assets/           # static images (piggy.svg)
  components/       # Astro UI components (SummaryCard, ChartContainer, FactoringCard, ...)
  data/             # tracked converter/schema/run.bat plus ignored local JSON/XLSX datasets
  layouts/          # Layout.astro (HTML shell)
  lib/
    config.ts       # constants (GOAL, EXTERNAL_CAPITAL, MOVEMENT_TYPES, slider defaults)
    dataService.ts  # data layer: loads optional JSON, fetches FX rate, caches at module level
    fxService.ts    # live USD/PEN rate via Currency Freaks (in-memory cache)
    portfolioUtils.ts  # pure math: annualized rate, toPen, monthsBetween
  pages/
    index.astro     # main dashboard page
  scripts/
    chart.ts        # client-side Chart.js projection (imported as module by ChartContainer)
    factoring.ts    # client-side factoring table logic (imported by FactoringCard)
  styles/
    global.css      # base reset, shared component classes (card, card-header, svg-icon, etc.)
public/             # static assets served directly
```

## Architecture Notes

- **Data flow**: `dataService.ts` discovers optional local JSON files (`investmentDetails.json`, `earningsPEN/USD.json`, `movementsPEN/USD.json`) with `import.meta.glob`, maps them into domain types, fetches the live FX rate only when portfolio metrics or factoring contracts are requested, caches the result at module level, and exposes `getPortfolioReport()`, `getReportMetrics()`, `getFactoringMetrics()`, and `getTimeToGoalWithInjection()`.
- **Private data gate**: production builds hide totals, projections, and factoring contracts unless `PUBLIC_EXPOSE_PORTFOLIO_DATA=true`. This keeps static HTML from serializing private portfolio data by default and allows clean clones to build without private datasets. See `docs/decisions/ADR-001-static-dashboard-private-data-gate.md`.
- **Client scripts**: Astro components pass private data to client scripts via `<script type="application/json">` elements only when the private data gate is enabled. The scripts live in `src/scripts/` and are bundled by Vite as ES modules (no CDN scripts).
- **Shared CSS**: Global base styles and reusable classes (`.card`, `.card-header`, `.header-left`, `.svg-icon`, `.flex-between`, `.flex`) are in `src/styles/global.css`. Component-scoped styles stay in each `.astro` file.
- **Currencies**: All values are tracked in PEN and USD. Conversion uses the live FX rate from `fxService.ts`, falling back to `DEFAULT_FX_RATE` (3.7) from `config.ts`.
- **Tailwind**: Tailwind runs through PostCSS (`postcss.config.js`). Do not re-add `@astrojs/tailwind`; the adapter is not required for the current Astro 6 setup.
- **Supabase**: There is no app runtime dependency on Supabase. `src/data/script.py` can upload converted records only when `UPLOAD_TO_SUPABASE=1` and `SUPABASE_URL` / `SUPABASE_ANON_KEY` are set; `CLEAR_SUPABASE_TABLES=1` is a separate destructive gate.

## Notes for Agents

- Prefer TypeScript for new utilities or server logic.
- No linter is configured; keep formatting consistent with existing files.
- Do not commit `.env` files or personal datasets. JSON/XLSX files under `src/data` are already in `.gitignore`.
- If a Supabase key was committed or shared, rotate it in Supabase and verify RLS; removing it from the current tree does not remove it from Git history.
- `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock` are gitignored; only `package.json` is tracked for dependencies. A local ignored lockfile may exist after install.
- `.npmrc` sets `ignore-scripts=true` and `min-release-age=1`; do not relax those install safeguards without a specific reason.
- `.astro/` and `dist/` are generated and ignored. Do not rely on their contents as source; empty generated subdirectories can be removed during cleanup.
- Client-side scripts go in `src/scripts/` as `.ts` files, imported from Astro components via `<script src="...">`.
- Computation helpers in `dataService.ts` are pure (take data, return results). `fetchAllData()` is the only data-service path that touches the network, through the FX rate fetch.

## Open Improvement Candidates

1. Add minimal automated tests for pure math/data functions in `src/lib/portfolioUtils.ts` and `src/lib/dataService.ts` to reduce regression risk in return calculations.
2. Consider a single `npm run quality` script if repeated handoffs need one command. The underlying checks already exist as `npm run check` and `npm run build`, and the README has the current runbook.
3. Consider an internal FX-rate observability note (last successful fetch timestamp and fallback usage) to make conversion behavior easier to debug.

## Temporary File Hygiene

- Common temporary files in this repo root:
  - `devserver*.log`
  - `tmp_dev*.log`
  - `tmpclaude-*-cwd`
  - `nul`
- Safe PowerShell cleanup command:
  - `Remove-Item devserver*.log,tmp_dev*.log,tmpclaude-*-cwd,nul -ErrorAction SilentlyContinue`
- Before handing off work, verify cleanliness with:
  - `git diff --check`
  - `git status --short`
