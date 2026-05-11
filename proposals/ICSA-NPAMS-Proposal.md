# NPAMS — Asset Management System Proposal
**Prepared for:** PNG Immigration & Citizenship Authority (ICSA / PNGICA)
**Prepared by:** NPAMS Programme Office, Independent State of Papua New Guinea
**Reference:** NPAMS-ICSA-2026-001
**Date:** 11 May 2026
**Validity:** 60 days from issue
**Classification:** Commercial in Confidence

---

## 1. Executive Summary

The PNG Immigration & Citizenship Authority (ICSA) requires a single, auditable
system of record for the high‑value assets it operates on behalf of the State —
blank ePassport stocks, visa stickers, biometric workstations, secure printers,
inspection kits and the supporting estate at headquarters and provincial border
posts. The **National Public Asset Management System (NPAMS)** has been built
specifically for the PNG public sector and is already live, multi‑tenant, and
integrated with the Government's geographic data set.

This proposal sets out the activities, timeline and commercials required to
**onboard ICSA onto NPAMS as an Authority tenant** alongside other PNG agencies
already provisioned (PNGDF, RPNGC, IRC, Treasury, Customs, Ombudsman). It
delivers the same outcomes as the previously‑tabled Zyntrix proposal — a
modern, role‑based, GIS‑enabled asset register with purchase, audit and
maintenance workflows — at materially lower total cost.

| Headline | Figure |
|---|---|
| Total programme cost (Year 1, incl. GST) | **PGK 104,500.00** |
| Comparable Zyntrix proposal (incl. GST) | PGK 142,553.13 |
| **Savings to ICSA in Year 1** | **PGK 38,053.13 (≈ 26.7%)** |
| Time to go‑live | 8 weeks from contract signature |
| Concurrent web users included | 15 |

NPAMS is delivered as a hosted, autoscaling PNG‑resident SaaS platform with a
defined Service Level Agreement, encrypted data at rest, RBAC scoped down to
facility level, and tamper‑evident HMAC‑SHA256 digital signatures on every
purchase, approval and goods‑receipt event.

---

## 2. About NPAMS

NPAMS is the State‑sponsored asset management platform for PNG. It is currently
operating in production for the following Authorities, each in its own logical
tenant with its own branding, scope and roles:

* PNG Defence Force (PNGDF)
* Royal Papua New Guinea Constabulary (RPNGC)
* Internal Revenue Commission (IRC)
* Department of Treasury
* PNG Customs Service
* Office of the Ombudsman
* PNG Immigration & Citizenship Authority *(this proposal)*

Because NPAMS is multi‑tenant from the database upward, ICSA does not pay for a
new build — only for its onboarding, configuration, migration, training,
hosting and ongoing support. There is no platform IP licence fee charged to
ICSA above and beyond the per‑user subscription described in §6.

---

## 3. Asset Categories in Scope

NPAMS will manage, at minimum, the following ICSA asset classes. Each category
is configurable; ICSA Asset Officers can add additional classes without vendor
intervention.

| Category | Examples |
|---|---|
| Secure Stock | Blank ePassport booklets (32‑page / 64‑page), visa stickers, security inks, holographic foils |
| ICT Hardware | Biometric capture stations, fingerprint scanners, document scanners, secure printers, servers |
| Office Equipment | Workstations, laptops, photocopiers, networking gear |
| Vehicles & Plant | Pool vehicles, generators, UPS units |
| Furniture & Fittings | Office furniture, secure cabinets, safes |
| Border Post Estate | Buildings, perimeter fencing, signage, inspection lanes |
| Uniforms & PPE | Officer uniforms, body armour, inspection PPE |

Every asset record carries: unique asset code, category, location (province →
district → facility), custodian, acquisition cost, depreciation, condition,
service history, photographs, and a public verification QR code.

---

## 4. Solution Scope (mapped to live NPAMS modules)

The following modules are **already implemented** and will be enabled for ICSA
on day one. Screenshots are included in Annex A.

### 4.1 Multi‑Agency Tenancy & RBAC
* Logical isolation per Authority (ICSA tenant pre‑provisioned).
* Implemented role catalogue: Super Admin, National Asset Controller,
  National Auditor, Provincial Admin, Provincial Asset Officer,
  Provincial Viewer and Agency Admin (per-Authority).
* Scope is enforced at every API call: national, agency, province, district or
  single facility. ICSA users see only ICSA data.

### 4.2 Asset Register
* Full lifecycle: acquisition → in‑service → maintenance → disposal.
* Bulk import via spreadsheet template; per‑asset photographs and documents.
* Public QR verification page (no login) for field officers and auditors.

### 4.3 Stock & Inventory (secure consumables)
* On‑hand quantity, reorder level, supplier, unit cost per stock item.
* Stock movements (receive / issue / transfer / adjust) with full audit trail.
* Per‑facility balances; automated low‑stock alerts.

### 4.4 Purchase Request Workflow with Digital Signatures
* Officer raises a request → routed to scoped approvers → approve / reject →
  goods receipt against the request.
* **Every state transition is signed.** The signer types their full name; the
  server stores `signed_name`, `signed_at` and a tamper‑evident
  `signed_hash = HMAC‑SHA256(server_secret, "v1|user|action|request|timestamp|name")`.
* Notifications are dispatched to the requester and approvers at every step.

### 4.5 Audit Sessions
* Scheduled or ad‑hoc audit cycles by location.
* Officers verify each asset (present / missing / damaged) and capture
  evidence photographs against the public QR code.
* Variance report generated on session close.

### 4.6 Maintenance & Service History
* Preventive and corrective maintenance scheduling per asset.
* Cost capture, downtime tracking, vendor records.

### 4.7 GIS Map (PNG‑specific)
* Interactive Leaflet map of all 22 provinces and districts (GADM boundaries).
* Province / district selection dims unrelated areas; OSM, satellite and
  topographic basemaps. Used to visualise asset and stock distribution across
  ICSA's national footprint and border posts.

### 4.8 Reports & Dashboard
* KPI dashboard per role; custody, condition, depreciation and movement
  reports; CSV/PDF export.

### 4.9 Notifications & Activity Log
* In‑app notification centre delivering events to requesters and approvers.
* Append‑only `activity_logs` table capturing user, action type, entity,
  description and timestamp for every CRUD and workflow event.
* Workflow events on signed actions additionally carry the actor's
  HMAC‑SHA256 signature, providing tamper‑evident proof independent of
  the database row.

---

## 5. Governance, Security & Compliance

| Area | NPAMS Control |
|---|---|
| Authentication | Bcrypt‑hashed passwords; JWT session tokens with short TTL; lockout after repeated failures. |
| Authorisation | Role‑Based Access Control with scope filtering at the data layer. |
| Digital signatures | HMAC‑SHA256 keyed by server secret on every purchase / approval / receipt event — verifiable, non‑repudiable, replay‑resistant. |
| Audit log | Append‑only `activity_logs` and `purchase_request_events` tables; workflow events additionally signed by the actor with HMAC‑SHA256. |
| Data residency | Hosted in PNG‑accessible cloud region; daily encrypted backups retained 30 days. |
| Data in transit | TLS 1.2+ end‑to‑end. |
| Data at rest | AES‑256 encryption at the storage layer. |
| Personally identifiable data | Limited to officer profile data needed for workflow attribution; no citizen biometric data is processed. |
| Disaster Recovery | RPO 24h, RTO 8h. Documented runbook handed over at Go‑Live. |
| Service Level | 99.5% monthly uptime; P1 response 1h, P2 response 4h, P3 next business day. |
| Vulnerability management | Monthly dependency CVE scan (npm audit + Snyk); SAST run on every release; critical CVEs patched within 7 days, high within 30 days; quarterly external penetration test summary delivered to ICSA. |

NPAMS aligns with the PNG Government Digital Strategy and is designed to be
auditable by the Auditor‑General's office on demand.

---

## 6. Commercials

All amounts in **Papua New Guinea Kina (PGK)**. GST applied at 10% per the
Goods and Services Tax Act 2003.

### 6.1 Year 1 Cost Build‑Up

| # | Line Item | Unit | Unit Price (PGK) | Qty | Line Total (PGK) |
|---:|---|---|---:|---:|---:|
| 1 | Platform Licence — Year 1 | Named concurrent web user / year | 600.00 | 15 | 9,000.00 |
| 2 | Implementation & Configuration | Fixed‑price work package (one‑off) | 28,000.00 | 1 | 28,000.00 |
| 3 | Data Migration & Seeding | Fixed‑price work package (one‑off) | 8,500.00 | 1 | 8,500.00 |
| 4 | User Training | Classroom / online session | 2,500.00 | 3 | 7,500.00 |
| 5 | Cloud Hosting (12 months) | Hosting bundle / month (app + DB + CDN + backups) | 1,000.00 | 12 | 12,000.00 |
| 6 | Annual Support & Maintenance — Year 1 | SLA support bundle / month (incl. <= 8 hrs/mo enhancements) | 2,500.00 | 12 | 30,000.00 |
|   | **Subtotal (excl. GST)** |   |   |   | **95,000.00** |
|   | **GST (10%)** |   |   |   | **9,500.00** |
|   | **Grand Total Year 1 (incl. GST)** |   |   |   | **104,500.00** |

### 6.2 Recurring Cost — Year 2 onwards

| # | Line Item | Unit | Unit Price (PGK) | Qty | Line Total (PGK) |
|---:|---|---|---:|---:|---:|
| 1 | Platform Licence | Named concurrent web user / year | 600.00 | 15 | 9,000.00 |
| 2 | Cloud Hosting | Hosting bundle / month | 1,000.00 | 12 | 12,000.00 |
| 3 | Annual Support & Maintenance | SLA support bundle / month | 2,500.00 | 12 | 30,000.00 |
|   | Subtotal (excl. GST) |   |   |   | 51,000.00 |
|   | GST (10%) |   |   |   | 5,100.00 |
|   | **Recurring Total / yr (incl. GST)** |   |   |   | **56,100.00** |

Additional concurrent users may be added at any time at PGK 600 / user / year
(prorated). No volume change requires a re‑contract.

### 6.3 Three‑Year Total Cost of Ownership

| Year | Incl. GST (PGK) |
|---|---:|
| Year 1 | 104,500.00 |
| Year 2 | 56,100.00 |
| Year 3 | 56,100.00 |
| **3‑Year TCO** | **216,700.00** |

---

## 7. Implementation Timeline

Eight (8) weeks from contract signature to formal Go‑Live, with a further two
weeks of post‑go‑live hyper‑care.

| Week | Workstream | Activity |
|:---:|---|---|
| 1 | Mobilisation | Kick‑off, governance set‑up, secure data‑sharing agreement signed |
| 1‑2 | Tenant Provisioning | ICSA tenant created, branding loaded, roles & RBAC scopes configured |
| 2‑4 | Data Migration | Asset register, stock items, locations and custodian data migrated; UAT data set loaded |
| 3‑5 | Configuration | Categories, audit checklists, maintenance schedules, notification rules |
| 4‑6 | Integration | SSO‑ready identity stub, file‑storage bucket, public QR endpoint |
| 5‑6 | Training | Asset Officer (1 day), Agency Admin (1 day), Auditors (½ day) |
| 6‑7 | UAT | ICSA business sign‑off across all in‑scope modules |
| 7‑8 | Go‑Live | Production cut‑over, hand‑over runbook, DR drill |
| 9‑10 | Hyper‑care | On‑site support, defect triage, performance tuning |

---

## 8. Roles & Responsibilities

| Activity | NPAMS | ICSA |
|---|:---:|:---:|
| Tenant provisioning | R | I |
| Data extraction from legacy systems | C | R |
| Data cleansing & sign‑off | C | R |
| Configuration of roles, scopes, categories | R | C |
| User Acceptance Testing | C | R |
| Training delivery | R | C |
| Go‑Live decision | C | R |
| Day‑2 support | R | C |

(R = Responsible, C = Consulted, I = Informed)

---

## 9. Assumptions & Exclusions

* Pricing assumes 15 concurrent web users in Year 1; additional users billable
  at PGK 600 / user / year.
* Mobile applications (Android / iOS) are not in scope; the responsive web app
  works on tablets and modern phones.
* Hardware (scanners, label printers, biometric kiosks) is provided by ICSA.
* Connectivity to provincial border posts is provided by ICSA.
* Custom development beyond the 8 hrs/month support envelope is quoted
  separately at PGK 300 / hr.

---

## 10. Terms & Conditions

1. **Currency.** All amounts are in PGK and exclude GST unless otherwise
   stated.
2. **Payment.** 30% on contract signature, 40% on UAT sign‑off, 30% on
   Go‑Live. Recurring fees billed annually in advance.
3. **Validity.** This proposal is valid for sixty (60) days from the date on
   the cover.
4. **Variations.** Any change in scope is captured in a written Change Request
   and priced at PGK 300 / hr.
5. **Intellectual Property.** Platform IP remains with the NPAMS Programme.
   ICSA data remains the property of ICSA at all times and is exportable on
   demand in open formats.
6. **Termination.** Either party may terminate for convenience on 90 days'
   notice. On termination, all ICSA data is delivered as Postgres dump and
   CSV export within 14 days at no charge.
7. **Confidentiality.** Both parties treat the contents of this engagement
   as confidential.
8. **Governing Law.** Laws of the Independent State of Papua New Guinea.

---

## Annex A — Live Application Screenshots

The following screenshots are taken from the running production build of NPAMS
on the date of issue and reflect the system that ICSA will inherit.

* **Figure A1** — Sign‑in screen with PNG branding and tenant theming.
* **Figure A2** — ICSA Authority dashboard scoped to the PNGICA tenant.
* **Figure A3** — Purchase Requests workflow page (HMAC‑signed pipeline).
* **Figure A4** — GIS Province Map (Leaflet, all 22 PNG provinces).

### Annex A1 — Signature ledger evidence (live data)

The two events below were generated by the running NPAMS API on 11 May 2026
against purchase request **PR‑20260511‑5092** (Blank ePassport Booklet, qty
500 @ K 42.50 from Crane Currency PNG). The `signed_hash` for each event is
the actual HMAC‑SHA256 value persisted in the `purchase_request_events`
table. ICSA's Auditor can re‑compute these hashes from the documented input
string and the server secret to prove no event has been tampered with.

| Event | Signed at (UTC) | Signer | Role | signed_hash (HMAC‑SHA256, hex) |
|---|---|---|---|---|
| submitted | 2026‑05‑11 19:26:45 | Immigration Admin | Agency Admin | `de2ff7ef0f18e1212980ed820079bf7f869ab7620d91dbf5382bb7ad6da60e8a` |
| approved  | 2026‑05‑11 19:26:45 | Immigration Admin | Agency Admin | `afaaa07ffba697d56087029da25564066eaf0b0c62b536ba9d7bac596da1c4da` |

---

## Annex B — Comparison vs Reference Proposal

| Item | Reference Proposal (Zyntrix v1.2) | NPAMS Proposal | Δ |
|---|---:|---:|---:|
| Platform licence (Year 1, 5 users) | 42,000.00 | 9,000.00 (15 users) | (33,000.00) |
| Implementation & customisation | included | 28,000.00 | n/a |
| Data migration & seeding | included | 8,500.00 | n/a |
| Annual hosting | included in support | 12,000.00 | n/a |
| Training | included | 7,500.00 | n/a |
| Annual support & maintenance | 84,000.00 | 30,000.00 | (54,000.00) |
| Per‑user licence (additional) | 718.75 / user | 600.00 / user | (118.75) |
| **Subtotal (excl. GST)** | 129,593.75 | 95,000.00 | **(34,593.75)** |
| **GST (10%)** | 12,959.38 | 9,500.00 | (3,459.38) |
| **Grand Total Year 1 (incl. GST)** | **142,553.13** | **104,500.00** | **(38,053.13)** |
| **Saving to ICSA** | — | — | **≈ 26.7%** |

The NPAMS proposal is itemised line‑by‑line so that ICSA's Finance team can
trace every Kina; nothing is bundled into an opaque "support" line.

---

*End of proposal — Commercial in Confidence — NPAMS Programme Office, 2026.*
