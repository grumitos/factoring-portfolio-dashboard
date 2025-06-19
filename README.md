# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/minimal)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/minimal)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/minimal/devcontainer.json)

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Portfolio Calculation Utilities

The library in `src/lib/portfolioUtils.ts` provides helpers for computing an
annualized return across multiple investments.

- `calculateAnnualizedPortfolioRate(investments, earnings, fxRate, includePaid = true)` –
  incluye por defecto contratos `cobrado` y `pendiente`, omitiendo solo aquellos
  con estado `rechazado`. Pasa `false` para excluir los pagados.
- `calculateAnnualizedPortfolioRateAll` – alias para llamar a `calculateAnnualizedPortfolioRate`
  asegurando `includePaid` en `true`.

Both functions return the weighted annualized rate as a percentage.

## Environment Variables

Create a `.env` file with the following variables:

- `CURRENCY_FREAKS_API_KEY` – API key for currency rates
- `SUPABASE_URL` – URL of your Supabase instance
- `SUPABASE_ANON_KEY` – public anon key for Supabase access

Install `supabase-py` if you plan to use the Python uploader:

```sh
pip install supabase
```

## Data Migration

The `scripts/migrateData.ts` script uploads the JSON files in `src/data/` to
Supabase. Ensure the tables `investments`, `earnings` and `movements` exist in
your project, then run:

```sh
npx ts-node scripts/migrateData.ts
```

You can also run the Python helper to convert the original spreadsheets and
upload the JSON data:

```sh
python src/data/script.py
```

### Table Structure

Create the following tables in Supabase (SQL):

```sql
create table investments (
  "Fecha" date,
  "Hora" time,
  "Cliente" text,
  "RUC" bigint,
  "Codigo de subasta" text primary key,
  "Riesgo" text,
  "Inversion" numeric,
  "Moneda" text,
  "Retorno mensual (%)" numeric,
  "Fecha de cierre de subasta" text,
  "Fecha de pago" timestamp,
  "Estado" text,
  "fxRate" numeric
);

create table earnings (
  "Fecha" timestamp,
  "Código de subasta" text,
  "Movimiento" text,
  "Monto" numeric,
  "Moneda" text,
  "fxRate" numeric
);

create table movements (
  "Fecha" timestamp,
  "Movimiento" text,
  "Monto" numeric,
  "Moneda" text,
  "fxRate" numeric
);
```
