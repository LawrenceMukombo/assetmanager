import { pgTable, uuid, varchar, text, numeric, date, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { provinces } from "./provinces";
import { districts } from "./districts";
import { facilities } from "./facilities";
import { users } from "./users";

export const assetStatusEnum = pgEnum("asset_status", [
  "active",
  "disposed",
  "missing",
  "under_maintenance",
]);

export const assetConditionEnum = pgEnum("asset_condition", [
  "excellent",
  "good",
  "fair",
  "poor",
]);

export const assetCategories = pgTable("asset_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryName: varchar("category_name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetTag: varchar("asset_tag", { length: 100 }).notNull().unique(),
    assetName: varchar("asset_name", { length: 255 }).notNull(),
    categoryId: uuid("category_id").references(() => assetCategories.id),
    serialNumber: varchar("serial_number", { length: 255 }),
    brand: varchar("brand", { length: 255 }),
    model: varchar("model", { length: 255 }),
    purchaseDate: date("purchase_date"),
    purchaseCost: numeric("purchase_cost", { precision: 15, scale: 2 }),
    supplier: varchar("supplier", { length: 255 }),
    warrantyExpiry: date("warranty_expiry"),
    usefulLifeYears: integer("useful_life_years"),
    status: assetStatusEnum("status").notNull().default("active"),
    condition: assetConditionEnum("condition").notNull().default("good"),
    provinceId: uuid("province_id").references(() => provinces.id),
    districtId: uuid("district_id").references(() => districts.id),
    facilityId: uuid("facility_id").references(() => facilities.id),
    assignedToUser: uuid("assigned_to_user").references(() => users.id),
    createdBy: uuid("created_by").references(() => users.id),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_assets_asset_tag").on(t.assetTag),
    index("idx_assets_province_id").on(t.provinceId),
    index("idx_assets_district_id").on(t.districtId),
    index("idx_assets_facility_id").on(t.facilityId),
    index("idx_assets_status").on(t.status),
    index("idx_assets_category_id").on(t.categoryId),
  ],
);

export type AssetCategory = typeof assetCategories.$inferSelect;
export type InsertAssetCategory = typeof assetCategories.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;
