import { pgTable, uuid, varchar, boolean, text, integer, decimal } from "drizzle-orm/pg-core";
import { provinces } from "./provinces";

export const districts = pgTable("districts", {
  id: uuid("id").primaryKey().defaultRandom(),
  provinceId: uuid("province_id").notNull().references(() => provinces.id),
  districtName: varchar("district_name", { length: 255 }).notNull(),
  districtCode: varchar("district_code", { length: 50 }).unique(),
  population: integer("population"),
  areaKm2: decimal("area_km2", { precision: 12, scale: 2 }),
  description: text("description"),
  active: boolean("active").notNull().default(true),
});

export type District = typeof districts.$inferSelect;
export type InsertDistrict = typeof districts.$inferInsert;
