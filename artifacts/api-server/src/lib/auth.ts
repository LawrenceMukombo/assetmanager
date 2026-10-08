import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, refreshTokens, users, userRoles, roles, userScope } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "8h";
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
}

const jwtSecret = JWT_SECRET ?? "npams-dev-secret-do-not-use-in-prod";

export interface TokenPayload {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  scopeLevel: string;
  provinceId: string | null;
  agencyId: string | null;
  districtId: string | null;
  facilityId: string | null;
  scopedProvinceId?: string | null;
  scopedAgencyId?: string | null;
  scopedDistrictId?: string | null;
  scopedFacilityId?: string | null;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(48).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);
  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
  return rawToken;
}

export async function consumeRefreshToken(rawToken: string): Promise<string | null> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) return null;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));

  return row.userId;
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, jwtSecret) as TokenPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

async function loadDbScope(userId: string): Promise<TokenPayload | null> {
  const [userRows, roleRows, scopeRows] = await Promise.all([
    db.select({ active: users.active }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))
      .limit(1),
    db.select().from(userScope).where(eq(userScope.userId, userId)).limit(1),
  ]);

  const user = userRows[0];
  if (!user || !user.active) return null;

  const roleRow = roleRows[0];
  const scope = scopeRows[0];

  return {
    userId,
    email: "",
    roleId: roleRow?.role.id ?? "",
    roleName: roleRow?.role.roleName ?? "",
    scopeLevel: roleRow?.role.scopeLevel ?? "provincial",
    provinceId: scope?.provinceId ?? null,
    agencyId: scope?.agencyId ?? null,
    districtId: scope?.districtId ?? null,
    facilityId: scope?.facilityId ?? null,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Authentication required", data: null });
    return;
  }
  const token = authHeader.slice(7);

  let tokenPayload: TokenPayload;
  try {
    tokenPayload = verifyAccessToken(token);
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token", data: null });
    return;
  }

  loadDbScope(tokenPayload.userId)
    .then((dbUser) => {
      if (!dbUser) {
        res.status(401).json({ success: false, message: "User account inactive or not found", data: null });
        return;
      }
      req.user = { ...dbUser, email: tokenPayload.email };
      const activeAgencyHeader = req.headers["x-active-agency-id"];
      if (
        activeAgencyHeader &&
        typeof activeAgencyHeader === "string" &&
        activeAgencyHeader !== "all" &&
        (req.user.roleName === "Super Admin" || req.user.scopeLevel === "national")
      ) {
        req.user.agencyId = activeAgencyHeader;
        req.user.scopedAgencyId = activeAgencyHeader;
      }
      next();
    })
    .catch(() => {
      res.status(500).json({ success: false, message: "Authentication error", data: null });
    });
}

export const requireAuthWithDbScope = requireAuth;

function checkRole(
  req: Request,
  res: Response,
  next: NextFunction,
  check: (user: TokenPayload) => boolean,
  message: string,
): void {
  if (req.user) {
    if (!check(req.user)) {
      res.status(403).json({ success: false, message, data: null });
      return;
    }
    next();
  } else {
    requireAuth(req, res, () => {
      if (!req.user || !check(req.user)) {
        res.status(403).json({ success: false, message, data: null });
        return;
      }
      next();
    });
  }
}

export function requireNational(req: Request, res: Response, next: NextFunction): void {
  checkRole(req, res, next, (u) => u.scopeLevel === "national", "National access required");
}

export function requireUserAdmin(req: Request, res: Response, next: NextFunction): void {
  const userAdminRoles = ["Super Admin", "Provincial Admin", "Agency Admin"];
  checkRole(req, res, next, (u) => userAdminRoles.includes(u.roleName), "Insufficient privileges for user administration");
}

export function requireAssetAdmin(req: Request, res: Response, next: NextFunction): void {
  const assetAdminRoles = ["Super Admin", "National Asset Controller", "Provincial Admin", "Provincial Asset Officer", "Agency Admin"];
  checkRole(req, res, next, (u) => assetAdminRoles.includes(u.roleName), "Insufficient privileges");
}

export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  return requireAssetAdmin(req, res, next);
}

export interface EffectiveScope {
  provinceId: string | null;
  agencyId: string | null;
  districtId: string | null;
  facilityId: string | null;
}

export function resolveEffectiveScope(user: TokenPayload): EffectiveScope {
  return {
    provinceId: user.scopedProvinceId ?? null,
    agencyId: user.scopedAgencyId ?? null,
    districtId: user.scopedDistrictId ?? null,
    facilityId: user.scopedFacilityId ?? null,
  };
}

export interface AssetScopeCheckFields {
  provinceId: string | null;
  agencyId?: string | null;
  districtId?: string | null;
  facilityId?: string | null;
}

export function isWithinAssetScope(user: TokenPayload, asset: AssetScopeCheckFields): boolean {
  if (user.scopeLevel === "national") return true;

  // Agency-scoped users can only see assets owned by their agency
  if (user.scopeLevel === "agency" || user.agencyId) {
    return !!user.agencyId && asset.agencyId === user.agencyId;
  }

  if (user.facilityId) {
    return asset.facilityId === user.facilityId;
  }

  if (user.districtId) {
    return asset.districtId === user.districtId;
  }

  if (user.provinceId) {
    return asset.provinceId === user.provinceId;
  }

  return false;
}

export function enforceScopeFilter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required", data: null });
    return;
  }

  if (req.user.scopeLevel === "national") {
    const activeAgencyHeader = req.headers["x-active-agency-id"] as string | undefined;
    const requestedAgencyId =
      (req.query.agency_id as string | undefined) ||
      (req.body?.agency_id as string | undefined) ||
      (req.params?.agency_id as string | undefined) ||
      (activeAgencyHeader && activeAgencyHeader !== "all" ? activeAgencyHeader : undefined);

    req.user.scopedProvinceId = null;
    req.user.scopedAgencyId = requestedAgencyId || req.user.scopedAgencyId || null;
    req.user.scopedDistrictId = null;
    req.user.scopedFacilityId = null;
    next();
    return;
  }

  // Agency-scoped users: lock province/district/facility, force agencyId to user's agency
  if (req.user.scopeLevel === "agency" || req.user.agencyId) {
    if (!req.user.agencyId) {
      res.status(403).json({ success: false, message: "Agency scope required but no agency assigned", data: null });
      return;
    }
    const requestedAgencyId = (req.query.agency_id as string | undefined) || (req.body?.agency_id as string | undefined) || (req.params?.agency_id as string | undefined) || undefined;
    if (requestedAgencyId !== undefined && requestedAgencyId !== req.user.agencyId) {
      res.status(403).json({ success: false, message: "Access denied: outside your agency scope", data: null });
      return;
    }
    req.user.scopedProvinceId = null;
    req.user.scopedAgencyId = req.user.agencyId;
    req.user.scopedDistrictId = null;
    req.user.scopedFacilityId = null;
    next();
    return;
  }

  const requestedProvinceId = (req.query.province_id as string | undefined) || (req.body?.province_id as string | undefined) || (req.params?.province_id as string | undefined) || undefined;
  const requestedDistrictId = (req.query.district_id as string | undefined) || (req.body?.district_id as string | undefined) || (req.params?.district_id as string | undefined) || undefined;
  const requestedFacilityId = (req.query.facility_id as string | undefined) || (req.body?.facility_id as string | undefined) || (req.params?.facility_id as string | undefined) || undefined;

  if (requestedProvinceId !== undefined && req.user.provinceId !== null && requestedProvinceId !== req.user.provinceId) {
    res.status(403).json({ success: false, message: "Access denied: outside your geographic scope", data: null });
    return;
  }

  if (requestedDistrictId !== undefined && req.user.districtId !== null && requestedDistrictId !== req.user.districtId) {
    res.status(403).json({ success: false, message: "Access denied: outside your district scope", data: null });
    return;
  }

  if (requestedFacilityId !== undefined && req.user.facilityId !== null && requestedFacilityId !== req.user.facilityId) {
    res.status(403).json({ success: false, message: "Access denied: outside your facility scope", data: null });
    return;
  }

  req.user.scopedProvinceId = requestedProvinceId ?? req.user.provinceId ?? null;
  req.user.scopedAgencyId = null;
  req.user.scopedDistrictId = requestedDistrictId ?? req.user.districtId ?? null;
  req.user.scopedFacilityId = requestedFacilityId ?? req.user.facilityId ?? null;

  next();
}
