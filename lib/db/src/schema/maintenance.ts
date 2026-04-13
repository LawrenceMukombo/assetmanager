import { pgTable, uuid, varchar, text, timestamp, pgEnum, numeric, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { assets } from "./assets";

export const maintenancePriorityEnum = pgEnum("maintenance_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: maintenancePriorityEnum("priority").notNull().default("medium"),
  status: maintenanceStatusEnum("status").notNull().default("scheduled"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  completedDate: timestamp("completed_date"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  estimatedCost: numeric("estimated_cost", { precision: 15, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 15, scale: 2 }),
  notes: text("notes"),
  completionNotes: text("completion_notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_maintenance_asset").on(t.assetId),
  index("idx_maintenance_status").on(t.status),
  index("idx_maintenance_assigned").on(t.assignedTo),
  index("idx_maintenance_scheduled_date").on(t.scheduledDate),
]);

export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type InsertMaintenanceSchedule = typeof maintenanceSchedules.$inferInsert;
