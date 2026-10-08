import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { agencies } from "./agencies";

export const organizationSettings = pgTable("organization_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  agencyId: uuid("agency_id").references(() => agencies.id),
  organizationName: varchar("organization_name", { length: 255 }).notNull().default("Asset Manager"),
  shortCode: varchar("short_code", { length: 50 }).notNull().default("AM"),
  organizationType: varchar("organization_type", { length: 100 }).notNull().default("enterprise"),
  tagline: text("tagline").default("Enterprise Asset & Inventory Management"),
  systemTitle: varchar("system_title", { length: 255 }).default("Asset Management System"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  primaryColor: varchar("primary_color", { length: 30 }).default("#0F4C81"),
  accentColor: varchar("accent_color", { length: 30 }).default("#3B82F6"),
  currencyCode: varchar("currency_code", { length: 10 }).default("USD"),
  currencySymbol: varchar("currency_symbol", { length: 10 }).default("$"),
  hierarchyPreset: varchar("hierarchy_preset", { length: 50 }).default("corporate"),
  level1Label: varchar("level1_label", { length: 100 }).default("Division"),
  level1Plural: varchar("level1_plural", { length: 100 }).default("Divisions"),
  level2Label: varchar("level2_label", { length: 100 }).default("Department"),
  level2Plural: varchar("level2_plural", { length: 100 }).default("Departments"),
  level3Label: varchar("level3_label", { length: 100 }).default("Site / Room"),
  level3Plural: varchar("level3_plural", { length: 100 }).default("Sites / Rooms"),
  countryCode: varchar("country_code", { length: 50 }).default("PNG"),
  countryName: varchar("country_name", { length: 255 }).default("Papua New Guinea"),
  defaultLatitude: varchar("default_latitude", { length: 50 }),
  defaultLongitude: varchar("default_longitude", { length: 50 }),
  defaultZoom: varchar("default_zoom", { length: 10 }).default("6"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OrganizationSettings = typeof organizationSettings.$inferSelect;
export type InsertOrganizationSettings = typeof organizationSettings.$inferInsert;
