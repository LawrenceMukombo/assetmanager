import {
  db,
  users,
  userRoles,
  userScope,
  roles,
  assets,
  provinces,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as {
    success: boolean;
    data?: { access_token: string };
    message?: string;
  };
  if (!data.success || !data.data?.access_token) {
    throw new Error(`Login failed for ${email}: ${data.message}`);
  }
  return data.data.access_token;
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
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function deleteJson(url: string, token: string) {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
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
}

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const REFERENCED_EMAIL = `delete-test-referenced-${SUFFIX}@npams.test`;
const ORPHAN_EMAIL = `delete-test-orphan-${SUFFIX}@npams.test`;
const TAG = `DEL-TEST-${SUFFIX}`;

async function cleanup(referencedUserId: string | null, orphanUserId: string | null, assetId: string | null) {
  if (assetId) await db.delete(assets).where(eq(assets.id, assetId));
  for (const id of [referencedUserId, orphanUserId]) {
    if (!id) continue;
    await db.delete(userRoles).where(eq(userRoles.userId, id));
    await db.delete(userScope).where(eq(userScope.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
}

async function runTests() {
  console.log("\nNPAMS User Delete Guardrail Integration Test");
  console.log("=============================================\n");

  let referencedUserId: string | null = null;
  let orphanUserId: string | null = null;
  let assetId: string | null = null;

  try {
    const superToken = await login("superadmin@npams.gov.pg", "Admin1234!");

    const [provincialRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.roleName, "Provincial Admin"))
      .limit(1);
    if (!provincialRole) throw new Error("Provincial Admin role not found in DB");

    const [anyProvince] = await db.select({ id: provinces.id }).from(provinces).limit(1);
    const provinceId = anyProvince?.id;
    if (!provinceId) throw new Error("No province found in DB");

    // --- Create the referenced user (will own a historical record) ---
    const refCreate = await postJson(`${API_BASE}/api/v1/users`, superToken, {
      full_name: "Delete Test Referenced",
      email: REFERENCED_EMAIL,
      password: "Admin1234!",
      role_id: provincialRole.id,
      province_id: provinceId,
    });
    if (refCreate.status !== 201) {
      throw new Error(`Failed to create referenced test user: ${JSON.stringify(refCreate.body)}`);
    }
    referencedUserId = (refCreate.body.data as { id: string }).id;

    // --- Create the orphan user (no references) ---
    const orphanCreate = await postJson(`${API_BASE}/api/v1/users`, superToken, {
      full_name: "Delete Test Orphan",
      email: ORPHAN_EMAIL,
      password: "Admin1234!",
      role_id: provincialRole.id,
      province_id: provinceId,
    });
    if (orphanCreate.status !== 201) {
      throw new Error(`Failed to create orphan test user: ${JSON.stringify(orphanCreate.body)}`);
    }
    orphanUserId = (orphanCreate.body.data as { id: string }).id;

    // --- Seed an asset whose createdBy points at the referenced user ---
    const [asset] = await db
      .insert(assets)
      .values({
        assetTag: TAG,
        assetName: "Delete Test Asset",
        provinceId,
        createdBy: referencedUserId,
      })
      .returning();
    assetId = asset.id;

    // --- Case 1: delete user with historical reference → 409 ---
    const blocked = await deleteJson(`${API_BASE}/api/v1/users/${referencedUserId}`, superToken);
    assert(
      "DELETE user with referencing asset returns 409",
      blocked.status === 409,
      `Status: ${blocked.status}`,
    );
    const blockedMsg = String(blocked.body.message ?? "");
    assert(
      "409 message tells the caller to deactivate instead",
      /deactivate/i.test(blockedMsg),
      `Message: "${blockedMsg}"`,
    );
    assert(
      "409 lists 'asset records' in the references payload",
      Array.isArray((blocked.body.data as { references?: unknown })?.references) &&
        ((blocked.body.data as { references: string[] }).references).includes("asset records"),
      `Refs: ${JSON.stringify((blocked.body.data as { references?: unknown })?.references)}`,
    );

    const [stillThere] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, referencedUserId))
      .limit(1);
    assert(
      "Referenced user still exists in the database after blocked delete",
      !!stillThere,
      `Found: ${!!stillThere}`,
    );

    // --- Case 2: delete user with no references → 200 + cascades ---
    const ok = await deleteJson(`${API_BASE}/api/v1/users/${orphanUserId}`, superToken);
    assert(
      "DELETE user with no references returns 200",
      ok.status === 200 && ok.body.success === true,
      `Status: ${ok.status}, body: ${JSON.stringify(ok.body)}`,
    );

    const remainingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, orphanUserId))
      .limit(1);
    const remainingRoles = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(eq(userRoles.userId, orphanUserId));
    const remainingScope = await db
      .select({ id: userScope.id })
      .from(userScope)
      .where(eq(userScope.userId, orphanUserId));

    assert(
      "Orphan user row is gone after delete",
      remainingUser.length === 0,
      `Rows: ${remainingUser.length}`,
    );
    assert(
      "Orphan user_roles rows are gone after delete",
      remainingRoles.length === 0,
      `Rows: ${remainingRoles.length}`,
    );
    assert(
      "Orphan user_scope rows are gone after delete",
      remainingScope.length === 0,
      `Rows: ${remainingScope.length}`,
    );

    // The orphan was already deleted by the API; clear it so cleanup doesn't try again.
    orphanUserId = null;
  } finally {
    await cleanup(referencedUserId, orphanUserId, assetId);
  }

  console.log("\n=============================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Results: ${passed}/${results.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  } else {
    console.log("\nAll user-delete guardrail tests passed!");
  }
}

runTests()
  .catch((err) => {
    console.error("Test suite error:", err);
    process.exit(1);
  })
  .finally(async () => {
    const { pool } = await import("@workspace/db");
    await pool.end();
  });
