import { Router } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, users, userRoles, roles, userScope, provinces, districts, facilities } from "@workspace/db";
import { requireAuth, requireUserAdmin } from "../lib/auth";

const router = Router();

async function validateGeoIntegrity(
  provinceId: string | null | undefined,
  districtId: string | null | undefined,
  facilityId: string | null | undefined,
): Promise<{ valid: boolean; message: string }> {
  if (facilityId) {
    const [fac] = await db
      .select({ districtId: facilities.districtId })
      .from(facilities)
      .where(eq(facilities.id, facilityId))
      .limit(1);
    if (!fac) return { valid: false, message: "Facility not found" };
    if (districtId && fac.districtId !== districtId) {
      return { valid: false, message: "Facility does not belong to specified district" };
    }
    if (provinceId) {
      const [dist] = await db
        .select({ provinceId: districts.provinceId })
        .from(districts)
        .where(eq(districts.id, fac.districtId))
        .limit(1);
      if (!dist || dist.provinceId !== provinceId) {
        return { valid: false, message: "Facility does not belong to specified province" };
      }
    }
    return { valid: true, message: "" };
  }

  if (districtId) {
    const [dist] = await db
      .select({ provinceId: districts.provinceId })
      .from(districts)
      .where(eq(districts.id, districtId))
      .limit(1);
    if (!dist) return { valid: false, message: "District not found" };
    if (provinceId && dist.provinceId !== provinceId) {
      return { valid: false, message: "District does not belong to specified province" };
    }
    return { valid: true, message: "" };
  }

  return { valid: true, message: "" };
}

router.get("/v1/users", requireAuth, async (req, res) => {
  if (!req.user) return;

  try {
    const allUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        department: users.department,
        jobTitle: users.jobTitle,
        gender: users.gender,
        dateOfBirth: users.dateOfBirth,
        active: users.active,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        role: {
          id: roles.id,
          roleName: roles.roleName,
          scopeLevel: roles.scopeLevel,
        },
        scope: {
          provinceId: userScope.provinceId,
          districtId: userScope.districtId,
          facilityId: userScope.facilityId,
        },
        provinceName: provinces.provinceName,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(userScope, eq(userScope.userId, users.id))
      .leftJoin(provinces, eq(userScope.provinceId, provinces.id))
      .orderBy(users.fullName);

    const user = req.user;
    const filtered =
      user.scopeLevel === "national"
        ? allUsers
        : allUsers.filter((u) => {
            if (user.facilityId) {
              return u.scope?.facilityId === user.facilityId;
            }
            if (user.districtId) {
              return u.scope?.districtId === user.districtId;
            }
            if (user.provinceId) {
              return u.scope?.provinceId === user.provinceId;
            }
            return false;
          });

    res.json({ success: true, message: "Users retrieved", data: filtered });
  } catch (err) {
    req.log.error({ err }, "Get users error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/users", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;

  const { full_name, email, password, phone_number, department, job_title, gender, date_of_birth, role_id, province_id, district_id, facility_id } = req.body;

  if (!full_name || !email || !password || !role_id) {
    res.status(400).json({ success: false, message: "full_name, email, password, role_id are required", data: null });
    return;
  }

  const effectiveProvinceId: string | null = province_id ?? req.user.provinceId ?? null;

  if (req.user.scopeLevel !== "national" && req.user.provinceId && province_id && province_id !== req.user.provinceId) {
    res.status(403).json({ success: false, message: "Cannot create user outside your province", data: null });
    return;
  }

  if (req.user.scopeLevel !== "national" && !effectiveProvinceId) {
    res.status(400).json({ success: false, message: "province_id is required for provincial admins", data: null });
    return;
  }

  const geoCheck = await validateGeoIntegrity(effectiveProvinceId, district_id, facility_id);
  if (!geoCheck.valid) {
    res.status(400).json({ success: false, message: geoCheck.message, data: null });
    return;
  }

  try {
    const [targetRole] = await db.select().from(roles).where(eq(roles.id, role_id)).limit(1);
    if (!targetRole) {
      res.status(400).json({ success: false, message: "Role not found", data: null });
      return;
    }

    if (req.user.scopeLevel !== "national" && targetRole.scopeLevel === "national") {
      res.status(403).json({ success: false, message: "Cannot assign national-level roles", data: null });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        fullName: full_name,
        email,
        passwordHash,
        phoneNumber: phone_number ?? null,
        department: department ?? null,
        jobTitle: job_title ?? null,
        gender: gender ?? null,
        dateOfBirth: date_of_birth ?? null,
      })
      .returning();

    await db.insert(userRoles).values({ userId: user.id, roleId: role_id });
    await db.insert(userScope).values({
      userId: user.id,
      provinceId: effectiveProvinceId,
      districtId: district_id ?? null,
      facilityId: facility_id ?? null,
    });

    res.status(201).json({ success: true, message: "User created", data: { id: user.id, email: user.email, fullName: user.fullName } });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "23505") {
      res.status(409).json({ success: false, message: "Email already exists", data: null });
      return;
    }
    req.log.error({ err }, "Create user error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/users/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        department: users.department,
        jobTitle: users.jobTitle,
        gender: users.gender,
        dateOfBirth: users.dateOfBirth,
        active: users.active,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        role: {
          id: roles.id,
          roleName: roles.roleName,
          scopeLevel: roles.scopeLevel,
        },
        scope: {
          provinceId: userScope.provinceId,
          districtId: userScope.districtId,
          facilityId: userScope.facilityId,
        },
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(userScope, eq(userScope.userId, users.id))
      .where(eq(users.id, req.params.id as string))
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    if (req.user!.scopeLevel !== "national" && req.user!.userId !== (req.params.id as string)) {
      const viewer = req.user!;
      const targetScope = row.scope;
      let allowed = false;
      if (viewer.facilityId) {
        allowed = targetScope?.facilityId === viewer.facilityId;
      } else if (viewer.districtId) {
        allowed = targetScope?.districtId === viewer.districtId;
      } else if (viewer.provinceId) {
        allowed = targetScope?.provinceId === viewer.provinceId;
      }
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied", data: null });
        return;
      }
    }

    res.json({ success: true, message: "User retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get user error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.put("/v1/users/:id", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;

  const targetId = req.params.id as string;

  try {
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    if (!existingUser) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    const [existingScope] = await db.select().from(userScope).where(eq(userScope.userId, targetId)).limit(1);

    if (req.user.scopeLevel !== "national" && existingScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot modify user outside your province", data: null });
      return;
    }

    const { full_name, phone_number, department, job_title, gender, date_of_birth, role_id, province_id, district_id, facility_id } = req.body;

    const newProvinceId: string | null | undefined = province_id !== undefined ? (province_id as string | null) : existingScope?.provinceId;
    const newDistrictId: string | null | undefined = district_id !== undefined ? (district_id as string | null) : existingScope?.districtId;
    const newFacilityId: string | null | undefined = facility_id !== undefined ? (facility_id as string | null) : existingScope?.facilityId;

    if (req.user.scopeLevel !== "national" && province_id && province_id !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot reassign user to a different province", data: null });
      return;
    }

    if (province_id !== undefined || district_id !== undefined || facility_id !== undefined) {
      const geoCheck = await validateGeoIntegrity(newProvinceId, newDistrictId, newFacilityId);
      if (!geoCheck.valid) {
        res.status(400).json({ success: false, message: geoCheck.message, data: null });
        return;
      }
    }

    let targetRole: { id: string; scopeLevel: string } | null = null;
    if (role_id) {
      const [found] = await db.select().from(roles).where(eq(roles.id, role_id as string)).limit(1);
      if (!found) {
        res.status(400).json({ success: false, message: "Role not found", data: null });
        return;
      }
      if (req.user.scopeLevel !== "national" && found.scopeLevel === "national") {
        res.status(403).json({ success: false, message: "Cannot assign national-level roles", data: null });
        return;
      }
      targetRole = found;
    }

    const resolvedRole = targetRole ?? (await db.select().from(roles).innerJoin(userRoles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, targetId)).limit(1).then(r => r[0]?.roles ?? null));
    if (resolvedRole && resolvedRole.scopeLevel !== "national") {
      const resolvedProvince = newProvinceId ?? (province_id === undefined ? existingScope?.provinceId : null);
      if (!resolvedProvince) {
        res.status(400).json({ success: false, message: "A province must be assigned for provincial roles", data: null });
        return;
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(full_name !== undefined && { fullName: full_name as string }),
        ...(phone_number !== undefined && { phoneNumber: phone_number as string | null }),
        ...(department !== undefined && { department: department as string | null }),
        ...(job_title !== undefined && { jobTitle: job_title as string | null }),
        ...(gender !== undefined && { gender: gender as string | null }),
        ...(date_of_birth !== undefined && { dateOfBirth: date_of_birth as string | null }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId))
      .returning();

    if (role_id) {
      await db.delete(userRoles).where(eq(userRoles.userId, targetId));
      await db.insert(userRoles).values({ userId: targetId, roleId: role_id as string });
    }

    if (province_id !== undefined || district_id !== undefined || facility_id !== undefined) {
      await db
        .update(userScope)
        .set({
          ...(province_id !== undefined && { provinceId: province_id as string | null }),
          ...(district_id !== undefined && { districtId: district_id as string | null }),
          ...(facility_id !== undefined && { facilityId: facility_id as string | null }),
        })
        .where(eq(userScope.userId, targetId));
    }

    res.json({ success: true, message: "User updated", data: { id: updated.id, fullName: updated.fullName } });
  } catch (err) {
    req.log.error({ err }, "Update user error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/users/:id/deactivate", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, req.params.id as string)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot modify user outside your province", data: null });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(users.id, req.params.id as string))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    res.json({ success: true, message: "User deactivated", data: null });
  } catch (err) {
    req.log.error({ err }, "Deactivate user error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/users/:id/reactivate", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const targetId = String(req.params.id);
    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, targetId)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot modify user outside your province", data: null });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(users.id, targetId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    res.json({ success: true, message: "User reactivated", data: null });
  } catch (err) {
    req.log.error({ err }, "Reactivate user error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/roles", requireAuth, requireUserAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({ id: roles.id, roleName: roles.roleName, scopeLevel: roles.scopeLevel })
      .from(roles)
      .orderBy(roles.roleName);
    res.json({ success: true, message: "Roles retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get roles error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
