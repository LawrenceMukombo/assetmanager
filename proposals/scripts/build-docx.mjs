// Generate proposals/ICSA-NPAMS-Proposal.docx
// Comprehensive sponsor proposal styled to match build-pdf.mjs:
//   PNG flag-stripe header bar, ICSA-blue cover band with gold/red rule,
//   "AT A GLANCE" card, Helvetica typography, banded section headings,
//   alternating-row tables, three-text footer. Covers every implemented
//   and proposed NPAMS feature. Built and supported by LanFrame.

import {
  Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, Footer, Header, PageNumber, ImageRun,
  convertInchesToTwip, HeightRule,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "ICSA-NPAMS-Proposal.docx");
const ASSETS = path.join(ROOT, "assets");
const LOGO = path.resolve(ROOT, "..", "artifacts/npams-web/public/agencies/pngica.png");

// PDF colour palette
const C = {
  blue: "0F4C81",
  red:  "CE1126",
  gold: "FCD116",
  ink:  "0B1B2B",
  body: "1F2A37",
  mute: "52606D",
  rule: "D8DEE6",
  band: "F2F5F9",
  white:"FFFFFF",
};
const FONT = "Helvetica";

// ─── helpers ───────────────────────────────────────────────────────────────
function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 290 },
    alignment: opts.alignment,
    children: Array.isArray(text)
      ? text
      : [new TextRun({ text, font: FONT, size: 21, color: C.body, ...(opts.run || {}) })],
  });
}
function h1(text) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 60 },
      children: [new TextRun({ text, bold: true, size: 36, color: C.blue, font: FONT })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { color: C.red, style: BorderStyle.SINGLE, size: 18, space: 1 } },
      children: [new TextRun({ text: "", size: 2 })],
      indent: { left: 0, right: 8800 },
    }),
  ];
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    children: [new TextRun({ text, bold: true, size: 25, color: C.ink, font: FONT })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, color: C.blue, font: FONT })],
  });
}
function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 280 },
    children: Array.isArray(text)
      ? text
      : [new TextRun({ text, font: FONT, size: 21, color: C.body })],
  });
}
function tx(text, opts = {}) {
  return new TextRun({ text: String(text), font: FONT, size: 20, color: C.body, ...opts });
}
function cell(text, opts = {}) {
  const { bold = false, header = false, align, color, shade, width } = opts;
  const txt = String(text);
  const isNumeric = /^[\d().,K\-+%PGK$ \u2013\u2014]+$/.test(txt) || /^\d/.test(txt);
  return new TableCell({
    width,
    shading: shade ? { type: ShadingType.CLEAR, color: "auto", fill: shade } : undefined,
    margins: { top: 100, bottom: 100, left: 110, right: 110 },
    children: [new Paragraph({
      alignment: align ?? (header ? AlignmentType.LEFT : (isNumeric && !header ? AlignmentType.RIGHT : AlignmentType.LEFT)),
      children: [new TextRun({
        text: txt,
        bold: bold || header,
        font: FONT,
        size: header ? 19 : 19,
        color: color ?? (header ? C.white : C.body),
      })],
    })],
  });
}
function makeTable(header, rows, colWidths) {
  const widths = colWidths || Array(header.length).fill(Math.floor(9000 / header.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: C.rule },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: C.rule },
      left: { style: BorderStyle.SINGLE, size: 4, color: C.rule },
      right: { style: BorderStyle.SINGLE, size: 4, color: C.rule },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C.rule },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: C.rule },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        height: { value: 380, rule: HeightRule.ATLEAST },
        children: header.map((h, i) => cell(h, {
          header: true, shade: C.blue,
          width: { size: widths[i], type: WidthType.DXA },
        })),
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => {
          const o = (typeof c === "object" && c !== null) ? c : { text: c };
          return cell(o.text, {
            bold: o.bold, align: o.align,
            shade: ri % 2 === 1 ? C.band : undefined,
            width: { size: widths[i], type: WidthType.DXA },
          });
        }),
      })),
    ],
  });
}
function blankLine(size = 120) {
  return new Paragraph({ children: [new TextRun({ text: " ", font: FONT })], spacing: { after: size } });
}
function img(filename, w = 540, h = 320) {
  const file = path.join(ASSETS, filename);
  if (!fs.existsSync(file)) return P(`[Screenshot ${filename} not found]`);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 60 },
    children: [new ImageRun({
      data: fs.readFileSync(file),
      transformation: { width: w, height: h },
    })],
  });
}
function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text, italics: true, color: C.mute, size: 18, font: FONT })],
  });
}

// ─── Cover ─────────────────────────────────────────────────────────────────
function bandRow(color, height = 50) {
  return new TableRow({
    height: { value: height, rule: HeightRule.EXACT },
    children: [new TableCell({
      width: { size: 100, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: color },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      },
      children: [new Paragraph({ children: [new TextRun({ text: " ", size: 2 })] })],
    })],
  });
}
function buildCover() {
  // ICSA-blue band with title and subtitle
  const titleBand = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({
      height: { value: 4400, rule: HeightRule.EXACT },
      children: [new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: C.blue },
        margins: { top: 600, bottom: 400, left: 0, right: 0 },
        children: [
          fs.existsSync(LOGO) ? new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new ImageRun({ data: fs.readFileSync(LOGO), transformation: { width: 110, height: 110 } })],
          }) : new Paragraph({ children: [new TextRun({ text: " " })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "Asset Management System", bold: true, size: 56, color: C.white, font: FONT })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "Sponsor Proposal — Year 1 Implementation & Annual Operations",
                                    size: 26, color: C.gold, font: FONT })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Prepared for the PNG Immigration & Citizenship Authority",
                                     bold: true, size: 22, color: C.white, font: FONT })],
          }),
        ],
      })],
    })],
  });

  // Gold + red flag rule directly below the band
  const flagRule = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
               left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
               insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [bandRow(C.gold, 90), bandRow(C.red, 60)],
  });

  // "AT A GLANCE" card
  const at = [
    ["REFERENCE",     "NPAMS-ICSA-2026-002"],
    ["ISSUED",        "11 May 2026"],
    ["VALIDITY",      "60 days from issue"],
    ["YEAR 1 TOTAL",  "PGK 104,500.00 incl. GST"],
    ["TIME TO LIVE",  "8 weeks from contract signature"],
    ["USERS",         "15 concurrent web users included"],
    ["HOSTING",       "PNG-resident SaaS, autoscaling, 99.5% SLA"],
    ["DELIVERY",      "Built and supported by LanFrame for the NPAMS Programme"],
  ];
  const card = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: C.rule },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: C.rule },
      left: { style: BorderStyle.SINGLE, size: 6, color: C.rule },
      right: { style: BorderStyle.SINGLE, size: 6, color: C.rule },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C.rule },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: C.rule },
    },
    rows: [
      new TableRow({
        children: [new TableCell({
          shading: { type: ShadingType.CLEAR, color: "auto", fill: C.band },
          margins: { top: 120, bottom: 120, left: 200, right: 200 },
          columnSpan: 2,
          children: [new Paragraph({ children: [new TextRun({ text: "AT A GLANCE", bold: true, size: 22, color: C.blue, font: FONT })] })],
        })],
      }),
      ...at.map(([k, v]) => new TableRow({
        children: [
          new TableCell({
            width: { size: 2400, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: C.band },
            margins: { top: 80, bottom: 80, left: 200, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 18, color: C.mute, font: FONT })] })],
          }),
          new TableCell({
            width: { size: 6600, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: C.white },
            margins: { top: 80, bottom: 80, left: 100, right: 200 },
            children: [new Paragraph({ children: [new TextRun({ text: v, size: 21, color: C.ink, font: FONT })] })],
          }),
        ],
      })),
    ],
  });

  return [
    titleBand,
    flagRule,
    blankLine(160),
    card,
    blankLine(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "Prepared by", bold: true, size: 22, color: C.blue, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "LanFrame, on behalf of the NPAMS Programme Office",
                               size: 22, color: C.ink, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Independent State of Papua New Guinea",
                               size: 22, color: C.ink, font: FONT })],
    }),
    blankLine(800),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "COMMERCIAL IN CONFIDENCE",
                               italics: true, size: 18, color: C.red, font: FONT })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── Body content ──────────────────────────────────────────────────────────
const body = [];

body.push(...h1("1. Executive Summary"));
body.push(P("The PNG Immigration & Citizenship Authority (ICSA) requires a single, auditable system of record for the high-value assets it operates on behalf of the State — blank ePassport stocks, visa stickers, biometric workstations, secure printers, inspection kits and the supporting estate at headquarters and provincial border posts."));
body.push(P("The National Public Asset Management System (NPAMS) has been built specifically for the PNG public sector by LanFrame and is already live, multi-tenant and integrated with the Government's geographic data set. This proposal sets out the activities, timeline and commercials required to onboard ICSA onto NPAMS as an Authority tenant alongside other PNG agencies already provisioned (PNGDF, RPNGC, IRC, Treasury, Customs, Ombudsman). It supersedes proposal NPAMS-ICSA-2026-001 and adds a complete, line-by-line description of every feature already delivered as well as the planned roadmap items, so ICSA can make a fully informed sponsorship decision."));
body.push(h3("Headline figures"));
body.push(makeTable(
  ["Headline", "Figure"],
  [
    ["Total programme cost (Year 1, incl. GST)", { text: "PGK 104,500.00", bold: true }],
    ["Time to go-live", "8 weeks from contract signature"],
    ["Concurrent web users included", "15"],
    ["Implemented features (live today)", "30 major capabilities, all in production"],
    ["Roadmap features (this proposal)", "21 additional capabilities, costed under §6"],
    ["Hosting", "PNG-resident SaaS, autoscaling, 99.5% monthly uptime SLA"],
    ["Delivery partner", "LanFrame for the NPAMS Programme Office"],
  ],
  [4500, 4500],
));
body.push(P("NPAMS is delivered as a hosted, autoscaling PNG-resident SaaS platform with a defined Service Level Agreement, encrypted data at rest, RBAC scoped down to facility level, and tamper-evident HMAC-SHA256 digital signatures on every purchase, approval and goods-receipt event."));

body.push(...h1("2. About NPAMS and LanFrame"));
body.push(P("NPAMS is the State-sponsored asset management platform for PNG, designed and operated by LanFrame on behalf of the NPAMS Programme Office. It is currently in production for seven Authorities, each in its own logical tenant with its own branding, scope and roles:"));
[
  "PNG Defence Force (PNGDF)",
  "Royal Papua New Guinea Constabulary (RPNGC)",
  "Internal Revenue Commission (IRC)",
  "Department of Treasury",
  "PNG Customs Service (PNGCS)",
  "Office of the Ombudsman",
  "PNG Immigration & Citizenship Authority (this proposal)",
].forEach(t => body.push(bullet(t)));
body.push(P("Because NPAMS is multi-tenant from the database upward, ICSA does not pay for a new build — only for its onboarding, configuration, migration, training, hosting and ongoing support. There is no platform IP licence fee charged to ICSA above and beyond the per-user subscription described in §6. LanFrame remains accountable for the platform's roadmap, security posture and SLA throughout the engagement."));

body.push(...h1("3. Asset Categories in Scope"));
body.push(P("NPAMS organises every ICSA asset into one of three top-level groups. Each asset category carries a short code (BLD, VEH, ICT, OFF, MED, MCH, COM) which becomes the [TYPE] segment of the auto-suggested asset tag — for example PNGICA-VEH-014 for the next vehicle, PNGICA-ICT-027 for the next biometric workstation. Categories are configurable and ICSA Asset Officers can add sub-classes without vendor intervention."));
body.push(makeTable(
  ["Group", "Sub-classes", "Examples"],
  [
    ["Digital & IT", "ICT Hardware, Office Equipment, Software Licences, Network & Cyber assets", "Biometric capture stations, fingerprint and document scanners, secure printers, servers, workstations, laptops, photocopiers, switches / routers / firewalls, software entitlements"],
    ["Physical & Operational", "Secure Stock, Furniture & Fittings, Border Post Estate, Uniforms & PPE", "Blank ePassport booklets (32 / 64-page), visa stickers, security inks, holographic foils, office furniture, secure cabinets and safes, buildings, perimeter fencing, signage, inspection lanes, officer uniforms, body armour, inspection PPE"],
    ["Mobile & Distributed", "Vehicles & Plant, Mobile Biometric Kits, Field Equipment, Generators / UPS", "Pool vehicles, patrol vehicles, marine craft, generators, UPS units, ruggedised mobile enrolment kits, handheld document readers deployed across border posts and provincial offices"],
  ],
  [1800, 3500, 4000],
));
body.push(P("Every asset record carries: unique asset code, category, location (province → district → facility), custodian, acquisition cost, depreciation, condition, service history, photographs, and a public verification QR code."));

// ── Implemented ────────────────────────────────────────────────────────────
body.push(...h1("4. Implemented Features — Live in Production"));
body.push(P("The 30 capabilities below are running on the NPAMS production build dated 11 May 2026. They will be enabled for ICSA on day one. Each capability lists the business outcome and the underlying NPAMS module that delivers it."));

const implemented = [
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
   "On any asset detail page the officer can step through the filtered match set with ← / → keyboard shortcuts or on-screen Prev/Next buttons. The same pattern now also works on stock, audit session and purchase request detail pages."],
  ["4.11 Global asset search",
   "A debounced search box in the header queries assets by tag, name and serial number, shows a top-N preview with recent searches persisted to localStorage, and forwards the query into the asset detail stepper so the user can walk through every match."],
  ["4.12 Public QR verification page",
   "A printable QR code on every asset links to a /public/asset/:id page open to the world (no login). Auditors and field officers verify name, agency and condition on a phone in seconds."],
  ["4.13 Asset photos and documents in object storage",
   "Browser uploads via short-lived signed URLs to Replit Object Storage / Google Cloud Storage. Public objects (logos) and private objects (asset photographs, signed documents) are served through scope-aware proxy routes."],
  ["4.14 Stock and inventory",
   "On-hand quantity, unit of measure, reorder level, supplier and unit cost per stock item; auto-suggested item codes of the form PNGICA-STK-014; per-facility stock balances; movement ledger (receipt / issue / transfer / adjustment) with full audit trail."],
  ["4.15 Track stock by storage location",
   "Stock is tracked per facility, not just per item. ICSA's HQ vault, regional offices, sea ports and border posts each have their own balances, reorder thresholds and movement history."],
  ["4.16 One-click reorder purchase request",
   "From any low-stock balance an officer can raise a purchase request in one click. The request inherits the facility, supplier and prior unit cost; the requester only types the quantity and an optional note."],
  ["4.17 Purchase request workflow",
   "Officer raises a request → routed to scoped approvers → approve / reject → goods receipt against the request, with automatic close when the full quantity is received. Pipeline is visible by status and filterable by agency, province, district and facility."],
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
   "Province → district → facility hierarchy with auto-suggested district codes, ICSA-specific facility allow-list (HQ Konedobu, Waigani / Jacksons Airport, regional offices Lae / Mt Hagen / Kokopo / Madang / Kavieng, sea ports Lae / Rabaul / Daru / Alotau, border posts Wutung / Vanimo / Kiunga). Other agencies retain their full national list — there is no regression."],
  ["4.29 User and role administration",
   "Create, deactivate and reactivate users; assign roles and scopes; reset passwords. ICSA receives 14 seeded staff users covering the agency admin, provincial admins, asset officers, auditors and field officers; the demo password Admin1234! is rotated on first login."],
  ["4.30 Theme and dark-mode polish",
   "All status pills, dashboard charts and KPI tiles use semantic theme tokens (--success / --warning / --destructive / --muted-foreground) so dark mode is fully readable. Every page has been migrated to the shared PageHeader component for breadcrumbs, icons and consistent action layout."],
];
implemented.forEach(([t, d]) => { body.push(h3(t)); body.push(P(d)); });

// ── Roadmap ────────────────────────────────────────────────────────────────
body.push(...h1("5. Roadmap Features — Costed in This Proposal"));
body.push(P("The 21 capabilities below are formally on the NPAMS backlog, planned and ready to schedule under the implementation programme described in §8. Total effort fits within the 8 hrs/month enhancement envelope built into the Year-1 commercials."));

const proposed = [
  ["5.1 Real backup history and live system metrics",
   "The System Status page will surface the actual backup catalogue (last successful run, size, retention class, restore-tested flag), DB latency, queue depth and disk-free percentages so the ICSA Authority and the Auditor-General can confirm the operational posture without phoning the help-desk."],
  ["5.2 Low-stock alerts on the dashboard",
   "Low-stock balances surface as a card on the home dashboard with a one-click jump to the affected facility and the pre-filled reorder action; an early-warning indicator for high-value secure stock such as ePassport booklets and visa stickers."],
  ["5.3 Bulk-edit reorder thresholds",
   "Update reorder levels for many facilities at once — for example raising the visa-sticker threshold across all sea-port facilities ahead of a holiday peak."],
  ["5.4 Tighten API parameter typing",
   "Internal hardening sweep that removes a small set of pre-existing TypeScript any-leaks in the route handlers, removing a known noise source from future change reviews. No user-visible change."],
  ["5.5 Email and push alerts on PR status changes",
   "Outbound notifications (email by default; push optional) when a request is submitted, approved, rejected or received. Recipients are derived from the same scope rules used in the application; no separate distribution list to maintain."],
  ["5.6 Supplier performance and price history",
   "Per-stock-item supplier ledger: average lead time, on-time-in-full percentage and unit-cost trend. Feeds directly into procurement decision-making for ePassport supply, holographic foils and inspection consumables."],
  ["5.7 Automated tests for the reorder approval workflow",
   "End-to-end Playwright tests that reproduce the full one-click reorder → approve → receive → close cycle on every release build, so the signed-event chain cannot regress unnoticed."],
  ["5.8 Verify the integrity of every signed approval",
   "An ICSA Auditor screen that re-computes the HMAC-SHA256 hash for every purchase_request_events row from the canonical input string and the server secret, and reports any mismatch — turning the existing append-only ledger into a one-button integrity proof."],
  ["5.9 Purchase-request alerts in the bell-icon tray",
   "Pending-approval and goods-receipt events appear in the in-app notification tray for the relevant approver / requester, in addition to the existing inbox."],
  ["5.10 Sponsor proposal collateral refresh",
   "LanFrame maintains the sponsor proposal collateral set, including the offline / on-prem option page and glossary referenced in §10. This document is the comprehensive edition of that set."],
  ["5.11 Show category code in reports and dashboard breakdowns",
   "Reports and dashboard category groupings render the short code (BLD, VEH, ICT…) next to the long category name, completing the work started in §4.8."],
  ["5.12 Test that two categories cannot share a code",
   "Add an automated test for the database uniqueness constraint shipped in §4.8, so admins cannot create a duplicate code and quietly destabilise the asset-tag suggester."],
  ["5.13 Windows desktop installer",
   "An MSI / EXE installer for Windows so an ICSA workstation administrator can roll out NPAMS on the corporate desktop fleet via Group Policy. Ships the same web bundle inside a WebView2 shell with auto-update."],
  ["5.14 Android mobile app",
   "A signed APK / Play Store build for field officers conducting audits and goods receipts. Uses the existing public QR endpoint, the camera and GPS, and works offline against a local cache."],
  ["5.15 One-page on-prem deployment runbook for ICSA",
   "A printable runbook for an ICSA on-prem server: pre-requisites, install steps, backup configuration, certificate rotation and verification checks. Supports the offline option for sites without reliable connectivity."],
  ["5.16 Maintenance and audit events inline on asset history",
   "The asset detail page already shows transfers; this work folds in maintenance jobs and audit results so the lifecycle is a single, ordered timeline."],
  ["5.17 Export an asset's full history to PDF",
   "One-click PDF export of the asset detail page (specifications, transfers, maintenance, audit results, photos) for evidence packs and divestment paperwork."],
  ["5.18 Top-bar search across stock, audits and PRs",
   "Extends the global asset search (§4.11) to also cover stock items, audit sessions and purchase requests."],
  ["5.19 Full search results page for large match sets",
   "When the top-bar preview is not enough, a dedicated results page lists every match with filter chips and pagination."],
  ["5.20 Audit-assignment stepper for officers",
   "Officers stepping through their pending audit assignments in the field can move ←/→ between assignments with a single key, mirroring the asset and PR steppers."],
  ["5.21 Dark-mode pass for audit, maintenance and public pages",
   "Completes the theme-token migration started in §4.30 by sweeping the remaining surfaces (audit, maintenance and the public verification page) so contrast and badge colours are correct in dark mode."],
];
proposed.forEach(([t, d]) => { body.push(h3(t)); body.push(P(d)); });

// ── Governance ────────────────────────────────────────────────────────────
body.push(...h1("6. Governance, Security & Compliance"));
body.push(makeTable(
  ["Area", "NPAMS control"],
  [
    ["Authentication", "Bcrypt-hashed passwords; JWT session tokens with short TTL (8 h access, 7 d refresh, hashes stored server-side); lockout-friendly endpoints."],
    ["Authorisation", "Role-Based Access Control with scope filtering at the data layer (national, agency, province, district, facility)."],
    ["Digital signatures", "HMAC-SHA256 keyed by server secret on every purchase / approval / receipt event — verifiable, non-repudiable, replay-resistant."],
    ["Audit log", "Append-only activity_logs and purchase_request_events; workflow events additionally signed by the actor with HMAC-SHA256."],
    ["Data residency", "Hosted in PNG-accessible cloud region; daily encrypted backups retained 30 days."],
    ["Data in transit", "TLS 1.2+ end-to-end."],
    ["Data at rest", "AES-256 encryption at the storage layer."],
    ["PII", "Limited to officer profile data needed for workflow attribution; no citizen biometric data is processed."],
    ["Disaster Recovery", "RPO 24 h, RTO 8 h. Documented runbook handed over at Go-Live."],
    ["Service Level", "99.5% monthly uptime; P1 response 1 h, P2 response 4 h, P3 next business day."],
    ["Vulnerability management", "Monthly dependency CVE scan; SAST run on every release; critical CVEs patched within 7 days, high within 30 days; quarterly external penetration test summary delivered to ICSA."],
  ],
  [2200, 6800],
));

// ── Commercials ────────────────────────────────────────────────────────────
body.push(...h1("7. Commercials"));
body.push(P("All amounts in Papua New Guinea Kina (PGK). GST applied at 10% per the Goods and Services Tax Act 2003."));

body.push(h3("7.1 Year 1 cost build-up"));
body.push(makeTable(
  ["#", "Line item", "Unit", "Unit price (PGK)", "Qty", "Line total (PGK)"],
  [
    ["1", "Platform Licence — Year 1", "Named concurrent web user / year", "600.00", "15", "9,000.00"],
    ["2", "Implementation & Configuration", "Fixed-price work package (one-off)", "28,000.00", "1", "28,000.00"],
    ["3", "Data Migration & Seeding", "Fixed-price work package (one-off)", "8,500.00", "1", "8,500.00"],
    ["4", "User Training", "Classroom / online session", "2,500.00", "3", "7,500.00"],
    ["5", "Cloud Hosting (12 months)", "Hosting bundle / month", "1,000.00", "12", "12,000.00"],
    ["6", "Annual Support & Maintenance — Year 1", "SLA support bundle / month (incl. ≤ 8 hrs/mo enhancements covering §5 roadmap)", "2,500.00", "12", "30,000.00"],
    [{ text: "" }, { text: "Subtotal (excl. GST)", bold: true }, "", "", "", { text: "95,000.00", bold: true }],
    [{ text: "" }, { text: "GST (10%)", bold: true }, "", "", "", { text: "9,500.00", bold: true }],
    [{ text: "" }, { text: "Grand Total Year 1 (incl. GST)", bold: true }, "", "", "", { text: "104,500.00", bold: true }],
  ],
  [500, 3000, 2200, 1100, 600, 1600],
));

body.push(h3("7.2 Recurring cost — Year 2 onwards"));
body.push(makeTable(
  ["#", "Line item", "Unit", "Unit price (PGK)", "Qty", "Line total (PGK)"],
  [
    ["1", "Platform Licence", "Named concurrent web user / year", "600.00", "15", "9,000.00"],
    ["2", "Cloud Hosting", "Hosting bundle / month", "1,000.00", "12", "12,000.00"],
    ["3", "Annual Support & Maintenance", "SLA support bundle / month", "2,500.00", "12", "30,000.00"],
    [{ text: "" }, { text: "Subtotal (excl. GST)", bold: true }, "", "", "", { text: "51,000.00", bold: true }],
    [{ text: "" }, { text: "GST (10%)", bold: true }, "", "", "", { text: "5,100.00", bold: true }],
    [{ text: "" }, { text: "Recurring Total / yr (incl. GST)", bold: true }, "", "", "", { text: "56,100.00", bold: true }],
  ],
  [500, 3000, 2200, 1100, 600, 1600],
));
body.push(P("Additional concurrent users may be added at any time at PGK 600 / user / year (prorated). No volume change requires a re-contract."));

body.push(h3("7.3 Three-year total cost of ownership"));
body.push(makeTable(
  ["Year", "Incl. GST (PGK)"],
  [
    ["Year 1", "104,500.00"],
    ["Year 2", "56,100.00"],
    ["Year 3", "56,100.00"],
    [{ text: "3-Year TCO", bold: true }, { text: "216,700.00", bold: true }],
  ],
  [4500, 4500],
));

// ── Timeline ──────────────────────────────────────────────────────────────
body.push(...h1("8. Implementation Timeline"));
body.push(P("Eight (8) weeks from contract signature to formal Go-Live, with a further two weeks of post-go-live hyper-care, all delivered by the LanFrame team."));
body.push(makeTable(
  ["Week", "Workstream", "Activity"],
  [
    ["1", "Mobilisation", "Kick-off, governance set-up, secure data-sharing agreement signed"],
    ["1–2", "Tenant Provisioning", "ICSA tenant created, branding loaded, roles & RBAC scopes configured"],
    ["2–4", "Data Migration", "Asset register, stock items, locations and custodian data migrated; UAT data set loaded"],
    ["3–5", "Configuration", "Categories, audit checklists, maintenance schedules, notification rules"],
    ["4–6", "Integration", "SSO-ready identity stub, file-storage bucket, public QR endpoint"],
    ["5–6", "Training", "Asset Officer (1 day), Agency Admin (1 day), Auditors (½ day)"],
    ["6–7", "UAT", "ICSA business sign-off across all in-scope modules"],
    ["7–8", "Go-Live", "Production cut-over, hand-over runbook, DR drill"],
    ["9–10", "Hyper-care", "On-site support, defect triage, performance tuning"],
  ],
  [800, 2400, 5800],
));

// ── Roles & Resp ──────────────────────────────────────────────────────────
body.push(...h1("9. Roles & Responsibilities"));
body.push(makeTable(
  ["Activity", "LanFrame / NPAMS", "ICSA"],
  [
    ["Tenant provisioning", "R", "I"],
    ["Data extraction from legacy systems", "C", "R"],
    ["Data cleansing & sign-off", "C", "R"],
    ["Configuration of roles, scopes, categories", "R", "C"],
    ["User Acceptance Testing", "C", "R"],
    ["Training delivery", "R", "C"],
    ["Go-Live decision", "C", "R"],
    ["Day-2 support", "R", "C"],
  ],
  [5400, 2100, 1500],
));
body.push(P("(R = Responsible, C = Consulted, I = Informed)"));

// ── Assumptions ───────────────────────────────────────────────────────────
body.push(...h1("10. Assumptions & Exclusions"));
[
  "Pricing assumes 15 concurrent web users in Year 1; additional users billable at PGK 600 / user / year.",
  "Mobile applications (Android / iOS) are listed in §5.14 as roadmap; the responsive web app works on tablets and modern phones today.",
  "Hardware (scanners, label printers, biometric kiosks) is provided by ICSA.",
  "Connectivity to provincial border posts is provided by ICSA. The roadmap §5.13 / §5.15 include offline / on-prem options for sites without reliable connectivity.",
  "Custom development beyond the 8 hrs/month support envelope is quoted separately at PGK 300 / hr.",
].forEach(t => body.push(bullet(t)));

// ── T&C ──────────────────────────────────────────────────────────────────
body.push(...h1("11. Terms & Conditions"));
[
  "Currency. All amounts are in PGK and exclude GST unless otherwise stated.",
  "Payment. 30% on contract signature, 40% on UAT sign-off, 30% on Go-Live. Recurring fees billed annually in advance.",
  "Validity. This proposal is valid for sixty (60) days from the date on the cover.",
  "Variations. Any change in scope is captured in a written Change Request and priced at PGK 300 / hr.",
  "Intellectual Property. Platform IP remains with the NPAMS Programme, developed and maintained by LanFrame. ICSA data remains the property of ICSA at all times and is exportable on demand in open formats.",
  "Termination. Either party may terminate for convenience on 90 days' notice. On termination, all ICSA data is delivered as Postgres dump and CSV export within 14 days at no charge.",
  "Confidentiality. Both parties treat the contents of this engagement as confidential.",
  "Governing Law. Laws of the Independent State of Papua New Guinea.",
].forEach((t, i) => body.push(bullet(`${i + 1}. ${t}`)));

// ── Annex A ──────────────────────────────────────────────────────────────
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(...h1("Annex A — Live Application Screenshots"));
body.push(P("Captured from the running production build on 11 May 2026 — the system ICSA will inherit on day one."));
body.push(img("01-login.jpg"));
body.push(caption("Figure A1 — Sign-in screen with PNG branding and tenant theming."));
body.push(img("02-dashboard.jpg"));
body.push(caption("Figure A2 — ICSA Authority dashboard scoped to the PNGICA tenant."));
body.push(img("03-purchase-requests.jpg"));
body.push(caption("Figure A3 — Purchase Requests workflow page (HMAC-signed pipeline)."));
body.push(img("04-gis.jpg"));
body.push(caption("Figure A4 — GIS Province Map (Leaflet, all 22 PNG provinces)."));

body.push(h2("Annex A1 — Signature ledger evidence (live data)"));
body.push(P("The two events below were generated by the running NPAMS API on 11 May 2026 against purchase request PR-20260511-5092 (Blank ePassport Booklet, qty 500 @ K 42.50 from Crane Currency PNG). The signed_hash for each event is the actual HMAC-SHA256 value persisted in the purchase_request_events table. ICSA's Auditor can re-compute these hashes from the documented input string and the server secret to prove no event has been tampered with."));
body.push(makeTable(
  ["Event", "Signed at (UTC)", "Signer", "Role", "signed_hash (HMAC-SHA256, hex)"],
  [
    ["submitted", "2026-05-11 19:26:45", "Immigration Admin", "Agency Admin", "de2ff7ef0f18e1212980ed820079bf7f869ab7620d91dbf5382bb7ad6da60e8a"],
    ["approved",  "2026-05-11 19:26:45", "Immigration Admin", "Agency Admin", "afaaa07ffba697d56087029da25564066eaf0b0c62b536ba9d7bac596da1c4da"],
  ],
  [1300, 2200, 1700, 1500, 2300],
));

// ── Annex B — feature inventory ──────────────────────────────────────────
body.push(...h1("Annex B — Feature Inventory (Implemented and Roadmap)"));
body.push(P("Single-page reference list of every capability described in §4 and §5."));
body.push(makeTable(
  ["§", "Capability", "Status"],
  [
    ...implemented.map(([t]) => [t.split(" ")[0], t.replace(/^\S+\s/, ""), "Live"]),
    ...proposed.map(([t]) => [t.split(" ")[0], t.replace(/^\S+\s/, ""), "Roadmap"]),
  ],
  [800, 6700, 1500],
));

body.push(blankLine(240));
body.push(P("End of proposal — Commercial in Confidence — LanFrame for the NPAMS Programme Office, 2026.",
  { alignment: AlignmentType.CENTER, run: { italics: true, color: C.mute, size: 18 } }));

// ─── Document ──────────────────────────────────────────────────────────────
const flagStripeHeader = new Header({
  children: [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
               left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
               insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({
      height: { value: 60, rule: HeightRule.EXACT },
      children: [
        new TableCell({
          width: { size: 55, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: C.blue },
          children: [new Paragraph({ children: [new TextRun({ text: " ", size: 2 })] })],
        }),
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: C.gold },
          children: [new Paragraph({ children: [new TextRun({ text: " ", size: 2 })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: C.red },
          children: [new Paragraph({ children: [new TextRun({ text: " ", size: 2 })] })],
        }),
      ],
    })],
  }), new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 60 },
    children: [new TextRun({ text: "NPAMS Programme · ICSA Asset Management Proposal · NPAMS-ICSA-2026-002",
                             color: C.mute, size: 16, font: FONT })],
  })],
});

const docFooter = new Footer({
  children: [new Paragraph({
    border: { top: { color: C.rule, style: BorderStyle.SINGLE, size: 4, space: 1 } },
    spacing: { before: 80 },
    children: [
      new TextRun({ text: "LanFrame · NPAMS Programme Office", font: FONT, size: 16, color: C.mute }),
      new TextRun({ text: "    ·    ", font: FONT, size: 16, color: C.mute }),
      new TextRun({ text: "Commercial in Confidence", font: FONT, size: 16, color: C.mute, italics: true }),
      new TextRun({ text: "    ·    Page ", font: FONT, size: 16, color: C.mute }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: C.mute }),
      new TextRun({ text: " of ", font: FONT, size: 16, color: C.mute }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: C.mute }),
    ],
  })],
});

const doc = new Document({
  creator: "LanFrame for the NPAMS Programme Office",
  title: "NPAMS Asset Management Proposal — ICSA (Comprehensive Edition)",
  description: "Comprehensive sponsor proposal — built and supported by LanFrame.",
  styles: { default: { document: { run: { font: FONT, size: 21, color: C.body } } } },
  sections: [{
    properties: {
      page: { margin: { top: convertInchesToTwip(0.7), bottom: convertInchesToTwip(0.7),
                        left: convertInchesToTwip(0.85), right: convertInchesToTwip(0.85) } },
    },
    headers: { default: flagStripeHeader },
    footers: { default: docFooter },
    children: [...buildCover(), ...body],
  }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log("Wrote", OUT, "(", buf.length, "bytes)");
