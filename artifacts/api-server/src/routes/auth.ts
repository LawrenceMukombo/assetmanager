import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, userRoles, roles, userScope } from "@workspace/db";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  requireAuth,
  type TokenPayload,
} from "../lib/auth";

const router = Router();

router.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ success: false, message: "Email and password required" });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.active) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
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
      districtId: scope?.districtId ?? null,
      facilityId: scope?.facilityId ?? null,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(user.id);

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
            district_id: scope?.districtId ?? null,
            facility_id: scope?.facilityId ?? null,
          },
        },
      },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/v1/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).json({ success: false, message: "Refresh token required" });
    return;
  }
  try {
    const { userId } = verifyRefreshToken(refresh_token);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.active) {
      res.status(401).json({ success: false, message: "User not found or inactive" });
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
      districtId: scope?.districtId ?? null,
      facilityId: scope?.facilityId ?? null,
    };

    res.json({
      success: true,
      message: "Token refreshed",
      data: {
        access_token: signAccessToken(payload),
        expires_in: 28800,
      },
    });
  } catch {
    res.status(401).json({ success: false, message: "Invalid refresh token" });
  }
});

router.post("/v1/auth/logout", requireAuth, (_req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

router.post("/v1/auth/forgot-password", (_req, res) => {
  res.json({
    success: true,
    message: "If that email exists, a reset link will be sent",
  });
});

export default router;
