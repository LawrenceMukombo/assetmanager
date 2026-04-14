import { pgTable, uuid, varchar, text, decimal, boolean, integer, unique } from "drizzle-orm/pg-core";
import { districts } from "./districts";

export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  districtId: uuid("district_id").notNull().references(() => districts.id),
  facilityName: varchar("facility_name", { length: 255 }).notNull(),
  facilityType: varchar("facility_type", { length: 100 }),
  address: text("address"),
  description: text("description"),
  contactPhone: varchar("contact_phone", { length: 50 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  capacity: integer("capacity"),
  gpsLatitude: decimal("gps_latitude", { precision: 10, scale: 7 }),
  gpsLongitude: decimal("gps_longitude", { precision: 10, scale: 7 }),
  active: boolean("active").notNull().default(true),
}, (t) => [
  unique("facilities_district_name_unique").on(t.districtId, t.facilityName),
]);

export type Facility = typeof facilities.$inferSelect;
export type InsertFacility = typeof facilities.$inferInsert;
