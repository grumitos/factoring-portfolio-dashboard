# AGENTS Instructions for Invest Project

## Project Overview

This repo contains a small Astro 5 web application built with TypeScript and Tailwind CSS. It calculates investment portfolio metrics and fetches data from a Supabase backend. Utilities for computing annualized returns and generating portfolio reports are under `src/lib/`.

The application reads data from Supabase tables `investments`, `earnings` and `movements`. Sample JSON and XLSX datasets for local testing live in `src/data/` along with a helper `script.py` that can convert Excel files to JSON and sync them to Supabase.

## Getting Started

1. Install dependencies with `npm install` (requires Node.js 18+).
2. Set up a `.env` file with:
   - `CURRENCY_FREAKS_API_KEY`: API key for currency conversion
   - `SUPABASE_URL`: URL of your Supabase instance
   - `SUPABASE_ANON_KEY`: public anon key
3. Run `npm run dev` to start the dev server on `localhost:4321`.
4. Build for production with `npm run build` and preview with `npm run preview`.

There are no automated test scripts.

## Folder Structure

```
src/
  assets/           # static images
  components/       # Astro UI components
  data/             # demo datasets and Supabase sync script
  layouts/
  lib/              # portfolio utilities and services
  pages/
  styles/
public/             # static assets served directly
```

## Notes for Agents

- Prefer TypeScript when adding new utilities or server logic.
- The codebase does not enforce linting; keep formatting consistent with existing files.
- Do not commit `.env` files or personal datasets. JSON/XLSX files under `src/data` are already ignored by `.gitignore`.
- When updating dependencies, edit `package.json` and `package-lock.json` together.

