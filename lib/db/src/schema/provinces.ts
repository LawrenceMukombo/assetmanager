import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const provinces = pgTable("provinces", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  provinceName: varchar("province_name", { length: 255 }).notNull(),
  provinceCode: varchar("province_code", { length: 50 }).notNull().unique(),
  flagUrl: text("flag_url"),
  logoUrl: text("logo_url"),
  themeAccentColor: varchar("theme_accent_color", { length: 7 }),
  flagColors: jsonb("flag_colors").$type<string[]>().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Province = typeof provinces.$inferSelect;
export type InsertProvince = typeof provinces.$inferInsert;
