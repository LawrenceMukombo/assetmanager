import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { provinces } from "./provinces";
import { agencies } from "./agencies";
import { facilities } from "./facilities";
import { users } from "./users";

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "receive",
  "issue",
  "transfer",
  "adjust",
]);

export const stockItems = pgTable(
  "stock_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemCode: varchar("item_code", { length: 100 }).notNull().unique(),
    itemName: varchar("item_name", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }),
    description: text("description"),
    unitOfMeasure: varchar("unit_of_measure", { length: 32 }).notNull().default("each"),
    onHandQuantity: integer("on_hand_quantity").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(0),
    unitCost: varchar("unit_cost", { length: 32 }),
    supplier: varchar("supplier", { length: 255 }),
    notes: text("notes"),
    provinceId: uuid("province_id").references(() => provinces.id),
    agencyId: uuid("agency_id").references(() => agencies.id),
    facilityId: uuid("facility_id").references(() => facilities.id),
    createdBy: uuid("created_by").references(() => users.id),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_items_item_code").on(t.itemCode),
    index("idx_stock_items_agency_id").on(t.agencyId),
    index("idx_stock_items_province_id").on(t.provinceId),
    index("idx_stock_items_facility_id").on(t.facilityId),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
    movementType: stockMovementTypeEnum("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    fromFacilityId: uuid("from_facility_id").references(() => facilities.id),
    toFacilityId: uuid("to_facility_id").references(() => facilities.id),
    issuedToUser: uuid("issued_to_user").references(() => users.id),
    issuedToName: varchar("issued_to_name", { length: 255 }),
    reference: varchar("reference", { length: 255 }),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_movements_item_id").on(t.stockItemId),
    index("idx_stock_movements_created_at").on(t.createdAt),
  ],
);

export type StockItem = typeof stockItems.$inferSelect;
export type InsertStockItem = typeof stockItems.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = typeof stockMovements.$inferInsert;
