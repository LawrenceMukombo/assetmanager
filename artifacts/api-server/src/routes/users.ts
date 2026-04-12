import { Router } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, users, userRoles, roles, userScope, provinces } from "@workspace/db";
import { requireAuth, requireUserAdmin } from "../lib/auth";

const router = Router();

router.get("/v1/users", requireAuth, async (req, res) => {
  if (!req.user) return;

  try {
    const allUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phoneNumber: users.phoneNumber,
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
              return u.scope?.districtId === user.districtId || u.scope?.facilityId != null;
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

  const { full_name, email, password, phone_number, role_id, province_id, district_id, facility_id } = req.body;

  if (!full_name || !email || !password || !role_id) {
    res.status(400).json({ success: false, message: "full_name, email, password, role_id are required", data: null });
    return;
  }

  if (req.user.scopeLevel !== "national" && req.user.provinceId && province_id && province_id !== req.user.provinceId) {
    res.status(403).json({ success: false, message: "Cannot create user outside your province", data: null });
    return;
  }

  if (req.user.scopeLevel !== "national" && !province_id && !req.user.provinceId) {
    res.status(400).json({ success: false, message: "province_id is required for provincial admins", data: null });
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
      .values({ fullName: full_name, email, passwordHash, phoneNumber: phone_number })
      .returning();

    await db.insert(userRoles).values({ userId: user.id, roleId: role_id });
    await db.insert(userScope).values({
      userId: user.id,
      provinceId: province_id ?? req.user.provinceId ?? null,
      districtId: district_id ?? null,
      facilityId: facility_id ?? null,
    });

    res.status(201).json({ success: true, message: "User created", data: { id: user.id, email: user.email, fullName: user.fullName, data: null } });
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

    if (req.user!.scopeLevel !== "national" && req.user!.userId !== req.params.id && row.scope?.provinceId !== req.user!.provinceId) {
      res.status(403).json({ success: false, message: "Access denied", data: null });
      return;
    }

    res.json({ success: true, message: "User retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get user error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.put("/v1/users/:id", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;

  try {
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(userScope, eq(userScope.userId, users.id))
      .where(eq(users.id, req.params.id as string))
      .limit(1);

    if (!targetUser) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, req.params.id as string)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot modify user outside your province", data: null });
      return;
    }

    const { full_name, phone_number } = req.body;
    const [updated] = await db
      .update(users)
      .set({ fullName: full_name, phoneNumber: phone_number, updatedAt: new Date() })
      .where(eq(users.id, req.params.id as string))
      .returning();

    res.json({ success: true, message: "User updated", data: { id: updated.id, fullName: updated.fullName, data: null } });
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

export default router;
