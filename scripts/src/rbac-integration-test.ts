import { db, users, userRoles, roles, userScope, assets, provinces } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as { success: boolean; data?: { access_token: string }; message?: string };
  if (!data.success || !data.data?.access_token) {
    throw new Error(`Login failed for ${email}: ${data.message}`);
  }
  return data.data.access_token;
}

async function getJson(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function postJson(url: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function putJson(url: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, passed: condition, detail });
  const icon = condition ? "✓" : "✗";
  console.log(`  ${icon} ${name}: ${detail}`);
  if (!condition) {
    console.error(`    FAILED`);
  }
}

async function runTests() {
  console.log("\nNPAMS RBAC Integration Test Suite");
  console.log("===================================\n");

  const superToken = await login("superadmin@npams.gov.pg", "Admin1234!");
  const morobeToken = await login("morobe.admin@npams.gov.pg", "Admin1234!");
  const whpToken = await login("whp.admin@npams.gov.pg", "Admin1234!");
  const ncdToken = await login("ncd.admin@npams.gov.pg", "Admin1234!");
  const nationalToken = await login("national@npams.gov.pg", "Admin1234!");
  const viewerToken = await login("morobe.viewer@npams.gov.pg", "Admin1234!");

  const provincesRes = await getJson(`${API_BASE}/api/v1/locations/provinces`, superToken);
  const provinceList = provincesRes.body.data as Array<{ id: string; provinceCode: string }>;
  const whpId = provinceList.find(p => p.provinceCode === "WHP")?.id ?? "";
  const morobeId = provinceList.find(p => p.provinceCode === "MO")?.id ?? "";
  const ncdId = provinceList.find(p => p.provinceCode === "NCD")?.id ?? "";

  console.log("--- Section 1: Cross-Province Asset Scope ---");

  const morobeWHPAssets = await getJson(`${API_BASE}/api/v1/assets?province_id=${whpId}`, morobeToken);
  assert(
    "Morobe admin requests WHP assets → 403",
    morobeWHPAssets.status === 403,
    `Status: ${morobeWHPAssets.status}, Msg: ${(morobeWHPAssets.body as { message?: string }).message}`
  );

  const morobeAutoScoped = await getJson(`${API_BASE}/api/v1/assets`, morobeToken);
  const morobeData = morobeAutoScoped.body.data as { pagination: { total: number } };
  assert(
    "Morobe admin auto-scoped to Morobe assets only",
    morobeData.pagination.total === 11,
    `Got ${morobeData.pagination.total} (expected 11)`
  );

  const whpMorobeAssets = await getJson(`${API_BASE}/api/v1/assets?province_id=${morobeId}`, whpToken);
  assert(
    "WHP admin requests Morobe assets → 403",
    whpMorobeAssets.status === 403,
    `Status: ${whpMorobeAssets.status}`
  );

  const superAllAssets = await getJson(`${API_BASE}/api/v1/assets`, superToken);
  const superData = superAllAssets.body.data as { pagination: { total: number } };
  assert(
    "Super admin sees all assets (30)",
    superData.pagination.total === 30,
    `Got ${superData.pagination.total} (expected 30)`
  );

  const nationalAllAssets = await getJson(`${API_BASE}/api/v1/assets`, nationalToken);
  const nationalData = nationalAllAssets.body.data as { pagination: { total: number } };
  assert(
    "National Asset Controller sees all assets (30)",
    nationalData.pagination.total === 30,
    `Got ${nationalData.pagination.total} (expected 30)`
  );

  console.log("\n--- Section 2: Role-Based Mutation Control ---");

  const viewerCreate = await postJson(`${API_BASE}/api/v1/assets`, viewerToken, {
    asset_name: "Unauthorized Asset",
    asset_tag: "UNAUTH-001",
  });
  assert(
    "Provincial Viewer cannot create asset → 403",
    viewerCreate.status === 403,
    `Status: ${viewerCreate.status}, Msg: ${(viewerCreate.body as { message?: string }).message}`
  );

  const morobeAssets = await getJson(`${API_BASE}/api/v1/assets`, morobeToken);
  const morobeAssetId = (morobeAssets.body.data as { items: Array<{ id: string }> }).items[0]?.id ?? "";

  const viewerUpdate = await putJson(`${API_BASE}/api/v1/assets/${morobeAssetId}`, viewerToken, { asset_name: "Hacked" });
  assert(
    "Provincial Viewer cannot update asset → 403",
    viewerUpdate.status === 403,
    `Status: ${viewerUpdate.status}`
  );

  const nacUserList = await getJson(`${API_BASE}/api/v1/users`, nationalToken);
  assert(
    "National Asset Controller cannot list users → 403",
    nacUserList.status === 403,
    `Status: ${nacUserList.status}, Msg: ${(nacUserList.body as { message?: string }).message}`
  );

  console.log("\n--- Section 3: Province Reassignment Protection ---");

  const morobeReassign = await putJson(`${API_BASE}/api/v1/assets/${morobeAssetId}`, morobeToken, {
    asset_name: "Try reassign",
    province_id: whpId,
  });
  assert(
    "Morobe admin cannot reassign asset to WHP → 403",
    morobeReassign.status === 403,
    `Status: ${morobeReassign.status}, Msg: ${(morobeReassign.body as { message?: string }).message}`
  );

  console.log("\n--- Section 4: QR Data IDOR Protection ---");

  const ncdAssets = await getJson(`${API_BASE}/api/v1/assets?province_id=${ncdId}`, superToken);
  const ncdAssetId = (ncdAssets.body.data as { items: Array<{ id: string }> }).items[0]?.id ?? "";

  const morobeGetNcdQr = await getJson(`${API_BASE}/api/v1/assets/${ncdAssetId}/qr-data`, morobeToken);
  assert(
    "Morobe admin cannot get QR of NCD asset → 403",
    morobeGetNcdQr.status === 403,
    `Status: ${morobeGetNcdQr.status}, Msg: ${(morobeGetNcdQr.body as { message?: string }).message}`
  );

  const superQr = await getJson(`${API_BASE}/api/v1/assets/${ncdAssetId}/qr-data`, superToken);
  assert(
    "Super admin can get QR of any asset → 200",
    superQr.status === 200,
    `Status: ${superQr.status}`
  );

  console.log("\n--- Section 5: Dashboard Access Control ---");

  const viewerNationalDash = await getJson(`${API_BASE}/api/v1/dashboard/national`, viewerToken);
  assert(
    "Viewer cannot access national dashboard → 403",
    viewerNationalDash.status === 403,
    `Status: ${viewerNationalDash.status}`
  );

  const superNationalDash = await getJson(`${API_BASE}/api/v1/dashboard/national`, superToken);
  assert(
    "Super admin can access national dashboard → 200",
    superNationalDash.status === 200,
    `Status: ${superNationalDash.status}`
  );

  console.log("\n--- Section 6: Reports Scope Enforcement ---");

  const morobeSummary = await getJson(`${API_BASE}/api/v1/reports/summary`, morobeToken);
  const morobeSummaryData = morobeSummary.body.data as Array<{ province_name: string }>;
  assert(
    "Morobe admin reports/summary shows only 1 province",
    morobeSummaryData.length === 1 && morobeSummaryData[0].province_name === "Morobe Province",
    `Got ${morobeSummaryData.length} provinces: ${morobeSummaryData.map(p => p.province_name).join(", ")}`
  );

  const superSummary = await getJson(`${API_BASE}/api/v1/reports/summary`, superToken);
  const superSummaryData = superSummary.body.data as Array<unknown>;
  assert(
    "Super admin reports/summary shows all 22 provinces",
    superSummaryData.length === 22,
    `Got ${superSummaryData.length} provinces (expected 22)`
  );

  console.log("\n--- Section 7: Response Contract ---");

  const provincesCheck = await getJson(`${API_BASE}/api/v1/locations/provinces`, superToken);
  assert(
    "Provinces response has { success, message, data }",
    !!(provincesCheck.body.success !== undefined && provincesCheck.body.message && provincesCheck.body.data),
    `success=${provincesCheck.body.success}, message=${provincesCheck.body.message}, data=${Array.isArray(provincesCheck.body.data) ? "array" : "missing"}`
  );

  const dashCheck = await getJson(`${API_BASE}/api/v1/dashboard/national`, superToken);
  assert(
    "National dashboard response has { success, message, data }",
    !!(dashCheck.body.success !== undefined && dashCheck.body.message && dashCheck.body.data),
    `success=${dashCheck.body.success}, message=${dashCheck.body.message}`
  );

  console.log("\n===================================");
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Results: ${passed}/${results.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  } else {
    console.log("\nAll RBAC integration tests passed!");
  }
}

runTests().catch(err => {
  console.error("Test suite error:", err);
  process.exit(1);
});
