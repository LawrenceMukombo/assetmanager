import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, refreshTokens } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "8h";
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const REFRESH_EXPIRES_IN = "7d";
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
}
if (!REFRESH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("REFRESH_SECRET environment variable is required in production");
  }
}

const jwtSecret = JWT_SECRET ?? "npams-dev-secret-do-not-use-in-prod";
const refreshSecret = REFRESH_SECRET ?? "npams-refresh-dev-secret-do-not-use-in-prod";

export interface TokenPayload {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  scopeLevel: string;
  provinceId: string | null;
  districtId: string | null;
  facilityId: string | null;
  scopedProvinceId?: string | null;
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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export function requireNational(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || req.user.scopeLevel !== "national") {
      res.status(403).json({ success: false, message: "National access required" });
      return;
    }
    next();
  });
}

export function requireUserAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user) return;
    const userAdminRoles = ["Super Admin", "Provincial Admin"];
    if (!userAdminRoles.includes(req.user.roleName)) {
      res.status(403).json({ success: false, message: "Insufficient privileges for user administration" });
      return;
    }
    next();
  });
}

export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  return requireAssetAdmin(req, res, next);
}

export function requireAssetAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user) return;
    const assetAdminRoles = ["Super Admin", "National Asset Controller", "Provincial Admin"];
    if (!assetAdminRoles.includes(req.user.roleName)) {
      res.status(403).json({ success: false, message: "Insufficient privileges" });
      return;
    }
    next();
  });
}

export function enforceScopeFilter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  if (req.user.scopeLevel === "national") {
    next();
    return;
  }

  const requestedProvinceId = (req.query.province_id as string) || (req.body?.province_id as string) || (req.params?.province_id as string);
  const requestedDistrictId = (req.query.district_id as string) || (req.body?.district_id as string) || (req.params?.district_id as string);
  const requestedFacilityId = (req.query.facility_id as string) || (req.body?.facility_id as string) || (req.params?.facility_id as string);

  if (requestedProvinceId && req.user.provinceId && requestedProvinceId !== req.user.provinceId) {
    res.status(403).json({ success: false, message: "Access denied: outside your geographic scope" });
    return;
  }

  if (requestedDistrictId && req.user.districtId && requestedDistrictId !== req.user.districtId) {
    res.status(403).json({ success: false, message: "Access denied: outside your district scope" });
    return;
  }

  if (requestedFacilityId && req.user.facilityId && requestedFacilityId !== req.user.facilityId) {
    res.status(403).json({ success: false, message: "Access denied: outside your facility scope" });
    return;
  }

  req.user.scopedProvinceId = (!requestedProvinceId && req.user.provinceId) ? req.user.provinceId : null;
  req.user.scopedDistrictId = (!requestedDistrictId && req.user.districtId) ? req.user.districtId : null;
  req.user.scopedFacilityId = (!requestedFacilityId && req.user.facilityId) ? req.user.facilityId : null;

  next();
}
