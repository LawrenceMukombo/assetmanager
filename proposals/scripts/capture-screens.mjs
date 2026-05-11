// Capture full-page screenshots of every NPAMS route.
// Logs in via the API, primes localStorage, then visits each path.

import { chromium } from "playwright-chromium";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "assets", "screens");
fs.mkdirSync(OUT, { recursive: true });

const WEB = process.env.WEB_URL || "http://localhost:24529";
const API = process.env.API_URL || "http://localhost:8080";
const EMAIL = "immigration.admin@npams.gov.pg";
const PASSWORD = "Admin1234!";

const VIEWPORT = { width: 1440, height: 900 };

const ROUTES = [
  { name: "01-login",            path: "/login",            auth: false },
  { name: "02-dashboard",        path: "/dashboard",        auth: true  },
  { name: "03-assets",           path: "/assets",           auth: true  },
  { name: "04-assets-new",       path: "/assets/new",       auth: true  },
  { name: "05-categories",       path: "/categories",       auth: true  },
  { name: "06-reports",          path: "/reports",          auth: true  },
  { name: "07-users",            path: "/users",            auth: true  },
  { name: "08-locations",        path: "/locations",        auth: true  },
  { name: "09-audit",            path: "/audit",            auth: true  },
  { name: "10-maintenance",      path: "/maintenance",      auth: true  },
  { name: "11-stock",            path: "/stock",            auth: true  },
  { name: "12-purchase-requests", path: "/purchase-requests", auth: true },
  { name: "13-system-status",    path: "/system-status",    auth: true  },
  { name: "14-gis",              path: "/gis",              auth: true  },
  { name: "15-notifications",    path: "/notifications",    auth: true  },
  { name: "16-settings",         path: "/settings",         auth: true  },
];

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json?.data?.access_token) throw new Error("Login failed: " + JSON.stringify(json).slice(0, 300));
  return json.data; // { access_token, refresh_token, user }
}

async function fetchFirstId(token, endpoint, key = "id") {
  try {
    const res = await fetch(`${API}/api/v1/${endpoint}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const list = j?.data?.items ?? j?.data ?? j?.items ?? [];
    return Array.isArray(list) && list[0] ? list[0][key] : null;
  } catch { return null; }
}

(async () => {
  console.log("Logging in...");
  const { access_token, refresh_token, user } = await login();
  console.log("OK as:", user?.email);

  // Discover IDs for detail pages
  const [assetId, stockId, prId, auditId] = await Promise.all([
    fetchFirstId(access_token, "assets"),
    fetchFirstId(access_token, "stock"),
    fetchFirstId(access_token, "purchase-requests"),
    fetchFirstId(access_token, "audit-sessions"),
  ]);
  console.log("Discovered IDs:", { assetId, stockId, prId, auditId });

  if (assetId) ROUTES.push({ name: "17-asset-detail",    path: `/assets/${assetId}`, auth: true });
  if (stockId) ROUTES.push({ name: "18-stock-detail",    path: `/stock/${stockId}`, auth: true });
  if (prId)    ROUTES.push({ name: "19-pr-detail",       path: `/purchase-requests/${prId}`, auth: true });
  if (auditId) ROUTES.push({ name: "20-audit-detail",    path: `/audit/${auditId}`, auth: true });
  if (assetId) ROUTES.push({ name: "21-public-asset",    path: `/public/asset/${assetId}`, auth: false });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_BIN || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // Prime localStorage on a blank page first
  await page.goto(WEB + "/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, refresh, user }) => {
    localStorage.setItem("npams_token", token);
    localStorage.setItem("npams_refresh", refresh);
    localStorage.setItem("npams_user", JSON.stringify(user));
  }, { token: access_token, refresh: refresh_token, user });

  for (const r of ROUTES) {
    const url = WEB + r.path;
    process.stdout.write(`-> ${r.name}  ${r.path} ... `);
    try {
      // For login screenshot, clear auth so the page renders
      if (!r.auth) {
        await page.evaluate(() => {
          localStorage.removeItem("npams_token");
          localStorage.removeItem("npams_refresh");
          localStorage.removeItem("npams_user");
        });
      } else {
        await page.evaluate(({ token, refresh, user }) => {
          localStorage.setItem("npams_token", token);
          localStorage.setItem("npams_refresh", refresh);
          localStorage.setItem("npams_user", JSON.stringify(user));
        }, { token: access_token, refresh: refresh_token, user });
      }
      await page.goto(url, { waitUntil: "networkidle", timeout: 25_000 }).catch(() => {});
      // Settle: wait for React to render and any data to load
      await page.waitForTimeout(r.path === "/gis" ? 3500 : 1800);
      const out = path.join(OUT, `${r.name}.jpg`);
      await page.screenshot({ path: out, fullPage: true, type: "jpeg", quality: 82 });
      console.log("OK", `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.log("FAIL", e.message);
    }
  }

  await browser.close();
  console.log("\nAll screenshots written to:", OUT);
})();
