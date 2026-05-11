import { pgTable, uuid, varchar, text, pgEnum } from "drizzle-orm/pg-core";

export const scopeLevelEnum = pgEnum("scope_level", [
  "national",
  "provincial",
  "district",
  "facility",
  "agency",
]);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleName: varchar("role_name", { length: 100 }).notNull().unique(),
  description: text("description"),
  scopeLevel: scopeLevelEnum("scope_level").notNull(),
});

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
