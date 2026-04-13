import { pgTable, uuid, varchar, text, timestamp, pgEnum, numeric, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { provinces } from "./provinces";
import { districts } from "./districts";
import { facilities } from "./facilities";
import { assets } from "./assets";

export const auditSessionStatusEnum = pgEnum("audit_session_status", [
  "planned",
  "active",
  "completed",
  "cancelled",
]);

export const auditAssignmentStatusEnum = pgEnum("audit_assignment_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const auditItemStatusEnum = pgEnum("audit_item_status", [
  "pending",
  "verified",
  "not_found",
  "damaged",
]);

export const auditSessions = pgTable("audit_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  provinceId: uuid("province_id").references(() => provinces.id),
  createdBy: uuid("created_by").references(() => users.id),
  status: auditSessionStatusEnum("status").notNull().default("planned"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_audit_sessions_province").on(t.provinceId),
  index("idx_audit_sessions_status").on(t.status),
]);

export const auditAssignments = pgTable("audit_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => auditSessions.id),
  provinceId: uuid("province_id").references(() => provinces.id),
  districtId: uuid("district_id").references(() => districts.id),
  facilityId: uuid("facility_id").references(() => facilities.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  status: auditAssignmentStatusEnum("status").notNull().default("pending"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_audit_assignments_session").on(t.sessionId),
  index("idx_audit_assignments_assigned").on(t.assignedTo),
]);

export const auditItems = pgTable("audit_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => auditAssignments.id),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  status: auditItemStatusEnum("status").notNull().default("pending"),
  conditionObserved: varchar("condition_observed", { length: 50 }),
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLon: numeric("gps_lon", { precision: 10, scale: 7 }),
  photoUrl: varchar("photo_url", { length: 1024 }),
  notes: text("notes"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
}, (t) => [
  index("idx_audit_items_assignment").on(t.assignmentId),
  index("idx_audit_items_asset").on(t.assetId),
]);

export type AuditSession = typeof auditSessions.$inferSelect;
export type InsertAuditSession = typeof auditSessions.$inferInsert;
export type AuditAssignment = typeof auditAssignments.$inferSelect;
export type InsertAuditAssignment = typeof auditAssignments.$inferInsert;
export type AuditItem = typeof auditItems.$inferSelect;
export type InsertAuditItem = typeof auditItems.$inferInsert;
