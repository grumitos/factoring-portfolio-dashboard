# AGENTS Instructions for Factoring Portfolio Dashboard

## Project Overview

Astro 5 web application (TypeScript + Tailwind CSS) that tracks a factoring investment portfolio. It reads investment data from local JSON files under `src/data/`, computes annualized returns / projected gains, and renders a single-page dashboard with Chart.js projections.

A helper Python script (`src/data/script.py`) converts local Excel files to the JSON files consumed by the app.

## Getting Started

1. Install dependencies with `npm install` (requires Node.js 18+).
2. Set up a `.env` file with:
   - `CURRENCY_FREAKS_API_KEY` -- API key for live USD/PEN rate (Currency Freaks). Optional; falls back to a default rate.
3. `npm run dev` -- dev server on `localhost:4321`.
4. `npm run build` -- static build to `dist/`.
5. `npm run preview` -- preview the built site locally.

There are no automated tests.

## Folder Structure

```
src/
  assets/           # static images (piggy.svg)
  components/       # Astro UI components (SummaryCard, ChartContainer, FactoringCard, ...)
  data/             # investment datasets (JSON) and XLSX-to-JSON conversion script
  layouts/          # Layout.astro (HTML shell)
  lib/
    config.ts       # constants (GOAL, EXTERNAL_CAPITAL, MOVEMENT_TYPES, slider defaults)
    dataService.ts  # data layer: imports JSON, fetches FX rate, caches at module level
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

- **Data flow**: `dataService.ts` imports local JSON files (`investmentDetails.json`, `earningsPEN/USD.json`, `movementsPEN/USD.json`) at build time, fetches the live FX rate, caches the result at module level, and exposes `getPortfolioReport()`, `getReportMetrics()`, `getFactoringMetrics()`, and `getTimeToGoalWithInjection()`.
- **Client scripts**: Astro components pass data to client scripts via `<script type="application/json">` elements. The scripts live in `src/scripts/` and are bundled by Vite as ES modules (no CDN scripts).
- **Shared CSS**: Global base styles and reusable classes (`.card`, `.card-header`, `.header-left`, `.svg-icon`, `.flex-between`, `.flex`) are in `src/styles/global.css`. Component-scoped styles stay in each `.astro` file.
- **Currencies**: All values are tracked in PEN and USD. Conversion uses the live FX rate from `fxService.ts`, falling back to `DEFAULT_FX_RATE` (3.7) from `config.ts`.

## Notes for Agents

- Prefer TypeScript for new utilities or server logic.
- No linter is configured; keep formatting consistent with existing files.
- Do not commit `.env` files or personal datasets. JSON/XLSX files under `src/data` are already in `.gitignore`.
- `package-lock.json` is gitignored; only `package.json` is tracked.
- Client-side scripts go in `src/scripts/` as `.ts` files, imported from Astro components via `<script src="...">`.
- Computation functions in `dataService.ts` are pure (take data, return results). Only `fetchAllData()` touches the network (FX rate).

## Recommended Improvement Plan (Priority Order)

1. Replace the starter README with project-specific docs (setup, data refresh flow, architecture, and deployment notes). The current README still includes Astro boilerplate and outdated Supabase environment variables.
2. Add a quality gate script and runbook:
   - `npm run build` for production integrity
   - `npm run astro -- check` (or `astro check`) for type/content checks
3. Add minimal automated tests for pure math/data functions in `src/lib/portfolioUtils.ts` and `src/lib/dataService.ts` to reduce regression risk in return calculations.
4. Add a repeatable cleanup workflow for generated local artifacts (`dist/`, `.astro/`, temporary logs/files) so the repository root stays clean during iterative agent runs.
5. Consider an internal FX-rate observability note (last successful fetch timestamp and fallback usage) to make conversion behavior easier to debug.

## Temporary File Hygiene

- Common temporary files in this repo root:
  - `devserver*.log`
  - `tmp_dev*.log`
  - `tmpclaude-*-cwd`
  - `nul`
- Safe PowerShell cleanup command:
  - `Remove-Item devserver*.log,tmp_dev*.log,tmpclaude-*-cwd,nul -ErrorAction SilentlyContinue`
- Before handing off work, verify cleanliness with:
  - `git status --short`
