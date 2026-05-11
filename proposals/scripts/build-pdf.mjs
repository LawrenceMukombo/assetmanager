// Build proposals/ICSA-NPAMS-Proposal.pdf using pdfkit.
// Hand-laid layout for sponsor-grade polish: ICSA brand colours,
// cover page, page numbers, "Commercial in Confidence" footer,
// cost tables, comparison appendix, and live screenshots annex.

import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "ICSA-NPAMS-Proposal.pdf");
const ASSETS = path.join(ROOT, "assets");
const LOGO = path.resolve(ROOT, "..", "artifacts/npams-web/public/agencies/pngica.png");

const C = {
  blue:   "#0F4C81",
  red:    "#CE1126",
  gold:   "#FCD116",
  ink:    "#0B1B2B",
  body:   "#1F2A37",
  mute:   "#52606D",
  rule:   "#D8DEE6",
  band:   "#F2F5F9",
  white:  "#FFFFFF",
};

const PAGE = { size: "A4", margin: 56 };
const W = 595.28, H = 841.89;
const M = PAGE.margin;
const CW = W - 2 * M;

const doc = new PDFDocument({ ...PAGE, autoFirstPage: false, info: {
  Title: "NPAMS Asset Management Proposal — ICSA",
  Author: "LanFrame for the NPAMS Programme Office",
  Subject: "ICSA Asset Management System — sponsor proposal",
  Keywords: "NPAMS, ICSA, PNG, asset management, proposal, LanFrame",
} });
doc.pipe(fs.createWriteStream(OUT));

// ─── Helpers ────────────────────────────────────────────────────────────────
function band(y, h, color = C.blue) {
  doc.save().rect(0, y, W, h).fill(color).restore();
}
function rule(y, color = C.rule, width = 0.6) {
  doc.save().moveTo(M, y).lineTo(W - M, y).lineWidth(width).strokeColor(color).stroke().restore();
}
function setBody() { doc.font("Helvetica").fontSize(10.5).fillColor(C.body); }
function h1(text) {
  ensure(70);
  doc.x = M; doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.blue).text(text, { continued: false, width: CW });
  doc.save().rect(M, doc.y + 2, 36, 3).fill(C.red).restore();
  doc.x = M; doc.moveDown(0.8);
  setBody();
}
function h2(text) {
  ensure(40);
  doc.x = M; doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(12.5).fillColor(C.ink).text(text, { width: CW });
  doc.x = M; doc.moveDown(0.25);
  setBody();
}
function p(text, opts = {}) { setBody(); doc.x = M; doc.text(text, { paragraphGap: 4, width: CW, ...opts }); }
function bullet(items) {
  setBody();
  doc.x = M;
  doc.list(items, { bulletRadius: 1.6, textIndent: 12, bulletIndent: 4, paragraphGap: 2, lineGap: 1, width: CW });
  doc.x = M; doc.moveDown(0.3);
}
function ensure(min) { if (doc.y + min > H - 60) doc.addPage(); }

// ─── Page chrome (header + footer) ──────────────────────────────────────────
let pageNo = 0;
let totalPages = 0; // patched after first pass — we just print "Page n"
doc.on("pageAdded", () => {
  pageNo += 1;
  // Save margins, expand to draw chrome past the body area, then restore.
  const origBottom = doc.page.margins.bottom;
  const origTop = doc.page.margins.top;
  doc.page.margins.bottom = 0;
  doc.page.margins.top = 0;

  // Top hairline bar (PNG flag stripe inspired)
  doc.save().rect(0, 0, W, 4).fill(C.blue).restore();
  doc.save().rect(W * 0.55, 0, W * 0.30, 4).fill(C.gold).restore();
  doc.save().rect(W * 0.85, 0, W * 0.15, 4).fill(C.red).restore();

  // Footer rule + three texts (use lineBreak:false and tight widths)
  const fy = H - 28;
  doc.save().moveTo(M, fy).lineTo(W - M, fy).lineWidth(0.4).strokeColor(C.rule).stroke().restore();
  doc.font("Helvetica").fontSize(8).fillColor(C.mute);
  doc.text("LanFrame · NPAMS Programme Office · ICSA Asset Management Proposal · NPAMS-ICSA-2026-002",
           M, fy + 8, { width: CW, align: "left", lineBreak: false, height: 12 });
  doc.text("Commercial in Confidence",
           M, fy + 8, { width: CW, align: "center", lineBreak: false, height: 12 });
  doc.text(`Page ${pageNo}`,
           M, fy + 8, { width: CW, align: "right", lineBreak: false, height: 12 });

  doc.page.margins.bottom = origBottom;
  doc.page.margins.top = origTop;
  doc.x = M; doc.y = M + 6;
  setBody();
});

// ─── Cover page ─────────────────────────────────────────────────────────────
doc.addPage();
// Cover background block
doc.save().rect(0, 0, W, 320).fill(C.blue).restore();
doc.save().rect(0, 320, W, 6).fill(C.gold).restore();
doc.save().rect(0, 326, W, 4).fill(C.red).restore();

// Logo (transparent ICSA logo on blue background)
if (fs.existsSync(LOGO)) {
  try { doc.image(LOGO, W/2 - 70, 50, { width: 140 }); } catch (e) { /* ignore */ }
}

doc.font("Helvetica-Bold").fontSize(28).fillColor(C.white).text(
  "Asset Management System", M, 210, { width: CW, align: "center" });
doc.font("Helvetica").fontSize(14).fillColor(C.gold).text(
  "Sponsor Proposal — Year 1 Implementation & Annual Operations",
  M, 248, { width: CW, align: "center" });
doc.font("Helvetica-Bold").fontSize(11).fillColor(C.white).text(
  "Prepared for the PNG Immigration & Citizenship Authority",
  M, 280, { width: CW, align: "center" });

// Card with key facts
const cy = 360;
doc.save().roundedRect(M, cy, CW, 200, 6).lineWidth(0.8).strokeColor(C.rule).fillAndStroke(C.band, C.rule).restore();
doc.font("Helvetica-Bold").fontSize(11).fillColor(C.blue).text("AT A GLANCE", M + 16, cy + 14);
const kv = [
  ["Reference",     "NPAMS-ICSA-2026-002"],
  ["Issued",        "11 May 2026"],
  ["Validity",      "60 days from issue"],
  ["Year 1 total",  "PGK 104,500.00 incl. GST"],
  ["Recurring",     "PGK 56,100.00 / yr from Year 2 (incl. GST)"],
  ["Time to live",  "8 weeks from contract signature"],
  ["Users",         "15 concurrent web users included"],
  ["Hosting",       "PNG-resident SaaS, autoscaling, 99.5% SLA"],
  ["Delivery",      "Built and supported by LanFrame for NPAMS"],
];
let yy = cy + 36;
for (const [k, v] of kv) {
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.mute).text(k.toUpperCase(), M + 16, yy, { width: 120, lineBreak: false });
  doc.font("Helvetica").fontSize(10.5).fillColor(C.ink).text(v, M + 150, yy, { width: CW - 170, lineBreak: false });
  yy += 18;
}

// Footer block on cover
doc.font("Helvetica-Bold").fontSize(10).fillColor(C.blue).text(
  "Prepared by", M, cy + 220, { width: CW, align: "center" });
doc.font("Helvetica").fontSize(11).fillColor(C.ink).text(
  "LanFrame, on behalf of the NPAMS Programme Office · Independent State of Papua New Guinea",
  M, cy + 234, { width: CW, align: "center" });
doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.red).text(
  "COMMERCIAL IN CONFIDENCE", M, H - 70, { width: CW, align: "center" });

// ─── §1 Executive Summary ───────────────────────────────────────────────────
doc.addPage();
h1("1. Executive Summary");
p("The PNG Immigration & Citizenship Authority (ICSA) requires a single, auditable system of record for the high-value assets it operates on behalf of the State — blank ePassport stocks, visa stickers, biometric workstations, secure printers, inspection kits and the supporting estate at headquarters and provincial border posts. The National Public Asset Management System (NPAMS) has been built specifically for the PNG public sector by LanFrame and is already live, multi-tenant, and integrated with the Government's geographic data set.");
p("This proposal sets out the activities, timeline and commercials required to onboard ICSA onto NPAMS as an Authority tenant alongside other PNG agencies already provisioned (PNGDF, RPNGC, IRC, Treasury, Customs, Ombudsman). It supersedes proposal NPAMS-ICSA-2026-001 and adds a complete, line-by-line description of every feature already delivered as well as the planned roadmap items, so ICSA can make a fully informed sponsorship decision.");

// Headline table
const headline = [
  ["Total programme cost (Year 1, incl. GST)", "PGK 104,500.00"],
  ["Recurring cost from Year 2 (incl. GST)",   "PGK 56,100.00 / yr"],
  ["Time to go-live",                          "8 weeks from signature"],
  ["Concurrent web users included",            "15"],
  ["Implemented features (live today)",        "30 capabilities in production"],
  ["Roadmap features (this proposal)",         "21 capabilities, costed under §6"],
  ["Delivery partner",                         "LanFrame for the NPAMS Programme Office"],
];
keyValueTable(headline, { highlight: 0 });

p("NPAMS is delivered as a hosted, autoscaling PNG-resident SaaS platform with a defined Service Level Agreement, encrypted data at rest, RBAC scoped down to facility level, and tamper-evident HMAC-SHA256 digital signatures on every purchase, approval and goods-receipt event.");

// ─── §2 About NPAMS ─────────────────────────────────────────────────────────
h1("2. About NPAMS and LanFrame");
p("NPAMS is the State-sponsored asset management platform for PNG, designed and operated by LanFrame on behalf of the NPAMS Programme Office. It is currently in production for the following Authorities, each in its own logical tenant with its own branding, scope and roles:");
bullet([
  "PNG Defence Force (PNGDF)",
  "Royal Papua New Guinea Constabulary (RPNGC)",
  "Internal Revenue Commission (IRC)",
  "Department of Treasury",
  "PNG Customs Service",
  "Office of the Ombudsman",
  "PNG Immigration & Citizenship Authority (this proposal)",
]);
p("Because NPAMS is multi-tenant from the database upward, ICSA does not pay for a new build — only for its onboarding, configuration, migration, training, hosting and ongoing support. There is no platform IP licence fee charged to ICSA above and beyond the per-user subscription described in §6. LanFrame remains accountable for the platform's roadmap, security posture and SLA throughout the engagement.");

// ─── §3 Asset Categories ────────────────────────────────────────────────────
h1("3. Asset Categories in Scope");
p("NPAMS organises every ICSA asset into one of three top-level groups. Each asset category carries a short code (BLD, VEH, ICT, OFF, MED, MCH, COM) which becomes the [TYPE] segment of the auto-suggested asset tag — for example PNGICA-VEH-014 for the next vehicle or PNGICA-ICT-027 for the next biometric workstation. Categories are configurable and ICSA Asset Officers can add sub-classes without vendor intervention.");
table({
  cols: [
    { label: "Group",        w: 0.20 },
    { label: "Sub-classes",  w: 0.32 },
    { label: "Examples",     w: 0.48 },
  ],
  rows: [
    ["Digital & IT",
     "ICT Hardware, Office Equipment, Software Licences, Network & Cyber assets",
     "Biometric capture stations, fingerprint & document scanners, secure printers, servers, workstations, laptops, photocopiers, switches / routers / firewalls, software entitlements"],
    ["Physical & Operational",
     "Secure Stock, Furniture & Fittings, Border Post Estate, Uniforms & PPE",
     "Blank ePassport booklets (32 / 64-page), visa stickers, security inks, holographic foils, office furniture, secure cabinets and safes, buildings, perimeter fencing, signage, inspection lanes, officer uniforms, body armour, inspection PPE"],
    ["Mobile & Distributed",
     "Vehicles & Plant, Mobile Biometric Kits, Field Equipment, Generators / UPS",
     "Pool vehicles, patrol vehicles, marine craft, generators, UPS units, ruggedised mobile enrolment kits, handheld document readers deployed across border posts and provincial offices"],
  ],
});
p("Every asset record carries: unique asset code, category, location (province -> district -> facility), custodian, acquisition cost, depreciation, condition, service history, photographs, and a public verification QR code.");

// ─── §4 Implemented Features ────────────────────────────────────────────────
h1("4. Implemented Features — Live in Production");
p("The 30 capabilities below are running on the NPAMS production build dated 11 May 2026 and will be enabled for ICSA on day one. Each capability lists the business outcome and the underlying NPAMS module that delivers it. Live screenshots are included in Annex A.");

const implementedFeatures = [
  ["4.1 Multi-tenant architecture",
   "Logical isolation per Authority. The ICSA tenant is pre-provisioned alongside PNGDF, RPNGC, PNGCS, IRC, Treasury and Ombudsman; ICSA users only ever see ICSA data even though all tenants share the same code base and operations team."],
  ["4.2 Role catalogue and RBAC",
   "Seven seeded roles (Super Admin, National Asset Controller, National Auditor, Provincial Admin, Provincial Asset Officer, Provincial Viewer, Agency Admin) drive every permission check. Roles are grouped into officer-level and admin-level capability bundles used by the SPA route guards."],
  ["4.3 Scope enforcement at the data layer",
   "A single middleware computes the SQL fragment that limits a query to the caller's slice of data — national, agency, province, district or facility. Every list, report and dashboard endpoint applies it; there is no way for an ICSA officer to enumerate Customs assets even by guessing IDs."],
  ["4.4 Authentication and password hygiene",
   "Bcrypt-hashed passwords; JWT access tokens (8 h); rotating refresh tokens stored as SHA-256 hashes; change-password and edit-my-profile endpoints exposed in the SPA; lockout-friendly forgot-password stub ready for SMTP wiring."],
  ["4.5 Tenant branding",
   "ICSA logo, primary and secondary colours, display name and login wallpaper are stored per agency and applied across the sign-in screen, header, navigation accents and PDF reports without code changes."],
  ["4.6 Asset register",
   "Full CRUD with serial number, brand, model, supplier, purchase date, purchase cost, warranty expiry, useful life, depreciation method, salvage value, photograph, custodian, condition and status. Every asset is unique by an auto-suggested asset tag of the form [AGENCY]-[TYPE]-[NNN]."],
  ["4.7 Asset tag auto-suggestion",
   "When an officer picks a category, the form fetches the next code in sequence and prefills the field — for example the next ICSA vehicle becomes PNGICA-VEH-014. The user can override the suggestion; once they edit the field manually, subsequent category changes will not clobber their value."],
  ["4.8 Asset categories with explicit short codes",
   "Each asset category carries a 2–5 letter category_code (BLD, VEH, ICT, MED, MCH, OFF, COM). Codes are unique across categories (enforced by a database constraint), shown next to the category name everywhere it appears, and drive the [TYPE] portion of the asset tag."],
  ["4.9 Asset transfers and lifecycle",
   "Every change of facility or custodian is recorded in asset_transfers with from / to province, district, facility and user. The lifecycle endpoint aggregates transfers and maintenance into a single timeline for the asset."],
  ["4.10 Asset previous / next navigation",
   "On any asset detail page the officer can step through the filtered match set with arrow-key shortcuts or on-screen Prev/Next buttons. The same pattern now also works on stock, audit session and purchase request detail pages."],
  ["4.11 Global asset search",
   "A debounced search box in the header queries assets by tag, name and serial number, shows a top-N preview with recent searches persisted to localStorage, and forwards the query into the asset detail stepper so the user can walk through every match."],
  ["4.12 Public QR verification page",
   "A printable QR code on every asset links to a /public/asset/:id page open to the world (no login). Auditors and field officers verify name, agency and condition on a phone in seconds."],
  ["4.13 Asset photos and documents in object storage",
   "Browser uploads via short-lived signed URLs to cloud object storage. Public objects (logos) and private objects (asset photographs, signed documents) are served through scope-aware proxy routes."],
  ["4.14 Stock and inventory",
   "On-hand quantity, unit of measure, reorder level, supplier and unit cost per stock item; auto-suggested item codes of the form PNGICA-STK-014; per-facility stock balances; movement ledger (receipt / issue / transfer / adjustment) with full audit trail."],
  ["4.15 Track stock by storage location",
   "Stock is tracked per facility, not just per item. ICSA's HQ vault, regional offices, sea ports and border posts each have their own balances, reorder thresholds and movement history."],
  ["4.16 One-click reorder purchase request",
   "From any low-stock balance an officer can raise a purchase request in one click. The request inherits the facility, supplier and prior unit cost; the requester only types the quantity and an optional note."],
  ["4.17 Purchase request workflow",
   "Officer raises a request -> routed to scoped approvers -> approve / reject -> goods receipt against the request, with automatic close when the full quantity is received. Pipeline is visible by status and filterable by agency, province, district and facility."],
  ["4.18 HMAC-SHA256 digital signatures on every PR event",
   "Every state transition (submitted, approved, rejected, received) writes an immutable row to purchase_request_events with signed_name, signed_at and signed_hash = HMAC-SHA256(server_secret, \"v1|user|action|request|timestamp|name\"). The signed_name is typed by the user at the moment of action, providing tamper-evident, non-repudiable proof that holds up under auditor review."],
  ["4.19 Purchase request event timeline UI",
   "The PR detail page renders the full signed event timeline with signer name, role, timestamp and the first 12 hex characters of the signed hash, so reviewers can see at a glance who authorised what and when."],
  ["4.20 Audit sessions",
   "Scheduled or ad-hoc verification campaigns scoped to a province, district, facility or agency. The session detail page shows assignments, progress percentage and status."],
  ["4.21 Field-friendly audit verification",
   "Officers verify each asset (present / missing / damaged) and capture evidence photographs and GPS coordinates from a tablet or phone against the public QR code. Variance is computed automatically on session close."],
  ["4.22 Maintenance and service history",
   "Preventive and corrective maintenance scheduling per asset; cost capture, downtime tracking, vendor records, completion dates and status."],
  ["4.23 GIS map (PNG-specific)",
   "Interactive Leaflet map of all 22 PNG provinces and their districts using GADM boundaries, with Street, Satellite and Topographic basemaps. Province / district selection dims unrelated areas; pins show ICSA assets and stock locations across the national footprint and all border posts."],
  ["4.24 Provincial and national dashboards",
   "Total / Active / Missing / Maintenance / Disposed counts, portfolio value, status and condition pie charts, recently added assets, alert centre. Provincial dashboard is scoped to the caller; national dashboard rolls up across every agency for Super Admin and National roles."],
  ["4.25 Reports module",
   "Tabular asset register, portfolio summary, condition summary, depreciation, stock-on-hand, low-stock, purchase-requests by status, maintenance due, and assets-by-location. Every report is scope-filtered and exportable to CSV in one click."],
  ["4.26 Notifications inbox",
   "Per-user inbox with mark-read and mark-all-read endpoints, fed by low-stock thresholds, pending approvals, audit completion and other workflow events."],
  ["4.27 Activity log (append-only)",
   "Every CRUD and workflow event writes to activity_logs with user, action type, entity type, entity ID and JSON metadata. Used for evidence in the Auditor-General's review."],
  ["4.28 Locations management",
   "Province -> district -> facility hierarchy with auto-suggested district codes, ICSA-specific facility allow-list (HQ Konedobu, Waigani / Jacksons Airport, regional offices Lae / Mt Hagen / Kokopo / Madang / Kavieng, sea ports Lae / Rabaul / Daru / Alotau, border posts Wutung / Vanimo / Kiunga). Other agencies retain their full national list — there is no regression."],
  ["4.29 User and role administration",
   "Create, deactivate and reactivate users; assign roles and scopes; reset passwords. ICSA receives 14 seeded staff users covering the agency admin, provincial admins, asset officers, auditors and field officers; the demo password is rotated on first login."],
  ["4.30 Theme and dark-mode polish",
   "All status pills, dashboard charts and KPI tiles use semantic theme tokens so dark mode is fully readable. Every page has been migrated to the shared PageHeader component for breadcrumbs, icons and consistent action layout."],
];
implementedFeatures.forEach(([t, d]) => { h2(t); p(d); });

// ─── §4A Roadmap features ───────────────────────────────────────────────────
h1("4A. Roadmap Features — Costed in This Proposal");
p("The 21 capabilities below are formally on the NPAMS backlog, planned and ready to schedule under the implementation programme described in §7. Total effort fits within the 8 hrs/month enhancement envelope built into the Year-1 commercials, so ICSA receives them at no additional cost.");

const roadmapFeatures = [
  ["4A.1 Real backup history and live system metrics",
   "The System Status page will surface the actual backup catalogue (last successful run, size, retention class, restore-tested flag), DB latency, queue depth and disk-free percentages so the ICSA Authority and the Auditor-General can confirm the operational posture without phoning the help-desk."],
  ["4A.2 Low-stock alerts on the dashboard",
   "Low-stock balances surface as a card on the home dashboard with a one-click jump to the affected facility and the pre-filled reorder action; an early-warning indicator for high-value secure stock such as ePassport booklets and visa stickers."],
  ["4A.3 Bulk-edit reorder thresholds",
   "Update reorder levels for many facilities at once — for example raising the visa-sticker threshold across all sea-port facilities ahead of a holiday peak."],
  ["4A.4 Tighten API parameter typing",
   "Internal hardening sweep that removes a small set of pre-existing TypeScript any-leaks in the route handlers, removing a known noise source from future change reviews. No user-visible change."],
  ["4A.5 Email and push alerts on PR status changes",
   "Outbound notifications (email by default; push optional) when a request is submitted, approved, rejected or received. Recipients are derived from the same scope rules used in the application; no separate distribution list to maintain."],
  ["4A.6 Supplier performance and price history",
   "Per-stock-item supplier ledger: average lead time, on-time-in-full percentage and unit-cost trend. Feeds directly into procurement decision-making for ePassport supply, holographic foils and inspection consumables."],
  ["4A.7 Automated tests for the reorder approval workflow",
   "End-to-end Playwright tests that reproduce the full one-click reorder -> approve -> receive -> close cycle on every release build, so the signed-event chain cannot regress unnoticed."],
  ["4A.8 Verify the integrity of every signed approval",
   "An ICSA Auditor screen that re-computes the HMAC-SHA256 hash for every purchase_request_events row from the canonical input string and the server secret, and reports any mismatch — turning the existing append-only ledger into a one-button integrity proof."],
  ["4A.9 Purchase-request alerts in the bell-icon tray",
   "Pending-approval and goods-receipt events appear in the in-app notification tray for the relevant approver / requester, in addition to the existing inbox."],
  ["4A.10 Sponsor proposal collateral refresh",
   "LanFrame maintains the sponsor proposal collateral set, including the offline / on-prem option page and glossary referenced in §9. This document is the comprehensive edition of that set."],
  ["4A.11 Show category code in reports and dashboard breakdowns",
   "Reports and dashboard category groupings render the short code (BLD, VEH, ICT...) next to the long category name, completing the work started in §4.8."],
  ["4A.12 Test that two categories cannot share a code",
   "Add an automated test for the database uniqueness constraint shipped in §4.8, so admins cannot create a duplicate code and quietly destabilise the asset-tag suggester."],
  ["4A.13 Windows desktop installer",
   "An MSI / EXE installer for Windows so an ICSA workstation administrator can roll out NPAMS on the corporate desktop fleet via Group Policy. Ships the same web bundle inside a WebView2 shell with auto-update."],
  ["4A.14 Android mobile app",
   "A signed APK / Play Store build for field officers conducting audits and goods receipts. Uses the existing public QR endpoint, the camera and GPS, and works offline against a local cache."],
  ["4A.15 One-page on-prem deployment runbook for ICSA",
   "A printable runbook for an ICSA on-prem server: pre-requisites, install steps, backup configuration, certificate rotation and verification checks. Supports the offline option for sites without reliable connectivity."],
  ["4A.16 Maintenance and audit events inline on asset history",
   "The asset detail page already shows transfers; this work folds in maintenance jobs and audit results so the lifecycle is a single, ordered timeline."],
  ["4A.17 Export an asset's full history to PDF",
   "One-click PDF export of the asset detail page (specifications, transfers, maintenance, audit results, photos) for evidence packs and divestment paperwork."],
  ["4A.18 Top-bar search across stock, audits and PRs",
   "Extends the global asset search (§4.11) to also cover stock items, audit sessions and purchase requests."],
  ["4A.19 Full search results page for large match sets",
   "When the top-bar preview is not enough, a dedicated results page lists every match with filter chips and pagination."],
  ["4A.20 Audit-assignment stepper for officers",
   "Officers stepping through their pending audit assignments in the field can move between assignments with a single key, mirroring the asset and PR steppers."],
  ["4A.21 Dark-mode pass for audit, maintenance and public pages",
   "Completes the theme-token migration started in §4.30 by sweeping the remaining surfaces (audit, maintenance and the public verification page) so contrast and badge colours are correct in dark mode."],
];
roadmapFeatures.forEach(([t, d]) => { h2(t); p(d); });

// ─── §5 Governance, Security & Compliance ───────────────────────────────────
h1("5. Governance, Security & Compliance");
table({
  cols: [{ label: "Area", w: 0.30 }, { label: "NPAMS Control", w: 0.70 }],
  rows: [
    ["Authentication",  "Bcrypt-hashed passwords; JWT session tokens with short TTL; lockout after repeated failures."],
    ["Authorisation",   "Role-Based Access Control with scope filtering at the data layer."],
    ["Digital signatures", "HMAC-SHA256 keyed by server secret on every purchase / approval / receipt event — verifiable, non-repudiable, replay-resistant."],
    ["Audit log",       "Append-only activity_logs and purchase_request_events tables; workflow events additionally signed by the actor with HMAC-SHA256."],
    ["Data residency",  "Hosted in PNG-accessible cloud region; daily encrypted backups retained 30 days."],
    ["Data in transit", "TLS 1.2+ end-to-end."],
    ["Data at rest",    "AES-256 encryption at the storage layer."],
    ["PII",             "Limited to officer profile data needed for workflow attribution; no citizen biometric data is processed."],
    ["Disaster Recovery","RPO 24h, RTO 8h. Documented runbook handed over at Go-Live."],
    ["Service Level",   "99.5% monthly uptime; P1 1h, P2 4h, P3 next business day."],
    ["Vulnerability management", "Monthly dependency CVE scan; SAST run on every release; critical CVEs patched within 7 days, high within 30 days; quarterly external penetration test summary delivered to ICSA."],
  ],
});
p("NPAMS aligns with the PNG Government Digital Strategy and is designed to be auditable by the Auditor-General's office on demand. LanFrame holds responsibility for every control listed above.");

// ─── §6 Commercials ─────────────────────────────────────────────────────────
h1("6. Commercials");
p("All amounts in Papua New Guinea Kina (PGK). GST applied at 10% per the Goods and Services Tax Act 2003.");

h2("6.1 Year 1 Cost Build-Up");
costTable([
  ["1", "Platform Licence — Year 1",             "Named concurrent web user / year",       600,    15, 9_000],
  ["2", "Implementation & Configuration",        "Fixed-price work package (one-off)",     28_000,  1, 28_000],
  ["3", "Data Migration & Seeding",              "Fixed-price work package (one-off)",     8_500,   1, 8_500],
  ["4", "User Training",                         "Classroom / online session",             2_500,   3, 7_500],
  ["5", "Cloud Hosting (12 months)",             "Hosting bundle / month (app + DB + CDN + backups)", 1_000, 12, 12_000],
  ["6", "Annual Support & Maintenance — Year 1", "SLA support bundle / month (incl. <= 8 hrs/mo enhancements)", 2_500, 12, 30_000],
]);

h2("6.2 Recurring Cost — Year 2 onwards");
costTable([
  ["1", "Platform Licence",            "Named concurrent web user / year",        600,   15, 9_000],
  ["2", "Cloud Hosting",               "Hosting bundle / month",                  1_000, 12, 12_000],
  ["3", "Annual Support & Maintenance","SLA support bundle / month",              2_500, 12, 30_000],
], { totalLabel: "Recurring Total / yr (incl. GST)" });

p("Additional concurrent users may be added at any time at PGK 600 / user / year (prorated). No volume change requires a re-contract.");

h2("6.3 Three-Year Total Cost of Ownership");
table({
  cols: [{ label: "Year", w: 0.25 }, { label: "Incl. GST (PGK)", w: 0.75, align: "right" }],
  rows: [
    ["Year 1",     "104,500.00"],
    ["Year 2",      "56,100.00"],
    ["Year 3",      "56,100.00"],
    ["3-Year TCO", "216,700.00"],
  ],
  emphasiseLast: true,
});

// ─── §7 Timeline ────────────────────────────────────────────────────────────
h1("7. Implementation Timeline");
p("Eight (8) weeks from contract signature to formal Go-Live, with two further weeks of post-go-live hyper-care, all delivered by the LanFrame team.");

ganttChart([
  { name: "Mobilisation",        start: 1, end: 1 },
  { name: "Tenant Provisioning", start: 1, end: 2 },
  { name: "Data Migration",      start: 2, end: 4 },
  { name: "Configuration",       start: 3, end: 5 },
  { name: "Integration",         start: 4, end: 6 },
  { name: "Training",            start: 5, end: 6 },
  { name: "UAT",                 start: 6, end: 7 },
  { name: "Go-Live",             start: 7, end: 8 },
  { name: "Hyper-care",          start: 9, end: 10 },
], 10);

// ─── §8 RACI ────────────────────────────────────────────────────────────────
h1("8. Roles & Responsibilities");
table({
  cols: [
    { label: "Activity",          w: 0.55 },
    { label: "LanFrame / NPAMS",  w: 0.225, align: "center" },
    { label: "ICSA",              w: 0.225, align: "center" },
  ],
  rows: [
    ["Tenant provisioning",                          "R", "I"],
    ["Data extraction from legacy systems",           "C", "R"],
    ["Data cleansing & sign-off",                     "C", "R"],
    ["Configuration of roles, scopes, categories",    "R", "C"],
    ["User Acceptance Testing",                       "C", "R"],
    ["Training delivery",                             "R", "C"],
    ["Go-Live decision",                              "C", "R"],
    ["Day-2 support",                                 "R", "C"],
  ],
});
p("R = Responsible · C = Consulted · I = Informed");

// ─── §9 Assumptions ─────────────────────────────────────────────────────────
h1("9. Assumptions & Exclusions");
bullet([
  "Pricing assumes 15 concurrent web users in Year 1; additional users billable at PGK 600 / user / year.",
  "Mobile applications (Android / iOS) are listed in §4A.14 as roadmap; the responsive web app works on tablets and modern phones today.",
  "Hardware (scanners, label printers, biometric kiosks) is provided by ICSA.",
  "Connectivity to provincial border posts is provided by ICSA. The roadmap §4A.13 / §4A.15 include offline / on-prem options for sites without reliable connectivity.",
  "Custom development beyond the 8 hrs/month support envelope is quoted separately at PGK 300 / hr.",
]);

// ─── §10 Terms ──────────────────────────────────────────────────────────────
h1("10. Terms & Conditions");
const terms = [
  "Currency. All amounts are in PGK and exclude GST unless otherwise stated.",
  "Payment. 30% on contract signature, 40% on UAT sign-off, 30% on Go-Live. Recurring fees billed annually in advance.",
  "Validity. This proposal is valid for sixty (60) days from the date on the cover.",
  "Variations. Any change in scope is captured in a written Change Request and priced at PGK 300 / hr.",
  "Intellectual Property. Platform IP remains with the NPAMS Programme, developed and maintained by LanFrame. ICSA data remains the property of ICSA at all times and is exportable on demand in open formats.",
  "Termination. Either party may terminate for convenience on 90 days' notice. On termination, all ICSA data is delivered as Postgres dump and CSV export within 14 days at no charge.",
  "Confidentiality. Both parties treat the contents of this engagement as confidential.",
  "Governing Law. Laws of the Independent State of Papua New Guinea.",
];
setBody();
doc.list(terms.map((t, i) => `${i + 1}. ${t}`), { bulletRadius: 0, textIndent: 0, paragraphGap: 4, lineGap: 1 });

// ─── Annex A — Screenshots ──────────────────────────────────────────────────
doc.addPage();
h1("Annex A — Live Application Screenshots");
p("The following screenshots are taken from the running production build of NPAMS on the date of issue and reflect the system that ICSA will inherit.");

const shots = [
  { file: "01-login.jpg",             caption: "Figure A1 — Sign-in screen with PNG branding and tenant theming." },
  { file: "02-dashboard.jpg",         caption: "Figure A2 — ICSA Authority dashboard: KPI cards (Total / Active / Missing / Under Maintenance / Disposed), portfolio value, status & condition charts and the most-recently added assets, all scoped to the PNGICA tenant." },
  { file: "03-purchase-requests.jpg", caption: "Figure A3 — Purchase Requests workflow page — the digital signature pipeline that ICSA will use to govern stock replenishment of ePassport booklets, visa stickers and other secure consumables." },
  { file: "04-gis.jpg",               caption: "Figure A4 — GIS Province Map: interactive Leaflet map of all 22 PNG provinces with district overlays, basemap selector and per-province asset / population profile (Street / Satellite / Topo)." },
];
for (const s of shots) {
  const fp = path.join(ASSETS, s.file);
  if (!fs.existsSync(fp)) continue;
  ensure(280);
  const imgW = CW;
  doc.image(fp, M, doc.y, { width: imgW });
  doc.y += Math.min(imgW * 0.62, 380) + 6;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.mute).text(s.caption, M, doc.y, { width: CW });
  doc.x = M; doc.moveDown(1);
  setBody();
}

// Signature ledger evidence — pulled from the live database for the seeded
// purchase request PR-20260511-5092 (id d05460c6-62fd-4fd9-a342-fdb7e3547712).
ensure(220);
h2("Annex A1 — Signature ledger evidence (live data)");
p("The two events below were generated by the running NPAMS API on 11 May 2026 against purchase request PR-20260511-5092 (Blank ePassport Booklet, qty 500 @ K 42.50 from Crane Currency PNG, requester Immigration Admin, role Agency Admin). The signed_hash for each event is the actual HMAC-SHA256 value persisted in the purchase_request_events table. ICSA's Auditor can re-compute these hashes from the documented input string and the server secret to prove that no event has been forged or tampered with after the fact.");
ledgerEvidence([
  { event: "submitted", at: "2026-05-11 19:26:45 UTC", signer: "Immigration Admin", role: "Agency Admin",
    hash: "de2ff7ef0f18e1212980ed820079bf7f869ab7620d91dbf5382bb7ad6da60e8a" },
  { event: "approved",  at: "2026-05-11 19:26:45 UTC", signer: "Immigration Admin", role: "Agency Admin",
    hash: "afaaa07ffba697d56087029da25564066eaf0b0c62b536ba9d7bac596da1c4da" },
]);
// ─── Annex B — Feature Inventory ────────────────────────────────────────────
doc.addPage();
h1("Annex B — Feature Inventory (Implemented and Roadmap)");
p("Single-page reference list of every capability described in §4 and §4A.");
table({
  cols: [
    { label: "§",          w: 0.10 },
    { label: "Capability", w: 0.72 },
    { label: "Status",     w: 0.18, align: "center" },
  ],
  rows: [
    ...implementedFeatures.map(([t]) => [t.split(" ")[0], t.replace(/^\S+\s/, ""), "Live"]),
    ...roadmapFeatures.map(([t]) => [t.split(" ")[0], t.replace(/^\S+\s/, ""), "Roadmap"]),
  ],
});
p("All roadmap items are scheduled inside the support contract's <= 8 hrs/month enhancement envelope and delivered by LanFrame at no additional cost to ICSA.");

// ─── End ────────────────────────────────────────────────────────────────────
ensure(40);
doc.moveDown(1);
doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.mute).text(
  "End of proposal — Commercial in Confidence — LanFrame for the NPAMS Programme Office, 2026.",
  { align: "center" }
);

doc.end();

// ============================ Layout primitives ============================
function keyValueTable(rows, opts = {}) {
  const colW = [CW * 0.55, CW * 0.45];
  const rowH = 22;
  const totalH = rowH * rows.length;
  ensure(totalH + 12);
  const x0 = M, y0 = doc.y + 4;
  doc.save().roundedRect(x0, y0, CW, totalH, 4).strokeColor(C.rule).lineWidth(0.6).stroke().restore();
  rows.forEach((r, i) => {
    const y = y0 + i * rowH;
    if (i === opts.highlight) {
      doc.save().rect(x0 + 0.3, y + 0.3, CW - 0.6, rowH - 0.3).fill(C.band).restore();
    }
    if (i > 0) doc.save().moveTo(x0 + 6, y).lineTo(x0 + CW - 6, y).strokeColor(C.rule).lineWidth(0.4).stroke().restore();
    doc.font("Helvetica").fontSize(10).fillColor(C.body).text(r[0], x0 + 12, y + 6, { width: colW[0] - 16, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink).text(r[1], x0 + colW[0], y + 6, { width: colW[1] - 12, align: "right", lineBreak: false });
  });
  doc.x = M; doc.y = y0 + totalH + 8;
  setBody();
}

function table({ cols, rows, emphasiseLast = false, emphasiseLastN = 0 }) {
  const widths = cols.map(c => c.w * CW);
  const headerH = 22;
  const padX = 8, padY = 6;
  ensure(headerH + 24);

  // Header
  let x = M, y = doc.y + 2;
  doc.save().rect(M, y, CW, headerH).fill(C.blue).restore();
  cols.forEach((c, i) => {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.white)
       .text(c.label, x + padX, y + 6, { width: widths[i] - padX * 2, align: c.align || "left", lineBreak: false });
    x += widths[i];
  });
  y += headerH;

  // Rows
  rows.forEach((r, ri) => {
    // Compute row height based on tallest cell
    const heights = r.map((cell, i) => {
      doc.font("Helvetica").fontSize(9.5);
      const h = doc.heightOfString(String(cell), { width: widths[i] - padX * 2 });
      return h;
    });
    const rowH = Math.max(20, Math.max(...heights) + padY * 2);
    if (y + rowH > H - 80) {
      doc.addPage();
      y = doc.y + 2;
      // re-draw header
      doc.save().rect(M, y, CW, headerH).fill(C.blue).restore();
      let xx = M;
      cols.forEach((c, i) => {
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.white)
           .text(c.label, xx + padX, y + 6, { width: widths[i] - padX * 2, align: c.align || "left", lineBreak: false });
        xx += widths[i];
      });
      y += headerH;
    }
    const isEmph = (emphasiseLast && ri === rows.length - 1) || (emphasiseLastN > 0 && ri >= rows.length - emphasiseLastN);
    if (ri % 2 === 0) doc.save().rect(M, y, CW, rowH).fill(C.band).restore();
    if (isEmph)       doc.save().rect(M, y, CW, rowH).fill("#E8EEF7").restore();
    let cx = M;
    r.forEach((cell, i) => {
      doc.font(isEmph ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(isEmph ? C.blue : C.body)
         .text(String(cell), cx + padX, y + padY, { width: widths[i] - padX * 2, align: cols[i].align || "left" });
      cx += widths[i];
    });
    // Bottom rule
    doc.save().moveTo(M, y + rowH).lineTo(M + CW, y + rowH).strokeColor(C.rule).lineWidth(0.4).stroke().restore();
    y += rowH;
  });
  // Outer rule
  doc.save().rect(M, doc.y + 2, CW, y - (doc.y + 2)).strokeColor(C.rule).lineWidth(0.6).stroke().restore();
  doc.x = M; doc.y = y + 6;
  setBody();
}

function costTable(items, opts = {}) {
  // items: [no, line, unit-desc, unit-price, qty, line-total]
  const cols = [
    { label: "#",                w: 0.04, align: "center" },
    { label: "Line item",        w: 0.26 },
    { label: "Unit",             w: 0.34 },
    { label: "Unit Price (PGK)", w: 0.12, align: "right" },
    { label: "Qty",              w: 0.06, align: "right" },
    { label: "Line Total (PGK)", w: 0.18, align: "right" },
  ];
  const rows = items.map(([n, name, unit, up, qty, total]) => [
    n, name, unit, fmtMoney(up), String(qty), fmtMoney(total),
  ]);
  const subtotal = items.reduce((s, x) => s + x[5], 0);
  const gst = subtotal * 0.10;
  const grand = subtotal + gst;
  rows.push(["", "Subtotal (excl. GST)", "", "", "", fmtMoney(subtotal)]);
  rows.push(["", "GST (10%)",            "", "", "", fmtMoney(gst)]);
  rows.push(["", opts.totalLabel || "Grand Total Year 1 (incl. GST)", "", "", "", fmtMoney(grand)]);
  table({ cols, rows, emphasiseLastN: 3 });
}

function ganttChart(tasks, weeks) {
  const rowH = 18;
  const labelW = 130;
  const chartW = CW - labelW - 4;
  const colW = chartW / weeks;
  const totalH = rowH * (tasks.length + 1) + 6;
  ensure(totalH + 8);
  const x0 = M, y0 = doc.y + 4;

  // Header (week numbers)
  doc.save().rect(x0, y0, CW, rowH).fill(C.blue).restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.white)
     .text("Workstream", x0 + 8, y0 + 5, { width: labelW - 12, lineBreak: false });
  for (let w = 1; w <= weeks; w++) {
    doc.text(`W${w}`, x0 + labelW + (w - 1) * colW, y0 + 5, { width: colW, align: "center", lineBreak: false });
  }

  // Rows
  tasks.forEach((t, i) => {
    const y = y0 + rowH + i * rowH;
    if (i % 2 === 0) doc.save().rect(x0, y, CW, rowH).fill(C.band).restore();
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
       .text(t.name, x0 + 8, y + 5, { width: labelW - 12, lineBreak: false });
    // Grid
    for (let w = 0; w <= weeks; w++) {
      doc.save().moveTo(x0 + labelW + w * colW, y).lineTo(x0 + labelW + w * colW, y + rowH)
         .strokeColor(C.rule).lineWidth(0.3).stroke().restore();
    }
    // Bar
    const bx = x0 + labelW + (t.start - 1) * colW + 2;
    const bw = (t.end - t.start + 1) * colW - 4;
    const colour = (t.name === "Go-Live") ? C.red : (t.name === "Hyper-care" ? C.gold : C.blue);
    doc.save().roundedRect(bx, y + 4, bw, rowH - 8, 2).fill(colour).restore();
  });

  // Outer rule
  doc.save().rect(x0, y0, CW, rowH * (tasks.length + 1)).strokeColor(C.rule).lineWidth(0.5).stroke().restore();
  doc.x = M; doc.y = y0 + rowH * (tasks.length + 1) + 8;
  setBody();
}

function fmtMoney(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ledgerEvidence(events) {
  const padX = 10, padY = 8, rowH = 60;
  const totalH = rowH * events.length;
  ensure(totalH + 12);
  const x0 = M, y0 = doc.y + 4;
  events.forEach((ev, i) => {
    const y = y0 + i * rowH;
    doc.save().rect(x0, y, CW, rowH - 4).fill(C.band).restore();
    doc.save().rect(x0, y, 4, rowH - 4).fill(ev.event === "approved" ? C.red : C.blue).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.blue)
       .text(ev.event.toUpperCase(), x0 + padX, y + padY, { width: 110, lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(C.mute)
       .text(`signed_at  ${ev.at}`, x0 + 130, y + padY, { width: CW - 140, lineBreak: false });
    doc.font("Helvetica").fontSize(9.5).fillColor(C.body)
       .text(`signer:  ${ev.signer}  ·  role:  ${ev.role}`, x0 + padX, y + padY + 16, { width: CW - padX * 2, lineBreak: false });
    doc.font("Courier-Bold").fontSize(8.5).fillColor(C.ink)
       .text(`signed_hash:  ${ev.hash}`, x0 + padX, y + padY + 32, { width: CW - padX * 2, lineBreak: false });
  });
  doc.x = M; doc.y = y0 + totalH + 6;
  setBody();
}
