import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agencyName: varchar("agency_name", { length: 255 }).notNull(),
  agencyCode: varchar("agency_code", { length: 50 }).notNull().unique(),
  agencyType: varchar("agency_type", { length: 100 }),
  logoUrl: text("logo_url"),
  themeAccentColor: varchar("theme_accent_color", { length: 7 }),
  flagColors: jsonb("flag_colors").$type<string[]>().default([]),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = typeof agencies.$inferInsert;
