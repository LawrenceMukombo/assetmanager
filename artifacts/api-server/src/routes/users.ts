import { Router } from "express";
import { eq, and, or, desc, gte, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  users,
  userRoles,
  roles,
  userScope,
  provinces,
  districts,
  facilities,
  refreshTokens,
  passwordResetEmailLog,
  assets,
  assetTransfers,
  auditSessions,
  auditAssignments,
  auditItems,
  maintenanceSchedules,
  stockItems,
  stockMovements,
  purchaseRequests,
  purchaseRequestEvents,
  activityLogs,
  notifications,
} from "@workspace/db";
import { requireAuth, requireUserAdmin } from "../lib/auth";
import { createPasswordResetToken, sendPasswordResetEmail } from "./auth";
import { sendEmail, resolveAppBaseUrl } from "../lib/mailer";
import { logger } from "../lib/logger";

const router = Router();

const PASSWORD_RESET_ALERT_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.PASSWORD_RESET_ALERT_THRESHOLD ?? "5", 10) || 5,
);
const PASSWORD_RESET_ALERT_WINDOW_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.PASSWORD_RESET_ALERT_WINDOW_MINUTES ?? "60", 10) || 60,
);

async function getPasswordResetAlertCounts(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - PASSWORD_RESET_ALERT_WINDOW_MINUTES * 60 * 1000);
  const rows = await db
    .select({
      userId: passwordResetEmailLog.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(passwordResetEmailLog)
    .where(gte(passwordResetEmailLog.createdAt, since))
    .groupBy(passwordResetEmailLog.userId);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.count > PASSWORD_RESET_ALERT_THRESHOLD) {
      map.set(r.userId, r.count);
    }
  }
  return map;
}

const PASSWORD_RESET_BURST_ACTION = "PASSWORD_RESET_BURST_ALERT";

export async function dispatchPasswordResetBurstAlertIfNeeded(targetUserId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - PASSWORD_RESET_ALERT_WINDOW_MINUTES * 60 * 1000);

    const [{ count: rawCount } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(passwordResetEmailLog)
      .where(
        and(
          eq(passwordResetEmailLog.userId, targetUserId),
          gte(passwordResetEmailLog.createdAt, since),
        ),
      );
    const count = Number(rawCount ?? 0);
    if (count <= PASSWORD_RESET_ALERT_THRESHOLD) return false;

    // Debounce: skip if we already alerted for this user within the window.
    const [recentAlert] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.actionType, PASSWORD_RESET_BURST_ACTION),
          eq(activityLogs.entityType, "user"),
          eq(activityLogs.entityId, targetUserId),
          gte(activityLogs.createdAt, since),
        ),
      )
      .limit(1);
    if (recentAlert) return false;

    const [target] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        provinceId: userScope.provinceId,
        agencyId: userScope.agencyId,
      })
      .from(users)
      .leftJoin(userScope, eq(userScope.userId, users.id))
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!target) return false;

    const userAdminRoleNames = ["Super Admin", "Provincial Admin", "Agency Admin"];

    const adminRows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roleName: roles.roleName,
        scopeLevel: roles.scopeLevel,
        provinceId: userScope.provinceId,
        agencyId: userScope.agencyId,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(userScope, eq(userScope.userId, users.id))
      .where(and(eq(users.active, true), sql`${roles.roleName} IN ('Super Admin','Provincial Admin','Agency Admin')`));

    const recipients = new Map<string, { email: string; fullName: string }>();
    for (const a of adminRows) {
      if (!a.id || !userAdminRoleNames.includes(a.roleName)) continue;
      const matches =
        a.scopeLevel === "national" ||
        a.roleName === "Super Admin" ||
        (a.roleName === "Provincial Admin" && target.provinceId && a.provinceId === target.provinceId) ||
        (a.roleName === "Agency Admin" && target.agencyId && a.agencyId === target.agencyId);
      if (matches && a.email) {
        recipients.set(a.id, { email: a.email, fullName: a.fullName });
      }
    }

    if (recipients.size === 0) return false;

    const title = `Unusual password reset activity: ${target.fullName}`;
    const message =
      `${target.fullName} (${target.email}) received ${count} password reset emails in the last ` +
      `${PASSWORD_RESET_ALERT_WINDOW_MINUTES} minute${PASSWORD_RESET_ALERT_WINDOW_MINUTES === 1 ? "" : "s"}, ` +
      `which is above the threshold of ${PASSWORD_RESET_ALERT_THRESHOLD}. ` +
      `Open the user profile to review the reset history.`;

    await db
      .insert(notifications)
      .values(
        Array.from(recipients.keys()).map((uid) => ({
          userId: uid,
          title,
          message,
          entityType: "user",
          entityId: target.id,
        })),
      )
      .catch(() => null);

    const emailEnabled =
      (process.env.PASSWORD_RESET_BURST_EMAIL_ENABLED ?? "true").toLowerCase() !== "false";
    let emailsSent = 0;
    let emailsFailed = 0;
    if (emailEnabled) {
      const editUrl = `${resolveAppBaseUrl()}/users?edit=${encodeURIComponent(target.id)}`;
      const subject = `NPAMS — Unusual password reset activity for ${target.fullName}`;
      const windowLabel = `${PASSWORD_RESET_ALERT_WINDOW_MINUTES} minute${
        PASSWORD_RESET_ALERT_WINDOW_MINUTES === 1 ? "" : "s"
      }`;
      for (const recipient of recipients.values()) {
        const text =
          `Hello ${recipient.fullName},\n\n` +
          `NPAMS detected unusual password reset activity on a user account.\n\n` +
          `User: ${target.fullName} (${target.email})\n` +
          `Reset emails sent: ${count} in the last ${windowLabel}\n` +
          `Alert threshold: ${PASSWORD_RESET_ALERT_THRESHOLD}\n\n` +
          `Open the user profile to review the reset history and take action if needed:\n` +
          `${editUrl}\n\n` +
          `— NPAMS`;
        const html =
          `<p>Hello ${recipient.fullName},</p>` +
          `<p>NPAMS detected unusual password reset activity on a user account.</p>` +
          `<ul>` +
          `<li><strong>User:</strong> ${target.fullName} (${target.email})</li>` +
          `<li><strong>Reset emails sent:</strong> ${count} in the last ${windowLabel}</li>` +
          `<li><strong>Alert threshold:</strong> ${PASSWORD_RESET_ALERT_THRESHOLD}</li>` +
          `</ul>` +
          `<p>Open the user profile to review the reset history and take action if needed:</p>` +
          `<p><a href="${editUrl}">${editUrl}</a></p>` +
          `<p>— NPAMS</p>`;
        try {
          await sendEmail({ to: recipient.email, subject, text, html });
          emailsSent += 1;
        } catch (err) {
          emailsFailed += 1;
          logger.error(
            { err, targetUserId: target.id },
            "[mailer] Failed to send password reset burst alert email",
          );
        }
      }
    }

    await db
      .insert(activityLogs)
      .values({
        userId: null,
        actionType: PASSWORD_RESET_BURST_ACTION,
        entityType: "user",
        entityId: target.id,
        description: `Dispatched password-reset burst alert (${count} resets in ${PASSWORD_RESET_ALERT_WINDOW_MINUTES}m) to ${recipients.size} admin(s).`,
        metadata: {
          count,
          threshold: PASSWORD_RESET_ALERT_THRESHOLD,
          windowMinutes: PASSWORD_RESET_ALERT_WINDOW_MINUTES,
          recipientCount: recipients.size,
          emailEnabled,
          emailsSent,
          emailsFailed,
        },
      })
      .catch(() => null);

    return true;
  } catch {
    return false;
  }
}

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
          id: userScope.id,
          provinceId: userScope.provinceId,
          agencyId: userScope.agencyId,
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

    const alertCounts = await getPasswordResetAlertCounts();

    const user = req.user;
    const filtered =
      user.scopeLevel === "national"
        ? allUsers
        : allUsers.filter((u) => {
            if (user.scopeLevel === "agency" || user.agencyId) {
              return !!user.agencyId && u.scope?.agencyId === user.agencyId;
            }
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

    const enriched = filtered.map((u) => {
      const count = u.id ? alertCounts.get(u.id) : undefined;
      return {
        ...u,
        passwordResetAlert: count
          ? {
              count,
              threshold: PASSWORD_RESET_ALERT_THRESHOLD,
              windowMinutes: PASSWORD_RESET_ALERT_WINDOW_MINUTES,
            }
          : null,
      };
    });

    res.json({ success: true, message: "Users retrieved", data: enriched });
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
          id: userScope.id,
          provinceId: userScope.provinceId,
          agencyId: userScope.agencyId,
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
      if (viewer.scopeLevel === "agency" || viewer.agencyId) {
        allowed = !!viewer.agencyId && targetScope?.agencyId === viewer.agencyId;
      } else if (viewer.facilityId) {
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

router.get("/v1/users/:id/activity", requireAuth, async (req, res) => {
  if (!req.user) return;
  const targetId = req.params.id as string;

  try {
    const [targetScope] = await db
      .select()
      .from(userScope)
      .where(eq(userScope.userId, targetId))
      .limit(1);

    const viewer = req.user;
    if (viewer.scopeLevel !== "national" && viewer.userId !== targetId) {
      let allowed = false;
      if (viewer.scopeLevel === "agency" || viewer.agencyId) {
        allowed = !!viewer.agencyId && !!targetScope && targetScope.agencyId === viewer.agencyId;
      } else if (viewer.facilityId) {
        allowed = !!targetScope && targetScope.facilityId === viewer.facilityId;
      } else if (viewer.districtId) {
        allowed = !!targetScope && targetScope.districtId === viewer.districtId;
      } else if (viewer.provinceId) {
        allowed = !!targetScope && targetScope.provinceId === viewer.provinceId;
      }
      if (!allowed) {
        res.status(403).json({ success: false, message: "Access denied", data: null });
        return;
      }
    }

    const rows = await db
      .select({
        id: activityLogs.id,
        actionType: activityLogs.actionType,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        description: activityLogs.description,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(eq(activityLogs.userId, targetId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(10);

    res.json({ success: true, message: "Activity retrieved", data: rows });
  } catch (err) {
    req.log.error({ err }, "Get user activity error");
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

    const { full_name, phone_number, department, job_title, gender, date_of_birth, role_id, province_id, district_id, facility_id, password } = req.body;

    if (password !== undefined && password !== null && password !== "") {
      if (typeof password !== "string" || password.length < 8) {
        res.status(400).json({ success: false, message: "Password must be at least 8 characters", data: null });
        return;
      }
    }

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

    const passwordHash = password ? await bcrypt.hash(password as string, 10) : undefined;

    const [updated] = await db
      .update(users)
      .set({
        ...(full_name !== undefined && { fullName: full_name as string }),
        ...(phone_number !== undefined && { phoneNumber: phone_number as string | null }),
        ...(department !== undefined && { department: department as string | null }),
        ...(job_title !== undefined && { jobTitle: job_title as string | null }),
        ...(gender !== undefined && { gender: gender as string | null }),
        ...(date_of_birth !== undefined && { dateOfBirth: date_of_birth as string | null }),
        ...(passwordHash !== undefined && { passwordHash }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId))
      .returning();

    if (passwordHash !== undefined) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, targetId));
    }

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

router.delete("/v1/users/:id", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;

  if (req.user.scopeLevel !== "national") {
    res.status(403).json({ success: false, message: "Only national admins can delete users", data: null });
    return;
  }

  const targetId = req.params.id as string;

  if (req.user.userId === targetId) {
    res.status(400).json({ success: false, message: "You cannot delete your own account", data: null });
    return;
  }

  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!existing) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    const refChecks: { table: string; condition: ReturnType<typeof eq> | ReturnType<typeof or> }[] = [
      { table: "asset records", condition: or(eq(assets.assignedToUser, targetId), eq(assets.createdBy, targetId))! },
      { table: "asset transfers", condition: eq(assetTransfers.transferredBy, targetId) },
      { table: "audit sessions", condition: eq(auditSessions.createdBy, targetId) },
      { table: "audit assignments", condition: eq(auditAssignments.assignedTo, targetId) },
      { table: "audit verifications", condition: eq(auditItems.verifiedBy, targetId) },
      { table: "maintenance jobs", condition: or(eq(maintenanceSchedules.assignedTo, targetId), eq(maintenanceSchedules.createdBy, targetId))! },
      { table: "stock items", condition: eq(stockItems.createdBy, targetId) },
      { table: "stock movements", condition: or(eq(stockMovements.issuedToUser, targetId), eq(stockMovements.actorUserId, targetId))! },
      { table: "purchase requests", condition: or(eq(purchaseRequests.requestedBy, targetId), eq(purchaseRequests.approvedBy, targetId))! },
      { table: "purchase request events", condition: eq(purchaseRequestEvents.actorUserId, targetId) },
      { table: "activity logs", condition: eq(activityLogs.userId, targetId) },
    ];

    const checks = await Promise.all([
      db.select({ id: assets.id }).from(assets).where(refChecks[0].condition).limit(1),
      db.select({ id: assetTransfers.id }).from(assetTransfers).where(refChecks[1].condition).limit(1),
      db.select({ id: auditSessions.id }).from(auditSessions).where(refChecks[2].condition).limit(1),
      db.select({ id: auditAssignments.id }).from(auditAssignments).where(refChecks[3].condition).limit(1),
      db.select({ id: auditItems.id }).from(auditItems).where(refChecks[4].condition).limit(1),
      db.select({ id: maintenanceSchedules.id }).from(maintenanceSchedules).where(refChecks[5].condition).limit(1),
      db.select({ id: stockItems.id }).from(stockItems).where(refChecks[6].condition).limit(1),
      db.select({ id: stockMovements.id }).from(stockMovements).where(refChecks[7].condition).limit(1),
      db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(refChecks[8].condition).limit(1),
      db.select({ id: purchaseRequestEvents.id }).from(purchaseRequestEvents).where(refChecks[9].condition).limit(1),
      db.select({ id: activityLogs.id }).from(activityLogs).where(refChecks[10].condition).limit(1),
    ]);

    const blockingTables = checks
      .map((rows, i) => (rows.length > 0 ? refChecks[i].table : null))
      .filter((t): t is string => t !== null);

    if (blockingTables.length > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete: this user has historical references in ${blockingTables.join(", ")}. Deactivate the account instead.`,
        data: { references: blockingTables },
      });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(notifications).where(eq(notifications.userId, targetId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, targetId));
      await tx.delete(userRoles).where(eq(userRoles.userId, targetId));
      await tx.delete(userScope).where(eq(userScope.userId, targetId));
      await tx.delete(users).where(eq(users.id, targetId));
    });

    res.json({ success: true, message: "User deleted", data: null });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "23503") {
      res.status(409).json({
        success: false,
        message: "Cannot delete: this user is still referenced by other records. Deactivate the account instead.",
        data: null,
      });
      return;
    }
    req.log.error({ err }, "Delete user error");
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

router.post("/v1/users/:id/send-password-reset", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;
  const targetId = String(req.params.id);

  try {
    const [target] = await db
      .select({ id: users.id, email: users.email, fullName: users.fullName, active: users.active })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);
    if (!target) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }
    if (!target.active) {
      res.status(400).json({ success: false, message: "Cannot send reset link to an inactive account. Reactivate the user first.", data: null });
      return;
    }

    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, targetId)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot modify user outside your province", data: null });
      return;
    }

    const { rawToken, expiresAt } = await createPasswordResetToken(target.id, req.user.userId, "admin");
    const result = await sendPasswordResetEmail(
      { id: target.id, email: target.email, fullName: target.fullName },
      rawToken,
      expiresAt,
      { requestedBy: req.user.userId, requestedVia: "admin" },
    );

    res.json({
      success: true,
      message: result.delivered
        ? `Password reset link emailed to ${target.email}`
        : `Reset link generated for ${target.email}, but no SMTP is configured — link was logged on the server. Use the direct password reset for offline cases.`,
      data: {
        email: target.email,
        delivered: result.delivered,
        transport: result.transport,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Send password reset error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/users/:id/last-password-reset-email", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;
  const targetId = String(req.params.id);

  try {
    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, targetId)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot view audit data for users outside your province", data: null });
      return;
    }

    const requestedByAlias = {
      id: users.id,
      fullName: users.fullName,
      email: users.email,
    };

    const [row] = await db
      .select({
        id: passwordResetEmailLog.id,
        recipientEmail: passwordResetEmailLog.recipientEmail,
        requestedVia: passwordResetEmailLog.requestedVia,
        requestedById: passwordResetEmailLog.requestedBy,
        transport: passwordResetEmailLog.transport,
        delivered: passwordResetEmailLog.delivered,
        messageId: passwordResetEmailLog.messageId,
        errorMessage: passwordResetEmailLog.errorMessage,
        createdAt: passwordResetEmailLog.createdAt,
        requestedByName: requestedByAlias.fullName,
        requestedByEmail: requestedByAlias.email,
      })
      .from(passwordResetEmailLog)
      .leftJoin(users, eq(users.id, passwordResetEmailLog.requestedBy))
      .where(eq(passwordResetEmailLog.userId, targetId))
      .orderBy(desc(passwordResetEmailLog.createdAt))
      .limit(1);

    res.json({
      success: true,
      message: "Last password reset email retrieved",
      data: row ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Get last password reset email error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.get("/v1/users/:id/password-reset-emails", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;
  const targetId = String(req.params.id);

  try {
    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, targetId)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot view audit data for users outside your province", data: null });
      return;
    }

    const requestedByAlias = {
      fullName: users.fullName,
      email: users.email,
    };

    const rows = await db
      .select({
        id: passwordResetEmailLog.id,
        recipientEmail: passwordResetEmailLog.recipientEmail,
        requestedVia: passwordResetEmailLog.requestedVia,
        requestedById: passwordResetEmailLog.requestedBy,
        transport: passwordResetEmailLog.transport,
        delivered: passwordResetEmailLog.delivered,
        messageId: passwordResetEmailLog.messageId,
        errorMessage: passwordResetEmailLog.errorMessage,
        createdAt: passwordResetEmailLog.createdAt,
        requestedByName: requestedByAlias.fullName,
        requestedByEmail: requestedByAlias.email,
      })
      .from(passwordResetEmailLog)
      .leftJoin(users, eq(users.id, passwordResetEmailLog.requestedBy))
      .where(eq(passwordResetEmailLog.userId, targetId))
      .orderBy(desc(passwordResetEmailLog.createdAt))
      .limit(50);

    res.json({
      success: true,
      message: "Password reset email history retrieved",
      data: rows,
    });
  } catch (err) {
    req.log.error({ err }, "Get password reset email history error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get("/v1/users/:id/password-reset-emails.csv", requireAuth, requireUserAdmin, async (req, res) => {
  if (!req.user) return;
  const targetId = String(req.params.id);

  try {
    const [targetScope] = await db.select().from(userScope).where(eq(userScope.userId, targetId)).limit(1);
    if (req.user.scopeLevel !== "national" && targetScope?.provinceId !== req.user.provinceId) {
      res.status(403).json({ success: false, message: "Cannot view audit data for users outside your province", data: null });
      return;
    }

    const requestedByAlias = {
      fullName: users.fullName,
      email: users.email,
    };

    const rows = await db
      .select({
        id: passwordResetEmailLog.id,
        recipientEmail: passwordResetEmailLog.recipientEmail,
        requestedVia: passwordResetEmailLog.requestedVia,
        requestedById: passwordResetEmailLog.requestedBy,
        transport: passwordResetEmailLog.transport,
        delivered: passwordResetEmailLog.delivered,
        messageId: passwordResetEmailLog.messageId,
        errorMessage: passwordResetEmailLog.errorMessage,
        createdAt: passwordResetEmailLog.createdAt,
        requestedByName: requestedByAlias.fullName,
        requestedByEmail: requestedByAlias.email,
      })
      .from(passwordResetEmailLog)
      .leftJoin(users, eq(users.id, passwordResetEmailLog.requestedBy))
      .where(eq(passwordResetEmailLog.userId, targetId))
      .orderBy(desc(passwordResetEmailLog.createdAt))
      .limit(50);

    const header = ["timestamp", "recipient", "requester", "transport", "delivered", "message_id", "error"];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="password-reset-history-${targetId}.csv"`,
    );
    res.write(header.join(",") + "\r\n");

    for (const row of rows) {
      let requester: string;
      if (row.requestedVia === "self") {
        requester = "user (forgot password)";
      } else if (row.requestedByName || row.requestedByEmail) {
        requester = [row.requestedByName, row.requestedByEmail].filter(Boolean).join(" <") + (row.requestedByEmail ? ">" : "");
      } else {
        requester = "admin";
      }
      const line = [
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
        row.recipientEmail ?? "",
        requester,
        row.transport ?? "",
        row.delivered ? "yes" : "no",
        row.messageId ?? "",
        row.errorMessage ?? "",
      ].map(csvEscape).join(",");
      res.write(line + "\r\n");
    }
    res.end();
  } catch (err) {
    req.log.error({ err }, "Export password reset email history error");
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Internal server error", data: null });
    } else {
      res.end();
    }
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
