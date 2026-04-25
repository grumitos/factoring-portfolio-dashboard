# ADR-001: Keep Static Dashboard With Private Data Gate

## Status
Accepted

## Date
2026-04-25

## Context
The dashboard is an Astro static site for a personal factoring portfolio. Its local JSON and XLSX datasets can include private financial details, client identifiers, RUC values, investments, states, and gains.

Before this decision, production builds could serialize detailed portfolio data into `dist/index.html` through inline JSON scripts used by the chart and factoring table. That made a static deployment easy, but it also meant anyone with browser access to the generated page could inspect the underlying dataset.

The project still benefits from static output:

- simple local development and preview;
- no server runtime needed for the current dashboard;
- deterministic builds from local data;
- easy hosting for private, access-controlled environments.

## Decision
Keep the app as a static Astro dashboard, but hide private portfolio totals, chart data, and factoring contract details by default in production builds.

Private data is exposed only when one of these conditions is true:

- the app is running in development mode;
- `PUBLIC_EXPOSE_PORTFOLIO_DATA=true` is set intentionally for a private, access-controlled deployment.

Local datasets under `src/data` are optional at build time and ignored by git. Clean clones must be able to build without private JSON or XLSX files.

## Alternatives Considered

### Always serialize local data

- Pros: simplest implementation and full dashboard available in any static build.
- Cons: leaks private financial data into generated HTML and client-side scripts.
- Rejected because privacy is more important than convenience for public or accidentally shared builds.

### Move all data behind a backend API

- Pros: stronger server-side access control and no static data serialization.
- Cons: larger architectural change, new hosting/runtime surface, and unnecessary complexity for the current personal dashboard.
- Deferred until the project needs authenticated multi-device or multi-user access.

### Remove detailed contract UI entirely

- Pros: eliminates the most sensitive browser payload.
- Cons: removes core local functionality from the dashboard.
- Rejected because the detailed view is useful during local/private operation.

## Consequences

- Production builds are private-by-default but less informative unless explicitly opted in.
- The app must keep privacy-state UI for hidden totals, projections, and contracts.
- Browser validation should check that default production `dist/index.html` does not contain private data scripts or obvious client identifiers.
- Any deployment that sets `PUBLIC_EXPOSE_PORTFOLIO_DATA=true` must be treated as private and access-controlled.
- If Supabase upload is re-enabled, credentials must come from environment variables and RLS must be verified before use.
