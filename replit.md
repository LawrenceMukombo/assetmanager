# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## NPAMS — National Public Asset Management System (Papua New Guinea)

### Architecture
- **Frontend**: React + Vite (`artifacts/npams-web`) at preview path `/`
- **API**: Express 5 (`artifacts/api-server`) at `/api/v1`
- **Auth**: Local JWT (bcryptjs + jsonwebtoken). Demo password: `Admin1234!`
- **DB seed**: `pnpm --filter @workspace/scripts run seed`

### Key Demo Accounts
- `superadmin@npams.gov.pg` — Super Admin (national scope)
- `morobe.admin@npams.gov.pg` — Provincial Admin (Morobe only)

### PNG Regions (in DB, `provinces.region` field)
- **Southern**: CP, GU, MB, NCD, NO, WS
- **Highlands**: CH, EH, EN, HE, JI, SH, WHP
- **Momase**: ES, MD, MO, SA
- **Islands**: AB, ENB, MA, NI, WNB

### Location Filter Cascade (Region → Province → District → Facility)
- **National dashboard**: `LocationFilterBar` in `dashboard.tsx` with `showRegionProvince=true`. Sends `region`, `province_id`, `district_id`, `facility_id` to `/api/v1/dashboard/national`.
- **Provincial dashboard**: `LocationFilterBar` with `showRegionProvince=false`, `fixedProvinceId` set. Sends `district_id`, `facility_id` to `/api/v1/dashboard/provincial`.
- **Reports page**: Inline location scope in `reports.tsx`, appends `locationParams` to all API calls.
- **Assets page**: Location scope state (`regionName`, `provinceId`, `districtId`, `facilityId`) with client-side province filtering by region.
- **Regions API**: `GET /api/v1/locations/regions` — returns distinct regions with province lists.

### Dashboard Cross-filtering
- Click any chart segment or KPI card to activate a filter. Click again to deselect.
- Filter chips show in a strip (`FilterStrip`). Click chip or "Clear all" to remove.
- Charts exclude their own dimension from cross-filtering (e.g., status chart doesn't filter by status).

### Router
- Uses `wouter` — use `useLocation()` and `setLocation(url)`, NOT react-router-dom.

### Important API Notes
- `SelectItem value=""` causes runtime error in Radix UI — always use sentinel `"_none"`
- Assets response shape: `{ data: { items: AssetItem[], pagination: {...} } }`

### ICA (Immigration & Citizenship Authority) Modules
- **Stock & Inventory** (`/stock`, `/stock/:id`): Consumables (passport booklets, visa stickers, citizenship paper, toner, uniforms, vehicle spares). Backend `routes/stock.ts` exposes `GET /v1/stock` (search + `low_stock=true` filter), `POST /v1/stock` (admin), `GET /v1/stock/:id` (with movements), `PATCH /v1/stock/:id`, `POST /v1/stock/:id/movements` (receive/issue/transfer/adjust — atomic txn updates `on_hand_quantity`), `GET /v1/stock/:id/movements`. Schema: `lib/db/src/schema/stock.ts` (`stock_items`, `stock_movements`, `stock_movement_type` enum). Seed: `seedAgencyStock()` in `lib/autoSeed.ts` adds 13 PNGICA items idempotently.
- **Asset Lifecycle Timeline** (asset detail → "Lifecycle" tab): `GET /v1/assets/:id/lifecycle` returns chronological activity_log events (CREATE, TRANSFER, STATUS_*, MAINTENANCE_*). PATCH on assets now logs `STATUS_<NEW>` events with `metadata.fromStatus/toStatus`. Transfer endpoint logs full `from`/`to` location metadata.
- **System Status** (`/system-status`, Super Admin / Agency Admin only): `GET /v1/system/status` and `POST /v1/system/health-check` (both gated by an explicit `roleName` check against `Super Admin` / `Agency Admin`) return API uptime, DB connectivity + latency, environment, backup posture (Replit Managed PostgreSQL — PITR + 7-day snapshots), data retention policy, DR plan (RPO 5min / RTO 2h, procedure + escalation contacts), monitoring endpoints. UI: `pages/system-status.tsx` with 30s auto-refresh.

### Roles
- `ADMIN_ROLES` (in `App.tsx`): Super Admin, Provincial Admin, National Asset Controller, Agency Admin — full create/edit/admin pages access.
- `OFFICER_ROLES` adds Provincial Asset Officer — can record stock movements and asset operational actions but not configure inventory items.
- Backend `requireAssetAdmin` middleware gates writes; system-status checks `roleName` against admin list explicitly.
