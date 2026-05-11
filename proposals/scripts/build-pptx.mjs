// Generate proposals/ICSA-NPAMS-Summary.pptx
// Sponsor-grade summary deck for ICSA. Built and supported by LanFrame.

import pptxgenjs from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "ICSA-NPAMS-Summary.pptx");
const ASSETS = path.join(ROOT, "assets");
const LOGO = path.resolve(ROOT, "..", "artifacts/npams-web/public/agencies/pngica.png");

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

const pres = new pptxgenjs();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
const W = 13.33, H = 7.5;
pres.author = "LanFrame for the NPAMS Programme Office";
pres.company = "LanFrame";
pres.title = "NPAMS — ICSA Sponsor Summary";

// Reusable chrome ──────────────────────────────────────────────────────────
function addChrome(slide, { title, kicker = "NPAMS Programme — ICSA Sponsor Summary" } = {}) {
  // PNG flag stripe at top
  slide.addShape("rect", { x: 0, y: 0, w: W * 0.55, h: 0.10, fill: { color: C.blue }, line: { type: "none" } });
  slide.addShape("rect", { x: W * 0.55, y: 0, w: W * 0.30, h: 0.10, fill: { color: C.gold }, line: { type: "none" } });
  slide.addShape("rect", { x: W * 0.85, y: 0, w: W * 0.15, h: 0.10, fill: { color: C.red }, line: { type: "none" } });
  // Footer rule
  slide.addShape("rect", { x: 0.5, y: H - 0.45, w: W - 1.0, h: 0.01, fill: { color: C.rule }, line: { type: "none" } });
  slide.addText("LanFrame  ·  NPAMS Programme Office", {
    x: 0.5, y: H - 0.40, w: 6.0, h: 0.30, fontFace: "Calibri", fontSize: 9, color: C.mute,
  });
  slide.addText("Commercial in Confidence", {
    x: (W - 4) / 2, y: H - 0.40, w: 4, h: 0.30, fontFace: "Calibri", fontSize: 9, color: C.mute, align: "center", italic: true,
  });
  if (title) {
    slide.addText(title, {
      x: 0.5, y: 0.30, w: W - 1, h: 0.55, fontFace: "Calibri",
      fontSize: 28, bold: true, color: C.blue,
    });
    slide.addText(kicker, {
      x: 0.5, y: 0.85, w: W - 1, h: 0.30, fontFace: "Calibri",
      fontSize: 11, color: C.mute, italic: true,
    });
    // Red accent rule under title
    slide.addShape("rect", { x: 0.5, y: 1.18, w: 0.6, h: 0.05, fill: { color: C.red }, line: { type: "none" } });
  }
}
function bullets(slide, items, { x = 0.7, y = 1.5, w = W - 1.4, h = 5.2, fontSize = 16 } = {}) {
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: { code: "25A0" }, color: C.body, fontSize, paraSpaceAfter: 6 } })),
    { x, y, w, h, fontFace: "Calibri", valign: "top" }
  );
}
function statTile(slide, x, y, w, h, label, value, accent = C.blue) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08,
    fill: { color: C.band }, line: { color: C.rule, width: 0.75 } });
  slide.addShape("rect", { x, y, w: 0.10, h, fill: { color: accent }, line: { type: "none" } });
  slide.addText(label, { x: x + 0.25, y: y + 0.12, w: w - 0.4, h: 0.3,
    fontFace: "Calibri", fontSize: 10, bold: true, color: C.mute, charSpacing: 2 });
  slide.addText(value, { x: x + 0.25, y: y + 0.45, w: w - 0.4, h: h - 0.55,
    fontFace: "Calibri", fontSize: 22, bold: true, color: C.ink, valign: "top" });
}

// ─── Slide 1 — Cover ──────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.blue };
  // Gold + red rule near bottom
  s.addShape("rect", { x: 0, y: H * 0.62, w: W, h: 0.10, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape("rect", { x: 0, y: H * 0.62 + 0.10, w: W, h: 0.06, fill: { color: C.red }, line: { type: "none" } });

  if (fs.existsSync(LOGO)) {
    s.addImage({ path: LOGO, x: (W - 1.6) / 2, y: 0.7, w: 1.6, h: 1.6 });
  }
  s.addText("NPAMS", { x: 0, y: 2.3, w: W, h: 0.9, align: "center",
    fontFace: "Calibri", fontSize: 64, bold: true, color: C.white });
  s.addText("National Public Asset Management System", {
    x: 0, y: 3.2, w: W, h: 0.5, align: "center",
    fontFace: "Calibri", fontSize: 22, color: C.white,
  });
  s.addText("Sponsor Summary for the PNG Immigration & Citizenship Authority", {
    x: 0, y: 3.7, w: W, h: 0.5, align: "center",
    fontFace: "Calibri", fontSize: 16, italic: true, color: C.gold,
  });
  s.addText("Prepared by LanFrame for the NPAMS Programme Office  ·  11 May 2026  ·  NPAMS-ICSA-2026-002", {
    x: 0, y: H * 0.62 + 0.30, w: W, h: 0.5, align: "center",
    fontFace: "Calibri", fontSize: 13, color: C.white,
  });
  s.addText("COMMERCIAL IN CONFIDENCE", {
    x: 0, y: H - 0.55, w: W, h: 0.4, align: "center",
    fontFace: "Calibri", fontSize: 11, italic: true, color: C.gold, charSpacing: 4,
  });
}

// ─── Slide 2 — Why NPAMS ──────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Why NPAMS for ICSA" });
  bullets(s, [
    "A single, auditable system of record for every ICSA asset — blank ePassport stocks, visa stickers, biometric workstations, secure printers, vehicles and the full estate at HQ and border posts.",
    "Already live and multi-tenant. ICSA joins six Authorities already in production (PNGDF, RPNGC, IRC, Treasury, Customs, Ombudsman) with its own scoped data, branding and roles.",
    "Designed for the PNG public sector by LanFrame: GIS over all 22 provinces, HMAC-SHA256 signed approvals, evidence-grade activity log, scope enforcement down to the facility.",
    "No platform IP licence. ICSA pays only for onboarding, configuration, training, hosting and ongoing support — the subscription model is described in this deck.",
    "Eight weeks from contract to Go-Live, with two further weeks of hyper-care.",
  ], { fontSize: 18 });
}

// ─── Slide 3 — At a glance (KPI tiles) ────────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "At a Glance" });
  const tilesRow1 = [
    ["YEAR 1 TOTAL", "PGK 104,500", C.blue],
    ["RECURRING / YR", "PGK 56,100", C.blue],
    ["GO-LIVE", "8 weeks", C.red],
    ["USERS INCLUDED", "15", C.red],
  ];
  const tilesRow2 = [
    ["LIVE FEATURES", "30", C.blue],
    ["ROADMAP FEATURES", "21", C.blue],
    ["UPTIME SLA", "99.5%", C.red],
    ["SIGNED EVENTS", "HMAC-SHA256", C.red],
  ];
  const tw = (W - 1.6) / 4, th = 1.4;
  tilesRow1.forEach(([l, v, a], i) => statTile(s, 0.7 + i * (tw + 0.2), 1.7, tw, th, l, v, a));
  tilesRow2.forEach(([l, v, a], i) => statTile(s, 0.7 + i * (tw + 0.2), 3.4, tw, th, l, v, a));
  s.addText("Hosted in PNG-accessible cloud region · daily encrypted backups · TLS 1.2+ · AES-256 at rest", {
    x: 0.7, y: 5.2, w: W - 1.4, h: 0.5,
    fontFace: "Calibri", fontSize: 14, italic: true, color: C.mute, align: "center",
  });
  s.addText("Built and supported by LanFrame for the NPAMS Programme Office", {
    x: 0.7, y: 5.7, w: W - 1.4, h: 0.5,
    fontFace: "Calibri", fontSize: 14, bold: true, color: C.blue, align: "center",
  });
}

// ─── Slide 4 — What's live (3-column grid of feature groups) ──────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "What is Live Today" });
  const cols = [
    ["Asset Register & Stock", [
      "Asset CRUD with auto-suggested asset tag (PNGICA-VEH-014)",
      "Category short codes (BLD, VEH, ICT, OFF, MED, MCH, COM)",
      "Per-facility stock balances and movement ledger",
      "One-click reorder purchase request",
      "Public QR verification page (no login)",
      "Photos & documents in object storage",
      "Asset transfers, lifecycle and prev/next stepper",
    ]],
    ["Workflow & Audit", [
      "Purchase request pipeline with approve / reject / receive",
      "HMAC-SHA256 signed events on every state transition",
      "Signed event timeline UI with re-verifiable hashes",
      "Audit sessions scoped to province / district / facility",
      "Field verification with camera + GPS",
      "Maintenance scheduling with cost & downtime",
      "Append-only activity log for the Auditor-General",
    ]],
    ["Insight & Platform", [
      "Provincial and national dashboards (KPIs + charts)",
      "Reports module with one-click CSV export",
      "Notifications inbox with mark-read",
      "Interactive GIS map of all 22 PNG provinces",
      "Multi-tenant RBAC with scope enforcement",
      "Tenant branding per Authority",
      "Theme tokens with full dark-mode polish",
    ]],
  ];
  const cw = (W - 1.4) / 3, ch = 4.8;
  cols.forEach(([title, items], i) => {
    const x = 0.7 + i * (cw + 0.1);
    s.addShape("roundRect", { x, y: 1.5, w: cw, h: ch, rectRadius: 0.08,
      fill: { color: C.white }, line: { color: C.rule, width: 0.75 } });
    s.addShape("rect", { x, y: 1.5, w: cw, h: 0.45, fill: { color: C.blue }, line: { type: "none" } });
    s.addText(title, { x: x + 0.2, y: 1.5, w: cw - 0.4, h: 0.45,
      fontFace: "Calibri", fontSize: 14, bold: true, color: C.white, valign: "middle" });
    s.addText(
      items.map((t) => ({ text: t, options: { bullet: { code: "25A0" }, color: C.body, fontSize: 11, paraSpaceAfter: 4 } })),
      { x: x + 0.2, y: 2.0, w: cw - 0.4, h: ch - 0.6, fontFace: "Calibri", valign: "top" }
    );
  });
  s.addText("30 capabilities live in production today.", {
    x: 0.7, y: 6.4, w: W - 1.4, h: 0.4,
    fontFace: "Calibri", fontSize: 13, italic: true, color: C.mute, align: "center",
  });
}

// ─── Slide 5 — Signed PR workflow (with screenshot) ──────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Tamper-Evident Procurement Workflow" });
  bullets(s, [
    "Officer submits → scoped approver signs → goods receipt closes the loop.",
    "Every state transition writes an immutable row with signed_name, signed_at and signed_hash.",
    "signed_hash = HMAC-SHA256(server_secret, \"v1|user|action|request|timestamp|name\").",
    "ICSA's Auditor can re-compute every hash from the documented input string and prove no event has been tampered with.",
    "Live evidence today: PR-20260511-5092 carries verifiable submitted + approved signatures.",
  ], { x: 0.7, y: 1.5, w: 5.6, h: 5.2, fontSize: 14 });

  const shot = path.join(ASSETS, "03-purchase-requests.jpg");
  if (fs.existsSync(shot)) {
    s.addImage({ path: shot, x: 6.6, y: 1.5, w: 6.0, h: 4.0, sizing: { type: "contain", w: 6.0, h: 4.0 } });
    s.addText("Live screenshot — Purchase Requests workflow", {
      x: 6.6, y: 5.55, w: 6.0, h: 0.3, fontFace: "Calibri", fontSize: 10, italic: true, color: C.mute, align: "center",
    });
  }
}

// ─── Slide 6 — GIS over all 22 PNG provinces ──────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "PNG-Specific GIS — All 22 Provinces" });
  bullets(s, [
    "Interactive Leaflet map of every PNG province and district (GADM boundaries).",
    "Street, Satellite and Topographic basemaps; province / district selection dims unrelated areas.",
    "Pins for ICSA assets and stock locations across HQ, regional offices, sea ports and border posts.",
    "Drives the location → asset → custodian drill-down used in the dashboards and reports.",
  ], { x: 0.7, y: 1.5, w: 5.6, h: 5.2, fontSize: 14 });

  const shot = path.join(ASSETS, "04-gis.jpg");
  if (fs.existsSync(shot)) {
    s.addImage({ path: shot, x: 6.6, y: 1.5, w: 6.0, h: 4.0, sizing: { type: "contain", w: 6.0, h: 4.0 } });
    s.addText("Live screenshot — GIS Province Map", {
      x: 6.6, y: 5.55, w: 6.0, h: 0.3, fontFace: "Calibri", fontSize: 10, italic: true, color: C.mute, align: "center",
    });
  }
}

// ─── Slide 7 — Security & Compliance ──────────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Security & Compliance" });
  const rows = [
    ["Authentication", "Bcrypt passwords; JWT (8h) + rotating refresh tokens stored as SHA-256"],
    ["Authorisation", "RBAC with scope at national / agency / province / district / facility"],
    ["Digital signatures", "HMAC-SHA256 on every PR state transition — verifiable & non-repudiable"],
    ["Audit log", "Append-only activity_logs and purchase_request_events"],
    ["Data residency", "PNG-accessible cloud region; daily encrypted backups (30 days)"],
    ["In transit / at rest", "TLS 1.2+ end-to-end · AES-256 at the storage layer"],
    ["DR / SLA", "RPO 24 h · RTO 8 h · 99.5% monthly uptime · P1 1 h, P2 4 h"],
    ["Vulnerability mgmt", "Monthly CVE scan, SAST every release, quarterly external pen-test summary"],
  ];
  s.addTable(
    [
      [{ text: "Area", options: { bold: true, color: C.white, fill: { color: C.blue } } },
       { text: "NPAMS control", options: { bold: true, color: C.white, fill: { color: C.blue } } }],
      ...rows.map(([k, v], i) => ([
        { text: k, options: { bold: true, color: C.ink, fill: { color: i % 2 ? C.band : C.white } } },
        { text: v, options: { color: C.body, fill: { color: i % 2 ? C.band : C.white } } },
      ])),
    ],
    {
      x: 0.7, y: 1.5, w: W - 1.4, colW: [3.0, W - 1.4 - 3.0],
      fontFace: "Calibri", fontSize: 13, valign: "middle",
      border: { type: "solid", pt: 0.5, color: C.rule },
    }
  );
}

// ─── Slide 8 — Commercials ───────────────────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Commercials — Year 1" });
  const rows = [
    ["1", "Platform Licence — Year 1", "15 named users", "9,000.00"],
    ["2", "Implementation & Configuration", "fixed price", "28,000.00"],
    ["3", "Data Migration & Seeding", "fixed price", "8,500.00"],
    ["4", "User Training", "3 sessions", "7,500.00"],
    ["5", "Cloud Hosting", "12 months", "12,000.00"],
    ["6", "Support & Maintenance — Year 1", "12 months, ≤ 8 hrs/mo enhancements", "30,000.00"],
  ];
  s.addTable(
    [
      [{ text: "#", options: { bold: true, color: C.white, fill: { color: C.blue } } },
       { text: "Line item", options: { bold: true, color: C.white, fill: { color: C.blue } } },
       { text: "Notes", options: { bold: true, color: C.white, fill: { color: C.blue } } },
       { text: "Total (PGK)", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "right" } }],
      ...rows.map((r, i) => r.map((v, j) => ({
        text: v,
        options: { color: C.body, fill: { color: i % 2 ? C.band : C.white }, align: j === 3 ? "right" : "left" },
      }))),
      [{ text: "", options: { fill: { color: C.white } } },
       { text: "Subtotal (excl. GST)", options: { bold: true, fill: { color: C.white } } },
       { text: "", options: { fill: { color: C.white } } },
       { text: "95,000.00", options: { bold: true, align: "right", fill: { color: C.white } } }],
      [{ text: "", options: { fill: { color: C.band } } },
       { text: "GST (10%)", options: { bold: true, fill: { color: C.band } } },
       { text: "", options: { fill: { color: C.band } } },
       { text: "9,500.00", options: { bold: true, align: "right", fill: { color: C.band } } }],
      [{ text: "", options: { fill: { color: C.gold } } },
       { text: "Grand Total Year 1 (incl. GST)", options: { bold: true, color: C.ink, fill: { color: C.gold } } },
       { text: "", options: { fill: { color: C.gold } } },
       { text: "104,500.00", options: { bold: true, color: C.ink, align: "right", fill: { color: C.gold } } }],
    ],
    {
      x: 0.7, y: 1.45, w: W - 1.4, colW: [0.5, 5.5, 4.0, 1.93],
      fontFace: "Calibri", fontSize: 12, valign: "middle",
      border: { type: "solid", pt: 0.5, color: C.rule },
    }
  );
  s.addText("Recurring from Year 2: PGK 56,100 incl. GST  ·  3-Year TCO: PGK 216,700 incl. GST  ·  Add-on user: PGK 600 / yr", {
    x: 0.7, y: 6.5, w: W - 1.4, h: 0.4,
    fontFace: "Calibri", fontSize: 13, color: C.blue, bold: true, align: "center",
  });
}

// ─── Slide 9 — Implementation timeline ───────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Implementation Timeline — 8 Weeks to Go-Live" });
  const weeks = [
    ["1", "Mobilisation"],
    ["1–2", "Tenant Provisioning"],
    ["2–4", "Data Migration"],
    ["3–5", "Configuration"],
    ["4–6", "Integration"],
    ["5–6", "Training"],
    ["6–7", "UAT"],
    ["7–8", "Go-Live"],
    ["9–10", "Hyper-care"],
  ];
  // Timeline lane
  const laneY = 3.4, laneH = 0.5;
  s.addShape("rect", { x: 0.7, y: laneY, w: W - 1.4, h: laneH, fill: { color: C.band }, line: { type: "none" } });
  const tw = (W - 1.4) / weeks.length;
  weeks.forEach(([wk, label], i) => {
    const x = 0.7 + i * tw;
    const fill = i % 2 ? C.blue : C.red;
    s.addShape("rect", { x, y: laneY, w: tw - 0.05, h: laneH, fill: { color: fill }, line: { type: "none" } });
    s.addText(wk, { x, y: laneY, w: tw - 0.05, h: laneH,
      fontFace: "Calibri", fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addText(label, { x: x - 0.1, y: laneY + laneH + 0.15, w: tw + 0.15, h: 0.6,
      fontFace: "Calibri", fontSize: 10, color: C.ink, align: "center" });
  });
  s.addText("Eight weeks contract → Go-Live, plus two weeks of LanFrame on-site hyper-care.", {
    x: 0.7, y: 1.6, w: W - 1.4, h: 0.5,
    fontFace: "Calibri", fontSize: 16, color: C.mute, align: "center",
  });
  bullets(s, [
    "Week 1 — kick-off and governance set-up.",
    "Weeks 2–6 — tenant provisioning, data migration and configuration in parallel.",
    "Weeks 5–7 — training (Asset Officer, Agency Admin, Auditor) and UAT sign-off.",
    "Weeks 7–8 — production cut-over with DR drill, runbook hand-over.",
    "Weeks 9–10 — hyper-care: defect triage and performance tuning.",
  ], { x: 0.7, y: 5.0, w: W - 1.4, h: 1.7, fontSize: 12 });
}

// ─── Slide 10 — Roadmap (21 items) ───────────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Roadmap — Included in the Year-1 Engagement" });
  const cols = [
    ["Procurement & approvals", [
      "Email / push alerts on PR status changes",
      "Supplier performance and price history",
      "Automated end-to-end tests for the reorder flow",
      "Auditor screen verifies every signed approval",
      "PR alerts in the bell-icon tray",
    ]],
    ["Stock, dashboards & reports", [
      "Real backup history & live system metrics",
      "Low-stock alerts on the dashboard",
      "Bulk-edit reorder thresholds",
      "Category code in reports & dashboard breakdowns",
      "Tighten API parameter typing (internal hardening)",
    ]],
    ["Asset history, search & UX", [
      "Maintenance & audit events inline on asset history",
      "Export an asset's full history to PDF",
      "Top-bar search across stock, audits and PRs",
      "Full search results page for large match sets",
      "Audit-assignment stepper for officers",
      "Dark-mode pass for audit, maintenance & public pages",
    ]],
    ["Distribution & deployment", [
      "Windows desktop installer (MSI / EXE)",
      "Android mobile app (signed APK)",
      "On-prem deployment runbook for ICSA",
      "Sponsor proposal collateral refresh",
      "Test that two categories cannot share a code",
    ]],
  ];
  const cw = (W - 1.4 - 0.3) / 4, ch = 4.6;
  cols.forEach(([title, items], i) => {
    const x = 0.7 + i * (cw + 0.1);
    s.addShape("roundRect", { x, y: 1.5, w: cw, h: ch, rectRadius: 0.08,
      fill: { color: C.white }, line: { color: C.rule, width: 0.75 } });
    s.addShape("rect", { x, y: 1.5, w: cw, h: 0.45, fill: { color: C.red }, line: { type: "none" } });
    s.addText(title, { x: x + 0.15, y: 1.5, w: cw - 0.3, h: 0.45,
      fontFace: "Calibri", fontSize: 12, bold: true, color: C.white, valign: "middle" });
    s.addText(
      items.map((t) => ({ text: t, options: { bullet: { code: "25A0" }, color: C.body, fontSize: 10, paraSpaceAfter: 3 } })),
      { x: x + 0.15, y: 2.0, w: cw - 0.3, h: ch - 0.6, fontFace: "Calibri", valign: "top" }
    );
  });
  s.addText("21 roadmap items, scheduled inside the ≤ 8 hrs/month enhancement envelope of the support contract.", {
    x: 0.7, y: 6.3, w: W - 1.4, h: 0.5,
    fontFace: "Calibri", fontSize: 13, italic: true, color: C.mute, align: "center",
  });
}

// ─── Slide 11 — Why LanFrame ─────────────────────────────────────────────
{
  const s = pres.addSlide();
  addChrome(s, { title: "Why LanFrame" });
  bullets(s, [
    "PNG-resident delivery partner accountable for the NPAMS platform end-to-end.",
    "Already operating six tenant Authorities in production — proven onboarding, training and support muscle.",
    "Single contract, single throat to choke: platform, hosting, training, support and roadmap all from one team.",
    "Engineering practice covers monthly CVE scans, SAST on every release, quarterly external penetration test summaries delivered to ICSA.",
    "Roadmap delivered inside the support envelope at no extra cost — ICSA gets new capability every month.",
    "Open formats throughout: Postgres dump and CSV export available on demand.",
  ], { fontSize: 18 });
}

// ─── Slide 12 — Closing / Next steps ─────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.blue };
  s.addShape("rect", { x: 0, y: H * 0.62, w: W, h: 0.10, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape("rect", { x: 0, y: H * 0.62 + 0.10, w: W, h: 0.06, fill: { color: C.red }, line: { type: "none" } });
  s.addText("Thank You", { x: 0, y: 1.2, w: W, h: 1.2, align: "center",
    fontFace: "Calibri", fontSize: 64, bold: true, color: C.white });
  s.addText("Next steps", { x: 0, y: 2.7, w: W, h: 0.5, align: "center",
    fontFace: "Calibri", fontSize: 22, color: C.gold, italic: true });
  s.addText([
      { text: "1.  ICSA confirms 15-user concurrent licence and Year-1 scope.\n", options: { fontSize: 18, color: C.white } },
      { text: "2.  LanFrame issues contract for signature within 5 business days.\n", options: { fontSize: 18, color: C.white } },
      { text: "3.  Kick-off Week 1 — Go-Live Week 8 — hyper-care to Week 10.", options: { fontSize: 18, color: C.white } },
    ], { x: 1.5, y: 3.4, w: W - 3.0, h: 2.0, fontFace: "Calibri", align: "left" });
  s.addText("LanFrame  ·  on behalf of the NPAMS Programme Office  ·  Independent State of Papua New Guinea", {
    x: 0, y: H - 0.7, w: W, h: 0.4, align: "center",
    fontFace: "Calibri", fontSize: 12, color: C.white,
  });
  s.addText("COMMERCIAL IN CONFIDENCE", {
    x: 0, y: H - 0.35, w: W, h: 0.3, align: "center",
    fontFace: "Calibri", fontSize: 10, italic: true, color: C.gold, charSpacing: 4,
  });
}

await pres.writeFile({ fileName: OUT });
console.log("Wrote", OUT);
