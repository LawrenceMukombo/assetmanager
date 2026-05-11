import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, userRoles, roles, userScope, provinces, agencies } from "@workspace/db";
import {
  signAccessToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeAllRefreshTokens,
  requireAuth,
  type TokenPayload,
} from "../lib/auth";

const router = Router();

router.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ success: false, message: "Email and password required", data: null });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.active) {
      res.status(401).json({ success: false, message: "Invalid credentials", data: null });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, message: "Invalid credentials", data: null });
      return;
    }

    const [userRoleRow] = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))
      .limit(1);

    const [scope] = await db
      .select()
      .from(userScope)
      .where(eq(userScope.userId, user.id))
      .limit(1);

    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      roleId: userRoleRow?.role.id ?? "",
      roleName: userRoleRow?.role.roleName ?? "",
      scopeLevel: userRoleRow?.role.scopeLevel ?? "provincial",
      provinceId: scope?.provinceId ?? null,
      agencyId: scope?.agencyId ?? null,
      districtId: scope?.districtId ?? null,
      facilityId: scope?.facilityId ?? null,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = await issueRefreshToken(user.id);

    let provinceBranding: {
      provinceName: string;
      flagUrl: string | null;
      flagColors: string[];
      themeAccentColor: string | null;
    } | null = null;
    let provinceCode: string | null = null;
    let agencyBranding: {
      agencyName: string;
      agencyCode: string;
      flagUrl: string | null;
      flagColors: string[];
      themeAccentColor: string | null;
    } | null = null;

    if (scope?.provinceId) {
      const [prov] = await db
        .select({
          provinceName: provinces.provinceName,
          provinceCode: provinces.provinceCode,
          flagUrl: provinces.flagUrl,
          flagColors: provinces.flagColors,
          themeAccentColor: provinces.themeAccentColor,
        })
        .from(provinces)
        .where(eq(provinces.id, scope.provinceId))
        .limit(1);

      if (prov) {
        provinceCode = prov.provinceCode;
        provinceBranding = {
          provinceName: prov.provinceName,
          flagUrl: prov.flagUrl ?? null,
          flagColors: Array.isArray(prov.flagColors) ? (prov.flagColors as string[]) : [],
          themeAccentColor: prov.themeAccentColor ?? null,
        };
      }
    }

    if (scope?.agencyId) {
      const [ag] = await db
        .select({
          agencyName: agencies.agencyName,
          agencyCode: agencies.agencyCode,
          logoUrl: agencies.logoUrl,
          flagColors: agencies.flagColors,
          themeAccentColor: agencies.themeAccentColor,
        })
        .from(agencies)
        .where(eq(agencies.id, scope.agencyId))
        .limit(1);

      if (ag) {
        agencyBranding = {
          agencyName: ag.agencyName,
          agencyCode: ag.agencyCode,
          flagUrl: ag.logoUrl ?? null,
          flagColors: Array.isArray(ag.flagColors) ? (ag.flagColors as string[]) : [],
          themeAccentColor: ag.themeAccentColor ?? null,
        };
      }
    }

    res.json({
      success: true,
      message: "Login successful",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 28800,
        user: {
          id: user.id,
          full_name: user.fullName,
          email: user.email,
          role: userRoleRow?.role.roleName,
          scope_level: userRoleRow?.role.scopeLevel,
          scope: {
            province_id: scope?.provinceId ?? null,
            province_name: provinceBranding?.provinceName ?? null,
            province_code: provinceCode,
            agency_id: scope?.agencyId ?? null,
            agency_name: agencyBranding?.agencyName ?? null,
            agency_code: agencyBranding?.agencyCode ?? null,
            district_id: scope?.districtId ?? null,
            facility_id: scope?.facilityId ?? null,
          },
        },
        province_branding: provinceBranding,
        agency_branding: agencyBranding,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).json({ success: false, message: "Refresh token required", data: null });
    return;
  }
  try {
    const userId = await consumeRefreshToken(refresh_token);
    if (!userId) {
      res.status(401).json({ success: false, message: "Invalid or expired refresh token", data: null });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.active) {
      res.status(401).json({ success: false, message: "User not found or inactive", data: null });
      return;
    }

    const [userRoleRow] = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))
      .limit(1);

    const [scope] = await db
      .select()
      .from(userScope)
      .where(eq(userScope.userId, user.id))
      .limit(1);

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      roleId: userRoleRow?.role.id ?? "",
      roleName: userRoleRow?.role.roleName ?? "",
      scopeLevel: userRoleRow?.role.scopeLevel ?? "provincial",
      provinceId: scope?.provinceId ?? null,
      agencyId: scope?.agencyId ?? null,
      districtId: scope?.districtId ?? null,
      facilityId: scope?.facilityId ?? null,
    };

    const newRefreshToken = await issueRefreshToken(user.id);

    res.json({
      success: true,
      message: "Token refreshed",
      data: {
        access_token: signAccessToken(payload),
        refresh_token: newRefreshToken,
        expires_in: 28800,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Refresh token error");
    res.status(401).json({ success: false, message: "Invalid refresh token", data: null });
  }
});

router.post("/v1/auth/logout", requireAuth, async (req, res) => {
  try {
    await revokeAllRefreshTokens(req.user!.userId);
    res.json({ success: true, message: "Logged out successfully", data: null });
  } catch (err) {
    req.log.error({ err }, "Logout error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/auth/forgot-password", (_req, res) => {
  res.json({
    success: true,
    message: "If that email exists, a reset link will be sent",
    data: null,
  });
});

router.get("/v1/auth/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [row] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }
    res.json({ success: true, message: "Profile retrieved", data: row });
  } catch (err) {
    req.log.error({ err }, "Get me error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.patch("/v1/auth/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { full_name, phone_number } = req.body as { full_name?: string; phone_number?: string };

    if (!full_name && phone_number === undefined) {
      res.status(400).json({ success: false, message: "No fields to update", data: null });
      return;
    }

    const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({
        fullName: full_name ?? existing[0].fullName,
        phoneNumber: phone_number !== undefined ? phone_number : existing[0].phoneNumber,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id, fullName: users.fullName, email: users.email, phoneNumber: users.phoneNumber });

    res.json({ success: true, message: "Profile updated", data: updated });
  } catch (err) {
    req.log.error({ err }, "Update me error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

router.post("/v1/auth/change-password", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { old_password, new_password } = req.body as { old_password?: string; new_password?: string };

    if (!old_password || !new_password) {
      res.status(400).json({ success: false, message: "Both old_password and new_password are required", data: null });
      return;
    }
    if (new_password.length < 8) {
      res.status(400).json({ success: false, message: "New password must be at least 8 characters", data: null });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found", data: null });
      return;
    }

    const valid = await bcrypt.compare(old_password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, message: "Current password is incorrect", data: null });
      return;
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));

    res.json({ success: true, message: "Password changed successfully", data: null });
  } catch (err) {
    req.log.error({ err }, "Change password error");
    res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
});

export default router;
