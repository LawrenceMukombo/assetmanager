import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET ?? "npams-dev-secret-change-in-prod";
const JWT_EXPIRES_IN = "8h";
const REFRESH_SECRET = process.env.REFRESH_SECRET ?? "npams-refresh-dev-secret";
const REFRESH_EXPIRES_IN = "7d";

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
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
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

export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user) return;
    const adminRoles = ["Super Admin", "National Asset Controller", "Provincial Admin"];
    if (!adminRoles.includes(req.user.roleName)) {
      res.status(403).json({ success: false, message: "Admin access required" });
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

  const requestedProvinceId = (req.query.province_id as string) || (req.body?.province_id as string);

  if (requestedProvinceId && req.user.provinceId && requestedProvinceId !== req.user.provinceId) {
    res.status(403).json({ success: false, message: "Access denied: outside your geographic scope" });
    return;
  }

  if (!requestedProvinceId && req.user.provinceId) {
    req.user.scopedProvinceId = req.user.provinceId;
  } else {
    req.user.scopedProvinceId = null;
  }

  next();
}
