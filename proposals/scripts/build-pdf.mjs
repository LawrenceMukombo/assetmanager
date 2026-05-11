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
  Author: "NPAMS Programme Office",
  Subject: "ICSA Asset Management System — sponsor proposal",
  Keywords: "NPAMS, ICSA, PNG, asset management, proposal",
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
  doc.text("NPAMS Programme Office · ICSA Asset Management Proposal · NPAMS-ICSA-2026-001",
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
  ["Reference",     "NPAMS-ICSA-2026-001"],
  ["Issued",        "11 May 2026"],
  ["Validity",      "60 days from issue"],
  ["Year 1 total",  "PGK 104,500.00 incl. GST"],
  ["Vs reference",  "PGK 38,053.13 saving (~ 26.7%) vs Zyntrix v1.2"],
  ["Time to live",  "8 weeks from contract signature"],
  ["Users",         "15 concurrent web users included"],
  ["Hosting",       "PNG-resident SaaS, autoscaling, 99.5% SLA"],
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
  "NPAMS Programme Office · Independent State of Papua New Guinea",
  M, cy + 234, { width: CW, align: "center" });
doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.red).text(
  "COMMERCIAL IN CONFIDENCE", M, H - 70, { width: CW, align: "center" });

// ─── §1 Executive Summary ───────────────────────────────────────────────────
doc.addPage();
h1("1. Executive Summary");
p("The PNG Immigration & Citizenship Authority (ICSA) requires a single, auditable system of record for the high-value assets it operates on behalf of the State — blank ePassport stocks, visa stickers, biometric workstations, secure printers, inspection kits and the supporting estate at headquarters and provincial border posts. The National Public Asset Management System (NPAMS) has been built specifically for the PNG public sector and is already live, multi-tenant, and integrated with the Government's geographic data set.");
p("This proposal sets out the activities, timeline and commercials required to onboard ICSA onto NPAMS as an Authority tenant alongside other PNG agencies already provisioned (PNGDF, RPNGC, IRC, Treasury, Customs, Ombudsman). It delivers the same outcomes as the previously-tabled Zyntrix proposal — a modern, role-based, GIS-enabled asset register with purchase, audit and maintenance workflows — at materially lower total cost.");

// Headline table
const headline = [
  ["Total programme cost (Year 1, incl. GST)", "PGK 104,500.00"],
  ["Comparable Zyntrix proposal (incl. GST)",  "PGK 142,553.13"],
  ["Savings to ICSA in Year 1",                "PGK 38,053.13 (~ 26.7%)"],
  ["Time to go-live",                          "8 weeks from signature"],
  ["Concurrent web users included",            "15"],
];
keyValueTable(headline, { highlight: 2 });

p("NPAMS is delivered as a hosted, autoscaling PNG-resident SaaS platform with a defined Service Level Agreement, encrypted data at rest, RBAC scoped down to facility level, and tamper-evident HMAC-SHA256 digital signatures on every purchase, approval and goods-receipt event.");

// ─── §2 About NPAMS ─────────────────────────────────────────────────────────
h1("2. About NPAMS");
p("NPAMS is the State-sponsored asset management platform for PNG. It is currently operating in production for the following Authorities, each in its own logical tenant with its own branding, scope and roles:");
bullet([
  "PNG Defence Force (PNGDF)",
  "Royal Papua New Guinea Constabulary (RPNGC)",
  "Internal Revenue Commission (IRC)",
  "Department of Treasury",
  "PNG Customs Service",
  "Office of the Ombudsman",
  "PNG Immigration & Citizenship Authority (this proposal)",
]);
p("Because NPAMS is multi-tenant from the database upward, ICSA does not pay for a new build — only for its onboarding, configuration, migration, training, hosting and ongoing support. There is no platform IP licence fee charged to ICSA above and beyond the per-user subscription described in §6.");

// ─── §3 Asset Categories ────────────────────────────────────────────────────
h1("3. Asset Categories in Scope");
p("NPAMS will manage, at minimum, the following ICSA asset classes. Each category is configurable; ICSA Asset Officers can add additional classes without vendor intervention.");
table({
  cols: [{ label: "Category", w: 0.32 }, { label: "Examples", w: 0.68 }],
  rows: [
    ["Secure Stock",        "Blank ePassport booklets (32-page / 64-page), visa stickers, security inks, holographic foils"],
    ["ICT Hardware",        "Biometric capture stations, fingerprint scanners, document scanners, secure printers, servers"],
    ["Office Equipment",    "Workstations, laptops, photocopiers, networking gear"],
    ["Vehicles & Plant",    "Pool vehicles, generators, UPS units"],
    ["Furniture & Fittings","Office furniture, secure cabinets, safes"],
    ["Border Post Estate",  "Buildings, perimeter fencing, signage, inspection lanes"],
    ["Uniforms & PPE",      "Officer uniforms, body armour, inspection PPE"],
  ],
});
p("Every asset record carries: unique asset code, category, location (province -> district -> facility), custodian, acquisition cost, depreciation, condition, service history, photographs, and a public verification QR code.");

// ─── §4 Solution Scope ──────────────────────────────────────────────────────
h1("4. Solution Scope");
p("The following modules are already implemented in NPAMS and will be enabled for ICSA on day one. Live screenshots are included in Annex A.");

h2("4.1 Multi-Agency Tenancy & RBAC");
bullet([
  "Logical isolation per Authority (ICSA tenant pre-provisioned).",
  "Implemented role catalogue: Super Admin, National Asset Controller, National Auditor, Provincial Admin, Provincial Asset Officer, Provincial Viewer, and Agency Admin (per-Authority).",
  "Scope is enforced at every API call: national, agency, province, district or single facility. ICSA users see only ICSA data.",
]);

h2("4.2 Asset Register");
bullet([
  "Full lifecycle: acquisition -> in-service -> maintenance -> disposal.",
  "Bulk import via spreadsheet template; per-asset photographs and documents.",
  "Public QR verification page (no login) for field officers and auditors.",
]);

h2("4.3 Stock & Inventory (secure consumables)");
bullet([
  "On-hand quantity, reorder level, supplier and unit cost per stock item.",
  "Stock movements (receive / issue / transfer / adjust) with full audit trail.",
  "Per-facility balances; automated low-stock alerts.",
]);

h2("4.4 Purchase Request Workflow with Digital Signatures");
bullet([
  "Officer raises a request -> routed to scoped approvers -> approve / reject -> goods receipt against the request.",
  "Every state transition is signed. The signer types their full name; the server stores signed_name, signed_at and a tamper-evident signed_hash = HMAC-SHA256(server_secret, \"v1|user|action|request|timestamp|name\").",
  "Notifications dispatched to requester and approvers at every step.",
]);

h2("4.5 Audit Sessions");
bullet([
  "Scheduled or ad-hoc audit cycles by location.",
  "Officers verify each asset (present / missing / damaged) and capture evidence photographs against the public QR code.",
  "Variance report generated on session close.",
]);

h2("4.6 Maintenance & Service History");
bullet([
  "Preventive and corrective maintenance scheduling per asset.",
  "Cost capture, downtime tracking, vendor records.",
]);

h2("4.7 GIS Map (PNG-specific)");
bullet([
  "Interactive Leaflet map of all 22 provinces and districts (GADM boundaries).",
  "Province / district selection dims unrelated areas; OSM, satellite and topographic basemaps.",
  "Used to visualise asset and stock distribution across ICSA's national footprint and border posts.",
]);

h2("4.8 Reports & Dashboard");
bullet([
  "KPI dashboard per role; custody, condition, depreciation and movement reports.",
  "CSV / PDF export.",
]);

h2("4.9 Notifications & Activity Log");
bullet([
  "In-app notification centre delivering events to requesters and approvers.",
  "Append-only activity_logs table capturing user, action type, entity, description and timestamp for every CRUD and workflow event.",
  "Workflow events on signed actions additionally carry the actor's HMAC-SHA256 signature, providing tamper-evident proof independent of the database row.",
]);

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
  ],
});
p("NPAMS aligns with the PNG Government Digital Strategy and is designed to be auditable by the Auditor-General's office on demand.");

// ─── §6 Commercials ─────────────────────────────────────────────────────────
h1("6. Commercials");
p("All amounts in Papua New Guinea Kina (PGK). GST applied at 10% per the Goods and Services Tax Act 2003.");

h2("6.1 Year 1 Cost Build-Up");
costTable([
  ["1", "Platform Licence — Year 1",            "Tenant subscription for 15 named concurrent web users (K 600 / user / yr)", 9_000],
  ["2", "Implementation & Configuration",       "Tenant provisioning, branding, role catalogue, agency / province / district / facility hierarchy, identity stub", 28_000],
  ["3", "Data Migration & Seeding",             "Migration of legacy asset register (CSV / Excel), stock balances, custodians, locations and facility tree", 8_500],
  ["4", "User Training",                        "Three (3) sessions: Asset Officers, Agency Admins, Auditors. Includes printed quick-reference guides", 7_500],
  ["5", "Cloud Hosting (12 months)",            "Autoscaling app + managed PostgreSQL + Object Storage + CDN + daily backups", 12_000],
  ["6", "Annual Support & Maintenance — Year 1","SLA-backed L1-L3 support, monthly security patches, minor enhancements (<= 8 hrs/mo)", 30_000],
]);

h2("6.2 Recurring Cost — Year 2 onwards");
costTable([
  ["1", "Platform Licence (15 users)",       "",  9_000],
  ["2", "Cloud Hosting",                     "", 12_000],
  ["3", "Annual Support & Maintenance",      "", 30_000],
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
p("Eight (8) weeks from contract signature to formal Go-Live, with two further weeks of post-go-live hyper-care.");

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
    { label: "Activity", w: 0.55 },
    { label: "NPAMS",    w: 0.225, align: "center" },
    { label: "ICSA",     w: 0.225, align: "center" },
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
  "Mobile applications (Android / iOS) are not in scope; the responsive web app works on tablets and modern phones.",
  "Hardware (scanners, label printers, biometric kiosks) is provided by ICSA.",
  "Connectivity to provincial border posts is provided by ICSA.",
  "Custom development beyond the 8 hrs/month support envelope is quoted separately at PGK 300 / hr.",
]);

// ─── §10 Terms ──────────────────────────────────────────────────────────────
h1("10. Terms & Conditions");
const terms = [
  "Currency. All amounts are in PGK and exclude GST unless otherwise stated.",
  "Payment. 30% on contract signature, 40% on UAT sign-off, 30% on Go-Live. Recurring fees billed annually in advance.",
  "Validity. This proposal is valid for sixty (60) days from the date on the cover.",
  "Variations. Any change in scope is captured in a written Change Request and priced at PGK 300 / hr.",
  "Intellectual Property. Platform IP remains with the NPAMS Programme. ICSA data remains the property of ICSA at all times and is exportable on demand in open formats.",
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
  { file: "01-login.jpg",            caption: "Figure A1 — Sign-in screen with PNG branding and tenant theming." },
  { file: "02-app-shell.jpg",        caption: "Figure A2 — Authenticated application shell (PNG ICSA tenant) showing the global navigation, branded header and logged-in officer profile." },
  { file: "03-purchase-requests.jpg",caption: "Figure A3 — Purchase Requests workflow page (the digital signature pipeline that ICSA will use to govern stock replenishment of ePassport booklets, visa stickers and other secure consumables)." },
];
for (const s of shots) {
  const fp = path.join(ASSETS, s.file);
  if (!fs.existsSync(fp)) continue;
  ensure(280);
  const imgW = CW;
  const imgH = imgW * (800 / 1280); // captured at 1280x800 / 1024x800
  doc.image(fp, M, doc.y, { width: imgW });
  doc.y += Math.min(imgH, 320) + 6;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.mute).text(s.caption, { width: CW });
  doc.moveDown(1);
  setBody();
}

// ─── Annex B — Comparison ───────────────────────────────────────────────────
ensure(400);
h1("Annex B — Comparison vs Reference Proposal");
table({
  cols: [
    { label: "Item",          w: 0.40 },
    { label: "Zyntrix v1.2",  w: 0.20, align: "right" },
    { label: "NPAMS",         w: 0.20, align: "right" },
    { label: "Diff (PGK)",    w: 0.20, align: "right" },
  ],
  rows: [
    ["Platform licence (Year 1, 5 vs 15 users)", "42,000.00", "9,000.00",  "(33,000.00)"],
    ["Implementation & customisation",           "included",  "28,000.00", "—"],
    ["Data migration & seeding",                 "included",  "8,500.00",  "—"],
    ["Annual hosting",                           "included",  "12,000.00", "—"],
    ["Training",                                 "included",  "7,500.00",  "—"],
    ["Annual support & maintenance",             "84,000.00", "30,000.00", "(54,000.00)"],
    ["Per-user licence (additional)",            "718.75",    "600.00",    "(118.75)"],
    ["Subtotal (excl. GST)",                     "129,593.75","95,000.00", "(34,593.75)"],
    ["GST (10%)",                                "12,959.38", "9,500.00",  "(3,459.38)"],
    ["Grand Total Year 1 (incl. GST)",           "142,553.13","104,500.00","(38,053.13)"],
    ["Saving to ICSA",                           "—",         "—",         "~ 26.7%"],
  ],
  emphasiseLastN: 3,
});
p("The NPAMS proposal is itemised line-by-line so ICSA's Finance team can trace every Kina; nothing is bundled into an opaque \"support\" line.");

// ─── End ────────────────────────────────────────────────────────────────────
ensure(40);
doc.moveDown(1);
doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.mute).text(
  "End of proposal — Commercial in Confidence — NPAMS Programme Office, 2026.",
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
  // items: [no, line, desc, amount]
  const cols = [
    { label: "#",        w: 0.05, align: "center" },
    { label: "Line item",w: 0.28 },
    { label: "Description", w: 0.50 },
    { label: "Amount (PGK)", w: 0.17, align: "right" },
  ];
  const rows = items.map(([n, name, desc, amt]) => [n, name, desc, fmtMoney(amt)]);
  const subtotal = items.reduce((s, x) => s + x[3], 0);
  const gst = subtotal * 0.10;
  const grand = subtotal + gst;
  rows.push(["", "Subtotal (excl. GST)", "", fmtMoney(subtotal)]);
  rows.push(["", "GST (10%)",            "", fmtMoney(gst)]);
  rows.push(["", opts.totalLabel || "Grand Total Year 1 (incl. GST)", "", fmtMoney(grand)]);
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
