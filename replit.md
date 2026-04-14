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
