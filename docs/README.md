# NPAMS — Technical Documentation

**National Public Asset Management System** for the Government of Papua
New Guinea. NPAMS is a multi‑tenant web platform for tracking, auditing
and maintaining public assets and secure consumable stock across all 22
PNG provinces, with cryptographically‑signed procurement workflows and a
live GIS view of the national portfolio.

> Sponsor‑facing collateral lives in `proposals/ICSA-NPAMS-Proposal.pdf`.

---

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Repository layout](#2-repository-layout)
3. [Tech stack](#3-tech-stack)
4. [Running the project](#4-running-the-project)
5. [Environment variables](#5-environment-variables)
6. [Database schema](#6-database-schema)
7. [Authentication, RBAC & multi‑tenancy](#7-authentication-rbac--multi-tenancy)
8. [HMAC‑SHA256 purchase‑request signatures](#8-hmac-sha256-purchase-request-signatures)
9. [Backend — API reference](#9-backend--api-reference)
10. [Frontend — pages & features](#10-frontend--pages--features)
11. [Auto‑seeding & demo data](#11-auto-seeding--demo-data)
12. [Object storage](#12-object-storage)
13. [Build & deployment](#13-build--deployment)
14. [Operations runbook](#14-operations-runbook)
15. [Glossary](#15-glossary)

---

## 1. Architecture at a glance

```
                       ┌─────────────────────────────┐
                       │   Browser (React SPA)       │
                       │   artifacts/npams-web       │
                       └──────────────┬──────────────┘
                                      │ HTTPS / JSON
                                      ▼
              ┌────────────────────────────────────────────┐
              │  Express API + static SPA host             │
              │  artifacts/api-server  (PORT, default 8080)│
              │                                            │
              │  /api/v1/*    → REST endpoints             │
              │  /api/healthz → liveness                   │
              │  /storage/*   → signed-URL uploads &       │
              │                 public/private object proxy │
              │  /            → built React bundle         │
              └──────┬───────────────────────┬─────────────┘
                     │                       │
            Drizzle ORM                  Google Cloud Storage
                     │                       │
                     ▼                       ▼
            ┌────────────────┐      ┌──────────────────┐
            │  PostgreSQL    │      │  Asset photos /  │
            │                │      │  documents /     │
            │                │      │  branding logos  │
            └────────────────┘      └──────────────────┘
```

In production the API server is the single deployable unit — it serves
the JSON API at `/api/*` and the compiled React bundle as static files.
The Component Preview Server (`artifacts/mockup-sandbox`) is a
development‑only artifact for previewing UI variants on the canvas.

---

## 2. Repository layout

This is a **pnpm workspace monorepo**.

```
.
├── artifacts/                    # Deployable units
│   ├── api-server/               # Express API + static host
│   ├── npams-web/                # React + Vite SPA (web client)
│   └── mockup-sandbox/           # Dev-only component preview server
├── lib/                          # Shared workspace libraries
│   ├── db/                       # Drizzle ORM schema + connection
│   │   └── src/schema/           # One file per schema domain
│   ├── api-spec/                 # OpenAPI YAML + Orval codegen config
│   ├── api-zod/                  # Zod validators generated from OpenAPI
│   ├── api-client-react/         # TanStack Query hooks generated from OpenAPI
│   └── object-storage-web/       # Shared upload widgets
├── proposals/                    # Sponsor proposal sources
├── scripts/                      # Workspace helpers (post-merge.sh, …)
├── docs/                         # ← this documentation
├── pnpm-workspace.yaml
└── package.json
```

### 2.1 Artifact registry

| Artifact         | Kind   | Path                       | Notes                                     |
| ---------------- | ------ | -------------------------- | ----------------------------------------- |
| `npams-web`      | web    | `artifacts/npams-web`      | React 19 + Vite SPA                        |
| `api-server`     | api    | `artifacts/api-server`     | Express 5 API; serves built SPA in prod    |
| `mockup-sandbox` | design | `artifacts/mockup-sandbox` | Dev‑only canvas preview server             |

### 2.2 Shared libraries (`lib/`)

| Library                  | Purpose                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `lib/db`                 | Drizzle schema (split per domain under `lib/db/src/schema/*.ts`), pool connection, `drizzle.config.ts`.     |
| `lib/api-spec`           | `openapi.yaml` + Orval config — the contract between server and client.                                     |
| `lib/api-zod`            | Zod schemas generated from the OpenAPI spec; used by Express handlers for request validation.               |
| `lib/api-client-react`   | TanStack Query hooks generated from the OpenAPI spec; consumed by every page in `npams-web`.                |
| `lib/object-storage-web` | React upload widgets that talk to the API server's `/storage/*` endpoints and Google Cloud Storage.  |

---

## 3. Tech stack

**Frontend** — React 19, Vite 6, TypeScript 5.9, Tailwind CSS 4, Radix
UI primitives, Framer Motion, Lucide icons, Recharts, **Wouter**
(routing), TanStack Query, React Hook Form + Zod, Leaflet (maps).

**Backend** — Node.js (≥ 20), Express 5, TypeScript, Pino (structured
logs), `bcryptjs` (password hashing), `jsonwebtoken` (JWT), Drizzle
ORM, `pg` driver.

**Database** — PostgreSQL 15+.

**Object storage** — Google Cloud Storage under
the hood) addressed via `PUBLIC_OBJECT_SEARCH_PATHS` and
`PRIVATE_OBJECT_DIR`.

**Build** — pnpm workspaces, ESBuild for the API server bundle, Vite
for the SPA, TypeScript project references for shared libraries.

---

## 4. Running the project

```bash
# 1. Install everything (pnpm enforced — preinstall hook blocks npm/yarn)
pnpm install

# 2. Provision the database schema
pnpm --filter @workspace/db drizzle-kit push    # or `migrate` in CI

# 3. Start workflows (each artifact has its own dev server)
PORT=8080 pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/npams-web run dev
pnpm --filter @workspace/mockup-sandbox run dev
```

Those three commands can be wired into your local or hosted workflows
`artifacts/api-server: API Server`, `artifacts/npams-web: web` and
`artifacts/mockup-sandbox: Component Preview Server` and start
automatically.

### 4.1 Useful root scripts

| Script              | What it does                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- |
| `pnpm build`        | Runs `typecheck` then a recursive build across every workspace.                        |
| `pnpm typecheck`    | Builds shared libs first, then runs `tsc --noEmit` in every artifact.                  |
| `scripts/post-merge.sh` | Runs after task agents merge — applies any drizzle schema diff and rebuilds shared libs. |

---

## 5. Environment variables

Set in your hosting provider's secret manager (or `.env` for local). Fail‑fast values throw on
boot when missing.

| Variable                       | Required | Description                                                                                                         |
| ------------------------------ | :------: | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 |    ✓     | PostgreSQL connection string.                                                                                       |
| `PORT`                         |    ✓     | Port the Express server binds to. The server throws `"PORT environment variable is required"` if missing.            |
| `JWT_SECRET`                   |   ✓ (prod) | HMAC secret for access tokens **and** purchase‑request signatures. Required in production; in dev the server falls back to `"npams-dev-secret-do-not-use-in-prod"`. |
| `SESSION_SECRET`               |          | Secondary fallback for the purchase‑request signature secret if `JWT_SECRET` is unset (dev only).                   |
| `NODE_ENV`                     |          | `development` / `production`. Controls log level, error verbosity and the `JWT_SECRET` enforcement.                  |
| `PUBLIC_OBJECT_SEARCH_PATHS`   |          | Comma‑separated paths in the object store served as public assets (e.g. agency logos).                              |
| `PRIVATE_OBJECT_DIR`           |          | Object‑store directory for private uploads (asset photos, signed documents).                                        |
| `LOCAL_OBJECT_DIR`             |          | Persistent local-filesystem directory for uploads. If neither local nor cloud storage is configured, development defaults to `data/objects`. |
| `LOG_LEVEL`                    |          | Pino log level — `debug`, `info`, `warn`, `error`.                                                                  |

Token lifetimes are **hard‑coded** today: access tokens 8 h, refresh
tokens 7 days. Change them by editing `artifacts/api-server/src/lib/auth.ts`
and the refresh handler in `routes/auth.ts`.

> **Never hard‑code or print `JWT_SECRET`.** It is the trust anchor for
> both session tokens and the cryptographic signatures on every approved
> purchase request.

---

## 6. Database schema

The schema lives in `lib/db/src/schema/`, split per domain. Each file
exports the Drizzle table plus inferred row types.

### 6.1 Identity & RBAC — `users.ts`, `roles.ts`

| Table             | Notable columns                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `users`           | `id`, `full_name`, `email` (unique), `password_hash` (bcrypt), `phone_number`, `department`, `job_title`, `gender`, `date_of_birth`, `active`, `last_login`. |
| `roles`           | `id`, `role_name` (unique), `description`, `scope_level` enum.                                                                     |
| `user_roles`      | M:N join `(user_id, role_id)`, unique together.                                                                                    |
| `user_scope`      | One row per user. Nullable FKs to `tenant_id`, `agency_id`, `province_id`, `district_id`, `facility_id`.                            |
| `refresh_tokens`  | SHA‑256 hash of the issued refresh token, `expires_at`, `revoked_at`.                                                              |

`scope_level` enum values: **`national`**, **`provincial`**, **`district`**,
**`facility`**, **`agency`**.

### 6.2 Geography & tenancy

| Table        | File             | Notes                                                                          |
| ------------ | ---------------- | ------------------------------------------------------------------------------ |
| `tenants`    | `tenants.ts`     | Top‑level government domain (e.g. PNG). Seeded with code `PNG`.                |
| `agencies`   | `agencies.ts`    | E.g. PNGICA, RPNGC, PNGCS, IRC. Carries `agency_code` and branding metadata.   |
| `provinces`  | `provinces.ts`   | All 22 PNG provinces with name and ISO code.                                   |
| `districts`  | `districts.ts`   | FK to `province_id`.                                                           |
| `facilities` | `facilities.ts`  | Border posts, offices, depots. FKs to `district_id`, `agency_id`.              |

### 6.3 Asset register — `assets.ts`

| Table              | Notable columns                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset_categories` | `id`, `category_name` (unique), `description`.                                                                                                                               |
| `assets`           | `id`, `asset_tag` (unique, e.g. `PNGICA-VEH-014`), `asset_name`, `category_id`, `serial_number`, `brand`, `model`, `purchase_date`, `purchase_cost`, `supplier`, `warranty_expiry`, `useful_life_years`, `depreciation_method`, `salvage_value`, `photo_url`, `notes`, `status`, `condition`, `province_id`, `agency_id`, `district_id`, `facility_id`, `assigned_to_user`, `created_by`, `deleted_at`. |
| `asset_transfers`  | History of location / custodian changes. From / to province, district, facility and user.                                                                                    |

`status` enum: `active` / `under_maintenance` / `missing` / `disposed`.
`condition` enum: `excellent` / `good` / `fair` / `poor`.
There is **no separate `qr_token` column** — public verification uses
the asset's `id`.

### 6.4 Stock & procurement — `stock.ts`

| Table                       | Notable columns                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stock_items`               | `item_code` (unique, e.g. `PNGICA-STK-013`), `item_name`, `unit_of_measure`, `on_hand_quantity`, `reorder_level`, scope FKs.                                                                                       |
| `stock_balances`            | Per‑facility on‑hand quantities and movement timestamps.                                                                                                                                                           |
| `stock_movements`           | Append‑only ledger: receipts, issues, transfers, adjustments.                                                                                                                                                      |
| `purchase_requests`         | `request_number` (`PR-YYYYMMDD-NNNN`), `stock_item_id`, `quantity`, `received_quantity`, `supplier`, `unit_cost`, `notes`, `rejected_reason`, `status` (draft / submitted / approved / rejected / received / closed), `approved_at`, `received_at`, `closed_at`, `required_by_date`, `requester`, `agency`, `province`, `facility`. |
| `purchase_request_events`   | **Tamper‑evident audit log.** `request_id`, `event_type`, `actor_user_id`, `actor_role`, `signed_name`, `signed_hash` (HMAC‑SHA256, see §8), `signed_at`, `reason`, `payload` (jsonb), `created_at`.               |

### 6.5 Operations

| Table                   | File                | Notes                                                                                                  |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `audit_sessions`        | `audit.ts`          | A scheduled physical verification campaign with scope filters and target date.                         |
| `audit_assignments`     | `audit.ts`          | Assets assigned to an officer under a session.                                                          |
| `audit_items`           | `audit.ts`          | Per‑asset verification record: condition observed, GPS coordinates, photo, exception notes.            |
| `maintenance_schedules` | `maintenance.ts`    | Scheduled / logged maintenance with cost, vendor, downtime window and status.                          |
| `notifications`         | `activity.ts`       | Per‑user inbox: low stock, pending approvals, audit completion, etc. `read_status` boolean.            |
| `activity_logs`         | `activity.ts`       | Append‑only system‑wide audit trail. `user_id`, `action_type`, `entity_type`, `entity_id`, `metadata`. |

---

## 7. Authentication, RBAC & multi‑tenancy

### 7.1 Login flow

1. `POST /api/v1/auth/login` with `{ email, password }`.
2. The handler in `artifacts/api-server/src/routes/auth.ts` looks up the
   user, verifies the password with `bcryptjs`, and returns:
   - `access_token` — JWT, 8 h TTL, signed with `JWT_SECRET`.
   - `refresh_token` — opaque random string; **only its SHA‑256 hash** is
     stored in `refresh_tokens` (7‑day TTL).
   - `user` — basic profile, roles and scope.
3. The SPA stores the access token in memory and persists the refresh
   token in `localStorage`. A TanStack Query interceptor calls
   `POST /api/v1/auth/refresh` on `401` to mint a new access token.
4. `GET /api/v1/auth/me` is the canonical "who am I" endpoint and is the
   first call the SPA makes after boot.

### 7.2 Role catalogue

Seeded by `artifacts/api-server/src/lib/autoSeed.ts`:

| Role                          | Scope        | Typical user                                |
| ----------------------------- | ------------ | ------------------------------------------- |
| Super Admin                   | `national`   | Platform operator                            |
| National Asset Controller     | `national`   | Treasury / DPM oversight                    |
| National Auditor              | `national`   | Auditor‑General office (read‑only)          |
| Provincial Admin              | `provincial` | Provincial administrator                    |
| Provincial Asset Officer      | `provincial` | Field officer in a province                 |
| Provincial Viewer             | `provincial` | Read‑only provincial role                   |
| Agency Admin                  | `agency`     | Tenant administrator (e.g. PNGICA Admin)    |

### 7.3 Scope enforcement

Helpers in `artifacts/api-server/src/lib/auth.ts`:

- `requireAuth(req, res, next)` — verifies the bearer JWT and attaches
  `req.user` (id, email, roles, scope).
- `requireRole(...names)` and convenience helpers `requireUserAdmin`,
  `requireAssetAdmin`, `requireStockAdmin`, `requireApprover`,
  `requireNational` — reject with `403` when none of the user's roles
  match.
- `enforceScopeFilter(req, res, next)` — middleware that attaches a
  Drizzle SQL fragment to `req.scope` restricting subsequent queries to
  rows the caller is allowed to see.

National roles see everything. Agency roles see all rows for one
`agency_id` across provinces. Provincial roles see all rows for one
`province_id` across agencies present in that province. District /
facility scopes drill further down.

---

## 8. HMAC‑SHA256 purchase‑request signatures

Implemented in `artifacts/api-server/src/routes/purchase-requests.ts`.
Every state transition (`submitted`, `approved`, `rejected`,
`received`) records an immutable event in `purchase_request_events`
with a cryptographic signature.

### 8.1 Signature input

```ts
const SIGNATURE_SECRET =
  process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "<dev fallback>";

function computeSignedHash({ userId, action, requestId, timestamp, signedName }) {
  const payload = `v1|${userId}|${action}|${requestId}|${timestamp}|${signedName}`;
  return crypto.createHmac("sha256", SIGNATURE_SECRET).update(payload).digest("hex");
}
```

`signed_name` is **typed by the user** in the UI at the moment of
action ("I, Jane Doe, approve this request"). It is stored verbatim so
the auditor can re‑play the input string and re‑compute the hash.

### 8.2 Verifiable trail

Given the row:

| event_type | signed_at                 | signer            | signed_hash                                                          |
| ---------- | ------------------------- | ----------------- | -------------------------------------------------------------------- |
| approved   | 2026‑05‑11 19:26:45 UTC   | Immigration Admin | `afaaa07ffba697d56087029da25564066eaf0b0c62b536ba9d7bac596da1c4da`   |

an auditor with read access to `JWT_SECRET` can re‑run
`computeSignedHash` and confirm the row has not been tampered with
after the fact. Forging events without the secret is computationally
infeasible.

---

## 9. Backend — API reference

All routes are mounted under `/api` (see
`artifacts/api-server/src/app.ts`, `app.use("/api", router)`). Bearer
token required unless marked **public**.

### 9.1 `health.ts`

| Method | Path             | Description                |
| ------ | ---------------- | -------------------------- |
| GET    | `/api/healthz`   | Liveness probe.            |

### 9.2 `auth.ts`

| Method | Path                              | Description                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------ |
| POST   | `/api/v1/auth/login`              | Email + password → `{ access_token, refresh_token, user }`.  |
| POST   | `/api/v1/auth/refresh`            | Exchange a refresh token for a new access token.             |
| POST   | `/api/v1/auth/logout`             | Revoke the current refresh token.                            |
| POST   | `/api/v1/auth/forgot-password`    | Stubbed (returns `200`); plug in a real flow when needed.    |
| GET    | `/api/v1/auth/me`                 | Current user profile, roles and scope.                       |
| PATCH  | `/api/v1/auth/me`                 | Update the caller's own profile.                             |
| POST   | `/api/v1/auth/change-password`    | Change the caller's password (requires the old one).         |

### 9.3 `users.ts`

| Method | Path                                       | Description                                  |
| ------ | ------------------------------------------ | -------------------------------------------- |
| GET    | `/api/v1/users`                            | List users in caller's scope.                |
| POST   | `/api/v1/users`                            | Create a user (admin only). Hashes password. |
| GET    | `/api/v1/users/:id`                        | User detail.                                 |
| PUT    | `/api/v1/users/:id`                        | Replace user fields and role assignments.    |
| PATCH  | `/api/v1/users/:id/deactivate`             | Soft‑disable account.                        |
| PATCH  | `/api/v1/users/:id/reactivate`             | Re‑enable account.                           |
| GET    | `/api/v1/roles`                            | List role catalogue.                         |

### 9.4 `locations.ts`

| Method | Path                                                | Description                                |
| ------ | --------------------------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/locations/regions`                         | Region list (Highlands / Momase / …).      |
| GET    | `/api/v1/locations/provinces`                       | All provinces (with district counts).      |
| GET    | `/api/v1/locations/provinces/:id`                   | Province detail.                           |
| PATCH  | `/api/v1/locations/provinces/:id`                   | Update province metadata.                  |
| GET    | `/api/v1/locations/provinces/:id/districts`         | Districts for a province.                  |
| GET    | `/api/v1/locations/districts/:id`                   | District detail.                           |
| POST   | `/api/v1/locations/districts`                       | Create a district.                         |
| GET    | `/api/v1/locations/districts/:id/facilities`        | Facilities in a district.                  |
| POST   | `/api/v1/locations/facilities`                      | Create a facility.                         |
| PATCH  | `/api/v1/locations/facilities/:id`                  | Update a facility.                         |
| DELETE | `/api/v1/locations/facilities/:id`                  | Delete a facility.                         |

### 9.5 `agency.ts`

| Method | Path                               | Description                                       |
| ------ | ---------------------------------- | ------------------------------------------------- |
| GET    | `/api/v1/agency_branding`          | Logo, primary / secondary colour, display name.   |
| PATCH  | `/api/v1/agency_branding`          | Tenant admin updates branding.                    |

### 9.6 `categories.ts`

| Method | Path                          | Description                                |
| ------ | ----------------------------- | ------------------------------------------ |
| GET    | `/api/v1/categories`          | List asset categories.                     |
| POST   | `/api/v1/categories`          | Create a category (admin only).            |
| PUT    | `/api/v1/categories/:id`      | Replace a category (admin only).           |
| DELETE | `/api/v1/categories/:id`      | Delete a category (admin only).            |

### 9.7 `assets.ts`

| Method | Path                                   | Description                                                           |
| ------ | -------------------------------------- | --------------------------------------------------------------------- |
| GET    | `/api/v1/assets`                       | Search/filter list. Supports `q`, `categoryId`, `status`, scope.      |
| GET    | `/api/v1/assets/latest-code?type=XXX`  | Returns the next code in the agency sequence (e.g. `PNGICA-VEH-014`). |
| POST   | `/api/v1/assets`                       | Create. Returns `409` on duplicate `asset_tag`.                       |
| GET    | `/api/v1/assets/:id`                   | Detail with location, custodian, photos.                              |
| PUT    | `/api/v1/assets/:id`                   | Replace editable fields.                                              |
| DELETE | `/api/v1/assets/:id`                   | Soft delete (sets `deleted_at`).                                      |
| GET    | `/api/v1/assets/:id/qr-data`           | QR payload for sticker printing.                                      |
| PATCH  | `/api/v1/assets/:id/status`            | Change `status` (active / under_maintenance / missing / disposed).    |
| POST   | `/api/v1/assets/:id/transfer`          | Move asset to new facility / custodian. Writes `asset_transfers` row. |
| GET    | `/api/v1/assets/:id/transfers`         | Transfer history.                                                     |
| GET    | `/api/v1/assets/:id/lifecycle`         | Aggregated lifecycle view (transfers + maintenance).                  |
| POST   | `/api/v1/assets/warranty-check`        | Bulk warranty‑expiry report.                                          |

### 9.8 `stock.ts`

| Method | Path                                     | Description                                              |
| ------ | ---------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/stock`                          | List stock items in scope.                               |
| GET    | `/api/v1/stock/latest-code`              | Next sequence code (e.g. `PNGICA-STK-014`).              |
| POST   | `/api/v1/stock`                          | Create stock item.                                       |
| GET    | `/api/v1/stock/:id`                      | Detail with per‑facility balances.                       |
| PATCH  | `/api/v1/stock/:id`                      | Update master record.                                    |
| PATCH  | `/api/v1/stock/:id/balances`             | Adjust on‑hand qty / reorder level for a facility.       |
| POST   | `/api/v1/stock/:id/movements`            | Record a receipt / issue / transfer / adjustment.        |
| GET    | `/api/v1/stock/:id/movements`            | Movement history.                                        |

### 9.9 `purchase-requests.ts`

| Method | Path                                                | Description                                                                                                |
| ------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/purchase-requests`                         | List requests, scoped.                                                                                     |
| POST   | `/api/v1/purchase-requests`                         | Create the request **and** record the signed `submitted` event in one call. Sets `status = submitted`.     |
| GET    | `/api/v1/purchase-requests/:id`                     | Detail with stock item, requester, agency.                                                                 |
| GET    | `/api/v1/purchase-requests/:id/events`              | Full signed event timeline for that request.                                                               |
| POST   | `/api/v1/purchase-requests/:id/approve`             | Approver signs `signed_name`. Records HMAC‑signed `approved` event.                                        |
| POST   | `/api/v1/purchase-requests/:id/reject`              | Records `reason` and signed `rejected` event.                                                              |
| POST   | `/api/v1/purchase-requests/:id/receive`             | Records signed `received` event; updates stock balance. Auto‑transitions to `closed` when fully received.  |

### 9.10 `audit.ts`

| Method | Path                                              | Description                                          |
| ------ | ------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/v1/audit/sessions`                          | List audit sessions in scope.                        |
| POST   | `/api/v1/audit/sessions`                          | Create a session (admin).                            |
| GET    | `/api/v1/audit/sessions/:id`                      | Session detail with assignments and progress %.      |
| PATCH  | `/api/v1/audit/sessions/:id`                      | Update session metadata.                             |
| POST   | `/api/v1/audit/sessions/:id/assignments`          | Bulk‑assign assets to an officer.                    |
| GET    | `/api/v1/audit/assignments/mine`                  | Assignments awaiting the current officer.            |
| GET    | `/api/v1/audit/assignments/:id`                   | Assignment detail with per‑asset verification rows.  |
| PATCH  | `/api/v1/audit/items/:id`                        | Officer submits condition + GPS + photo per asset.   |

### 9.11 `maintenance.ts`

| Method | Path                          | Description                                            |
| ------ | ----------------------------- | ------------------------------------------------------ |
| GET    | `/api/v1/maintenance`         | List maintenance records, filterable by asset/status.  |
| POST   | `/api/v1/maintenance`         | Schedule / log a maintenance event.                    |
| GET    | `/api/v1/maintenance/:id`     | Maintenance detail.                                    |
| PATCH  | `/api/v1/maintenance/:id`     | Update status / cost / completion.                     |
| DELETE | `/api/v1/maintenance/:id`     | Remove a maintenance record.                           |

### 9.12 `dashboard.ts`

| Method | Path                              | Description                                                |
| ------ | --------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/dashboard/provincial`    | KPIs scoped to the caller's province / agency.             |
| GET    | `/api/v1/dashboard/national`      | National roll‑up (Super Admin / National roles only).      |

### 9.13 `reports.ts`

| Method | Path                          | Description                                       |
| ------ | ----------------------------- | ------------------------------------------------- |
| GET    | `/api/v1/reports/assets`      | Tabular asset report; CSV via `Accept: text/csv`. |
| GET    | `/api/v1/reports/summary`     | Portfolio summary: counts, value, distribution.   |

### 9.14 `notifications.ts`

| Method | Path                                          | Description                  |
| ------ | --------------------------------------------- | ---------------------------- |
| GET    | `/api/v1/notifications`                       | Inbox for the current user.  |
| PATCH  | `/api/v1/notifications/:id/read`              | Mark a notification read.    |
| POST   | `/api/v1/notifications/mark-all-read`         | Mark all read.               |

### 9.15 `public.ts` — no auth

| Method | Path                              | Description                                                                            |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/v1/public/assets/:id`       | Public verification page for QR‑coded assets — name, agency, condition, photo. Anonymous. |

### 9.16 `storage.ts`

| Method | Path                                              | Description                                                              |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/api/storage/uploads/request-url`                | Returns a one‑time signed URL for direct browser upload.                 |
| GET    | `/api/storage/public-objects/*filePath`           | Streams a public object from `PUBLIC_OBJECT_SEARCH_PATHS`.               |
| GET    | `/api/storage/objects/*path`                      | Streams a private object from `PRIVATE_OBJECT_DIR` (auth + scope check). |

### 9.17 `system.ts`

| Method | Path                                  | Description                                                |
| ------ | ------------------------------------- | ---------------------------------------------------------- |
| POST   | `/api/v1/system/health-check`         | Force a health check; admins use this from the UI.         |
| GET    | `/api/v1/system/status`               | Build SHA, DB latency, queue depth — admin diagnostics.    |

---

## 10. Frontend — pages & features

The SPA lives in `artifacts/npams-web/` and uses **Wouter** for routing
(`artifacts/npams-web/src/App.tsx`). All data fetching goes through
generated TanStack Query hooks in `lib/api-client-react`.

| Route                         | Component (`src/pages/*`)         | What it does                                                                                                   |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/login`                      | `login.tsx`                       | Branded sign‑in.                                                                                               |
| `/` and `/dashboard`          | `dashboard.tsx`                   | KPIs (Total / Active / Missing / Maintenance / Disposed), portfolio value, status & condition charts, recently added assets, alert centre. Scoped to caller. |
| `/assets`                     | `assets.tsx`                      | Searchable, filterable asset list with bulk actions.                                                           |
| `/assets/new`, `/assets/:id/edit` | `asset-form.tsx`              | Create / edit form. Auto‑suggests the next `asset_tag` per category.                                           |
| `/assets/:id`                 | `asset-detail.tsx`                | Detail view with QR code, photos and transfer history.                                                         |
| `/categories`                 | `categories.tsx`                  | Category management for the 3‑group taxonomy (Digital & IT, Physical & Operational, Mobile & Distributed).     |
| `/locations`                  | `locations.tsx`                   | Province / district / facility hierarchy management.                                                           |
| `/stock`, `/stock/:id`        | `stock.tsx`, `stock-detail.tsx`   | Stock catalog and per‑facility balances; auto‑suggested item codes (`PNGICA-STK-014`).                         |
| `/purchase-requests`          | `purchase-requests.tsx`           | Pipeline by status.                                                                                            |
| `/purchase-requests/:id`      | `purchase-request-detail.tsx`     | Sign / approve / reject UI; renders the HMAC‑signed event timeline from `/purchase-requests/:id/events`.       |
| `/audit`                      | `audit.tsx`                       | Audit session list.                                                                                            |
| `/audit/:id`                  | `audit-detail.tsx`                | Session detail with progress and assignments.                                                                  |
| `/audit/verify/:id`           | `audit-verify.tsx`                | Mobile‑friendly field verification (camera + GPS) for an assignment.                                           |
| `/maintenance`                | `maintenance.tsx`                 | Maintenance schedule and history.                                                                              |
| `/gis`                        | `gis.tsx`                         | Leaflet map of all 22 PNG provinces with district overlays, basemap selector (Street / Satellite / Topo) and per‑province asset / population profile. |
| `/reports`                    | `reports.tsx`                     | Standard reports with CSV export.                                                                              |
| `/users`                      | `users.tsx`                       | User & role management (admin only).                                                                           |
| `/notifications`              | `notifications.tsx`               | Inbox.                                                                                                         |
| `/settings`                   | `settings.tsx`                    | Tenant branding, profile, preferences.                                                                         |
| `/system-status`              | `system-status.tsx`               | Build info + DB health (Super Admin / Agency Admin).                                                           |
| `/public/asset/:id`           | `public-asset.tsx`                | Public verification page reachable from a printed QR sticker. **Anonymous.**                                   |

### 10.1 Code‑suggestion convention

When adding new stock items or assets, the form fetches
`/api/v1/stock/latest-code` or `/api/v1/assets/latest-code?type=XXX`
and prefills the next code in sequence (e.g. `PNGICA-STK-014`,
`PNGICA-VEH-015`). The user can override the suggestion; once they
edit the field manually, subsequent category changes will not clobber
their value.

---

## 11. Auto‑seeding & demo data

`artifacts/api-server/src/lib/autoSeed.ts` runs on every boot and is
**idempotent** — existing rows are left alone.

It populates:

- One tenant (`PNG`, "Papua New Guinea Government").
- All 22 provinces and their districts.
- A handful of agencies (PNGICA, RPNGC, PNGCS, IRC, PNGDF, OMBUDSMAN,
  TREASURY, …) with branding.
- The full role catalogue from §7.2.
- Demo users — one Super Admin, National Controller, National Auditor,
  one Provincial Admin per province, plus an Agency Admin per seeded
  agency. **Every demo password is `Admin1234!`.** Examples:

  | Email                                  | Role                       | Scope               |
  | -------------------------------------- | -------------------------- | ------------------- |
  | `superadmin@npams.gov.pg`              | Super Admin                | National            |
  | `national@npams.gov.pg`                | National Asset Controller  | National            |
  | `auditor@npams.gov.pg`                 | National Auditor           | National (read‑only) |
  | `morobe.admin@npams.gov.pg`            | Provincial Admin           | Morobe              |
  | `ncd.admin@npams.gov.pg`               | Provincial Admin           | National Capital District |
  | `immigration.admin@npams.gov.pg`       | Agency Admin               | PNGICA              |
  | `customs.admin@npams.gov.pg`           | Agency Admin               | PNGCS               |
  | `police.admin@npams.gov.pg`            | Agency Admin               | RPNGC               |

- Stock items + balances for the PNGICA demo tenant (blank ePassports,
  visa stickers, holographic foils, …).
- A small seeded purchase request (`PR-YYYYMMDD-NNNN`) with a real
  HMAC‑signed `submitted` + `approved` event in
  `purchase_request_events`.

Demo passwords are intended for development environments only. In
production, change them via `PUT /api/v1/users/:id` (or
`POST /api/v1/auth/change-password`) immediately after onboarding.

---

## 12. Object storage

Image and document uploads (asset photos, agency logos, maintenance
attachments) flow through Google Cloud Storage
under the hood). The browser never receives long‑lived credentials.

1. The SPA calls `POST /api/storage/uploads/request-url` with the
   intended filename and content‑type.
2. The server returns a short‑lived signed `PUT` URL plus the eventual
   read URL.
3. The browser uploads the file directly to object storage.
4. The SPA persists the read URL on the relevant record.

Public objects (e.g. agency logos) are served via
`/api/storage/public-objects/<path>` from
`PUBLIC_OBJECT_SEARCH_PATHS`. Private objects (asset photos, signed
documents) are served via `/api/storage/objects/<path>` from
`PRIVATE_OBJECT_DIR` and gated by auth + scope.

Implementation: `artifacts/api-server/src/routes/storage.ts`,
`artifacts/api-server/src/lib/objectStorage.ts`, React widgets in
`lib/object-storage-web`.

---

## 13. Build & deployment

### 13.1 Local production build

```bash
pnpm build                                    # typecheck + recursive build
PORT=8080 pnpm --filter @workspace/api-server start   # node dist/index.mjs
```

The API server build does three things in order:

1. ESBuild bundles the TypeScript server into `dist/index.mjs`.
2. `scripts/copy-frontend.mjs` copies the built React bundle from
   `artifacts/npams-web/dist` into `dist/frontend`.
3. The runtime `app.ts` mounts that directory with `express.static` and
   serves `index.html` for any unknown route (SPA fallback).

### 13.2 Hosted deployment

Both the API and the SPA run as separate workflows during development,
proxied by your development environment. In production the
runner executes `pnpm --filter @workspace/api-server start`, which is
the single deployable unit because it serves the SPA itself.

### 13.3 Database migrations

Schema changes flow through Drizzle. The `scripts/post-merge.sh` script
runs after every task‑agent merge and applies any new schema diff via
`drizzle-kit push`. In production, prefer `drizzle-kit migrate`
against versioned migration files generated by `drizzle-kit generate`.

---

## 14. Operations runbook

| Symptom                                       | First check                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `502` / hosted preview blank                  | Hosting logs; confirm the server bound to `process.env.PORT` rather than a hardcoded port. |
| Server throws "PORT environment variable is required" | A workflow definition is missing a `PORT=...` prefix.                                  |
| `401` storms after deploy                     | Verify `JWT_SECRET` is set and identical to the value used to mint outstanding tokens.          |
| Signed‑hash mismatch on re‑verification       | Confirm the auditor is using the same secret (`JWT_SECRET ?? SESSION_SECRET`) and the canonical input `v1\|user\|action\|request\|signed_at\|signed_name`. |
| `column does not exist` in production         | Run `pnpm --filter @workspace/db drizzle-kit migrate`; see the `database` skill for the prod path. |
| Upload fails with `403`                       | Re‑check `PUBLIC_OBJECT_SEARCH_PATHS` / `PRIVATE_OBJECT_DIR`; signed URLs are short‑lived.      |
| Demo password rejected                        | Auto‑seed may have skipped (existing data); reset via `PUT /api/v1/users/:id` as a Super Admin. |

---

## 15. Glossary

| Term                  | Meaning                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| **Tenant**            | A government domain hosted on the platform (PNG).                                   |
| **Agency**            | A government body within a tenant (PNGICA, RPNGC, PNGCS, IRC, PNGDF, …).            |
| **Scope**             | The slice of data a user can see — `national` / `provincial` / `district` / `facility` / `agency`. |
| **HMAC‑SHA256**       | Keyed hash used to sign every purchase‑request event so it cannot be forged.        |
| **Signed name**       | The full name a user types when authorising a procurement action; included in the signature input. |
| **Asset tag**         | Per‑agency unique identifier on the `assets` table, e.g. `PNGICA-VEH-014`. Auto‑suggested in the UI. |
| **Stock item code**   | Per‑agency unique identifier on the `stock_items` table, e.g. `PNGICA-STK-013`.     |
| **Purchase Request (PR)** | The procurement workflow record. Numbered `PR-YYYYMMDD-NNNN`.                   |
| **Audit session**     | A scheduled physical verification campaign with assigned officers and target date.   |
| **GIS view**          | The Leaflet map page showing assets across all 22 PNG provinces.                    |

---

*Last updated: 11 May 2026.*
