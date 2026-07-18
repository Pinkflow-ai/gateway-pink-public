# Publishing this repo

This file records what's safe to publish publicly and what is intentionally
absent. It's here so anyone reviewing the "we don't log payloads" claim can see
the boundary clearly.

## Safe to publish — and the whole point

| Path | Why it's fine |
|---|---|
| `src/routes/**` | The route handlers. Reading them is the proof — there's no `INSERT`, no `logger.info(req.body)`, no analytics emit carrying the payload. |
| `src/providers/**` | The provider implementations. Compute ones are pure functions; data ones map upstream output into our own response shape. |
| `src/auth/**` | Bearer parsing, one-way key digesting, and the parameterized production lookup adapter. It contains no keys or pepper. |
| `src/billing/**` | Runtime manifest validation, integer metered-cost math, development meter, and parameterized production adapters. It contains no customer data, schema, or private cost basis. |
| `src/ratelimit/**` | Local and Redis rate-limit algorithms. Redis URLs and credentials remain environment-only. |
| `config/pricing.manifest.json` | Generated customer prices and the model-rate snapshot required for safe preflight. Flat upstream costs and margins are not included. |
| `src/policy/**` | Storage-policy tags and the `/v1/storage-policy` endpoint. |
| `src/log.ts` | The logger, including the redact paths. This is the §8.4 mechanism, visible. |
| `tests/guard-no-payload.test.ts` | The guard test. It's the enforcement, not just a claim. |
| `tests/**` | Unit and fixture tests. No real secrets, no customer data. |
| `observability/**` | Grafana/Promtail/Loki config. No credentials beyond the default `admin/admin` dev login. |
| `Dockerfile`, `docker-compose.yml` | Build and run config. |

## Intentionally absent

These live in the **private** repo, not here:

- **The production key store and schema.** This repo shows how a digest is
  queried, but real key rows, the pepper, migrations, and revocation data remain
  private/environment-owned.
- **The durable credit ledger schema.** The public adapter exposes only the
  parameterized function contract. Tables, migrations, customer balances, and
  upstream flat-cost economics stay private.
- **The full catalog strategy.** The public manifest contains customer-facing
  runtime prices, not internal flat-route cost basis or pack strategy.
- **Customer / usage data.** None is present. The dev meter holds only an
  in-memory balance and reservations; it writes no events or payloads.
- **Production secrets.** No real keys, tokens, or upstream credentials are
  committed. `.env` is gitignored; `.env.example` carries only defaults.

## Before each publish

1. Confirm `git status` shows no `.env` file staged.
2. Confirm no compute route/provider imports the database or Redis adapters —
   the guard test enforces this boundary, but re-running `npm test` before
   tagging is cheap.
3. Confirm no fixture or example contains real customer data. Fixtures are
   hand-written samples; if one was pasted from a real response, rewrite it.
