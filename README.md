# Factoring Portfolio Dashboard

Astro 6 dashboard for a local factoring investment portfolio. The app reads optional local JSON files from `src/data`, computes portfolio metrics in TypeScript, and renders a static single-page dashboard with Chart.js projections.

## Setup

Requirements:

- Node.js 22.12.0+ and npm 9.6.5+ (required by the current Astro 6 package)
- Optional Python environment with `pandas` and `openpyxl` for XLSX conversion
- Optional `supabase` Python package only when enabling the Supabase upload path

Install dependencies:

```sh
npm install
```

Create a local `.env` file when live USD/PEN rates are needed:

```env
CURRENCY_FREAKS_API_KEY=your_currency_freaks_key
```

If the key is absent or the provider fails, the app falls back to `DEFAULT_FX_RATE` in `src/lib/config.ts`.

## Commands

```sh
npm run dev      # local dev server, usually http://localhost:4321
npm run check    # Astro/TypeScript diagnostics
npm run build    # static production build into dist/
npm run preview  # preview the built static site
```

There are currently no automated unit tests.

## Data Refresh

The dashboard consumes these local files:

- `src/data/investmentDetails.json`
- `src/data/earningsPEN.json`
- `src/data/earningsUSD.json`
- `src/data/movementsPEN.json`
- `src/data/movementsUSD.json`

`src/data/script.py` converts the local XLSX exports into those JSON files. Run it from `src/data`:

```sh
python script.py
```

On Windows, `src/data/run.bat` runs the same script from the correct directory.

The Supabase upload path is disabled by default. To enable it intentionally, provide environment variables:

```env
UPLOAD_TO_SUPABASE=1
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

Remote table clearing is separately gated:

```env
CLEAR_SUPABASE_TABLES=1
```

Do not enable remote upload or table clearing unless the Supabase project, RLS policies, and backup state have been verified.

If a Supabase key was ever committed or shared, rotate it in Supabase and verify RLS before enabling uploads again. Removing a key from the current tree does not remove it from Git history.

## Privacy And Deployment

Portfolio datasets contain private financial data and client identifiers. Local JSON/XLSX files are ignored by git and should not be committed.

The npm lockfiles are also ignored by this repo. Use `package.json` as the tracked dependency manifest, and expect a local ignored `package-lock.json` after `npm install`.

Production builds hide portfolio totals, projections, and factoring contracts by default so the static HTML does not serialize private financial data. Only set this for a private, access-controlled deployment:

```env
PUBLIC_EXPOSE_PORTFOLIO_DATA=true
```

Without that opt-in, the dashboard renders privacy notices instead of private figures. This also lets a clean clone build without the private local datasets.

The rationale is captured in `docs/decisions/ADR-001-static-dashboard-private-data-gate.md`.

## Architecture

- `src/pages/index.astro` composes the dashboard.
- `src/lib/dataService.ts` loads optional local JSON, fetches FX, and builds report metrics.
- `src/lib/portfolioUtils.ts` contains portfolio math helpers.
- `src/components/ChartContainer.astro` passes projection data to `src/scripts/chart.ts`.
- `src/components/FactoringCard.astro` gates private contract serialization and loads `src/scripts/factoring.ts` only when detailed contracts are exposed.
- `src/styles/global.css` and component styles define the Tailwind-based dark UI.
- Tailwind runs through PostCSS (`postcss.config.js`); `astro.config.mjs` intentionally has no Tailwind integration.
- `.npmrc` sets `ignore-scripts=true` and `min-release-age=1` for safer installs.

## Quality Gate

For documentation or cleanup changes, run:

```sh
git diff --check
git status --short
```

For app or code changes, also run:

```sh
npm run check
npm run build
git status --short
```

For dependency or security-sensitive changes, also run:

```sh
npm audit --omit=dev
```

Temporary files commonly produced during local work:

```powershell
Remove-Item devserver*.log,tmp_dev*.log,tmpclaude-*-cwd,nul -ErrorAction SilentlyContinue
```

Generated local directories:

- `.astro/` contains Astro-generated types/content cache and is ignored by git.
- `dist/` contains build output and is ignored by git.
