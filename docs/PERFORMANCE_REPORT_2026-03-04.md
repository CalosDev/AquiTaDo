# Performance Report - 2026-03-04

## Scope
- Objective: validate navigation fluency and API responsiveness after recent frontend optimizations.
- Environment measured:
  - Web: `https://aquitado.vercel.app`
  - API: `https://aquitado.onrender.com`
- Method:
  - 1 warmup hit + 7 measured hits per endpoint.
  - Script: `pnpm perf:prod`
  - Raw JSON report: `docs/perf-production-2026-03-04.json`

## Production Latency Results

| Endpoint | Warmup | p50 | p95 | Avg | Max | Status |
|---|---:|---:|---:|---:|---:|---|
| WEB `/` | 276 ms | 60 ms | 79 ms | 64 ms | 82 ms | 200x7 |
| WEB `/businesses` | 58 ms | 57 ms | 81 ms | 62 ms | 89 ms | 200x7 |
| API `/api/health` | 211 ms | 136 ms | 155 ms | 141 ms | 158 ms | 200x7 |
| API `/api/health/ready` | 194 ms | 196 ms | 210 ms | 199 ms | 212 ms | 200x7 |
| API `/api/categories` | 211 ms | 200 ms | 218 ms | 203 ms | 220 ms | 200x7 |
| API `/api/provinces` | 201 ms | 199 ms | 211 ms | 199 ms | 211 ms | 200x7 |
| API `/api/businesses?limit=12` | 596 ms | 325 ms | 348 ms | 326 ms | 355 ms | 200x7 |
| API `/api/search/businesses?q=tecnologia&limit=6` | 617 ms | 322 ms | 333 ms | 323 ms | 336 ms | 200x7 |

## Build Artifacts Snapshot (Web)

Top JS/CSS chunks from `apps/web/dist/assets`:

- `index-BXnP6aZC.js`: 335.7 KB
- `index-C9H2MyEa.css`: 59.9 KB
- `DashboardBusiness-DDKD6kWj.js`: 54.1 KB
- `BusinessDetails-BzVcLL5d.js`: 32.1 KB
- `AdminDashboard-Cf1tFmMx.js`: 29.6 KB

## Technical Reading

- Navigation routes are now healthy on the web edge (`~60 ms p50`).
- Main UX bottleneck remains API list/search endpoints (`~320-330 ms p50`).
- Post-optimization, dashboard tab switching should feel faster because heavy tabs now preload and avoid repeated refetch on every tab revisit.
- Historical probes showed potential cold-start spikes on Render when idle. This can still affect first user after inactivity.

## Priority Plan (Next Iteration)

1. **P0 - Cold start mitigation**
   - Move API to always-on plan or add synthetic keep-warm checks.
   - Success target: first API hit < 1.5 s after inactivity windows.

2. **P1 - Faster business listing/search**
   - Add Redis cache-aside for `/api/businesses` and `/api/search/businesses`.
   - Add/verify DB indexes for category/province/feature filters.
   - Success target: list/search p50 < 220 ms.

3. **P1 - Frontend main bundle trim**
   - Reduce `index-*.js` by moving non-critical utilities/providers to lazy boundaries.
   - Success target: entry JS < 280 KB.

4. **P2 - Real-user monitoring**
   - Track INP/LCP/CLS from real sessions (web-vitals beacon endpoint).
   - Success target: INP p75 < 200 ms, LCP p75 < 2.5 s.

## How to re-run

```bash
pnpm perf:prod
```

Optional custom targets/output:

```bash
PERF_WEB_BASE_URL=https://your-web.example.com \
PERF_API_BASE_URL=https://your-api.example.com \
PERF_OUTPUT_JSON=docs/perf-custom.json \
pnpm perf:prod
```
