# Backend Hosting for Installed Clients

> Status: **Plan only.** Companion document to [`windows-installer.md`](./windows-installer.md) and [`android-installer.md`](./android-installer.md).

The installed Windows desktop app and the Android app both ship the NPAMS UI but **do not bundle the API server or database**. They need to know where to find a backend. This document lists the three realistic deployment shapes and their trade-offs so customers (ICSA and others) can pick one per site.

## Option A — Hosted Cloud Backend (Replit Deployment or other)

A single `api-server` instance runs on Replit (or any cloud) at, e.g., `https://npams.example.gov.lk/api`. All installed clients point at it.

**Pros**

- Single source of truth; backups, monitoring, upgrades all happen in one place.
- No customer-side IT work — they just install the app.
- Updates to API + DB schema are immediate for everyone.
- Works for staff in the field over mobile data.

**Cons**

- Requires constant internet at every client site.
- Government data may have residency / on-prem mandates that disallow cloud.
- Single outage affects every user.

**Best for**: small agencies, public-sector pilots, demos, anyone without IT staff.

## Option B — Customer-Hosted LAN Server (Recommended for ICSA)

The customer (e.g. ICSA) runs the existing `api-server` + Postgres on a server inside their office LAN. Installed clients on staff laptops/phones connect to `http://npams.icsa.local:5000/api` over the LAN.

**Pros**

- Data never leaves the customer's premises — meets on-prem mandates.
- Works without public internet (LAN only).
- Customer fully owns backups and uptime.

**Cons**

- Requires a Linux/Windows server, Postgres, and basic IT ops at the customer site.
- Updates require the owner (or a partner) to push new builds to that server.
- Mobile app needs cleartext HTTP allowance (or a TLS reverse proxy on the LAN — recommended via Caddy auto-cert from an internal CA).
- Field staff outside the LAN need VPN access.

**Best for**: ICSA-style government tenants with existing IT and data-residency rules. **This is the recommended target for the first installer rollout.**

Suggested LAN setup checklist (for a deployment runbook later):

1. Ubuntu Server 22.04 VM, 4 vCPU / 8 GB RAM / 100 GB SSD.
2. Postgres 16 (managed locally, daily `pg_dump` to a backup share).
3. `node 22` + `pnpm`, run `api-server` under `systemd` or `pm2`.
4. Caddy in front for automatic TLS using an internal CA cert trusted by client devices.
5. Firewall: only port 443 open to the LAN.
6. DNS: `npams.icsa.local` resolves to the server.
7. Installer config points at `https://npams.icsa.local/api`.

## Option C — Bundled Local Server (Future)

Each installation embeds its own `api-server` + a local Postgres or SQLite, running on the user's machine. No remote backend at all.

**Pros**

- Truly offline single-user installs (e.g. a field auditor with a laptop and no connectivity).
- Zero IT setup at customer site.

**Cons**

- Not multi-user — every install is its own data island.
- Sync across users becomes a separate problem (CRDT, manual export/import, etc.).
- Significantly increases installer size (Postgres adds ~100 MB; SQLite is lighter).
- Schema migrations run on every laptop instead of one server.
- Out of scope for the first installer.

**Best for**: a future "field kit" mode for single-user offline auditors. Not part of the initial rollout.

## Decision Summary

| Site type | Recommendation |
|---|---|
| ICSA / on-prem government tenant | **Option B** (LAN server). |
| Small agency, internet-friendly | **Option A** (hosted). |
| Solo offline auditor (future) | **Option C** (bundled). |

## What Both Installers Must Support

To make any of the above work without rebuilding the client per customer:

1. **Runtime API base URL** — read from a config file (Windows: `%APPDATA%\NPAMS\config.json`; Android: Capacitor Preferences `npams.apiBaseUrl`).
2. **First-run "Server URL" dialog** — prompt the user to enter the API base URL if no config is present, then persist it.
3. **CORS allowance on the API** — must allow the Tauri (`tauri://localhost`) and Capacitor (`https://localhost`, `http://localhost`) origins. Currently `cors()` in `artifacts/api-server/src/app.ts` is wide-open, which is fine for pilot; tighten later.
4. **Cleartext HTTP** support on Android for LAN deployments (covered in `android-installer.md` §6 / §15).

These three pieces are the only client-side changes the backend deployment story requires.
