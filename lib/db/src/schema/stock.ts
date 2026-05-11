import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum, index, uniqueIndex, jsonb, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

export const purchaseRequestStatusEnum = pgEnum("purchase_request_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "received",
  "closed",
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

export const stockBalances = pgTable(
  "stock_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id),
    quantity: integer("quantity").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_balances_item_id").on(t.stockItemId),
    uniqueIndex("uq_stock_balances_item_facility").on(t.stockItemId, t.facilityId),
    uniqueIndex("uq_stock_balances_item_unassigned")
      .on(t.stockItemId)
      .where(sql`${t.facilityId} IS NULL`),
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

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestNumber: varchar("request_number", { length: 50 }).notNull().unique(),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
    supplier: varchar("supplier", { length: 255 }),
    quantity: integer("quantity").notNull(),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    unitCost: varchar("unit_cost", { length: 32 }),
    notes: text("notes"),
    status: purchaseRequestStatusEnum("status").notNull().default("submitted"),
    facilityId: uuid("facility_id").references(() => facilities.id),
    agencyId: uuid("agency_id").references(() => agencies.id),
    provinceId: uuid("province_id").references(() => provinces.id),
    requestedBy: uuid("requested_by").notNull().references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    rejectedReason: text("rejected_reason"),
    receivedAt: timestamp("received_at"),
    closedAt: timestamp("closed_at"),
    requiredByDate: date("required_by_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_purchase_requests_status").on(t.status),
    index("idx_purchase_requests_stock_item").on(t.stockItemId),
    index("idx_purchase_requests_agency").on(t.agencyId),
    index("idx_purchase_requests_province").on(t.provinceId),
    index("idx_purchase_requests_facility").on(t.facilityId),
    index("idx_purchase_requests_requested_by").on(t.requestedBy),
  ],
);

export type StockItem = typeof stockItems.$inferSelect;
export type InsertStockItem = typeof stockItems.$inferInsert;
export type StockBalance = typeof stockBalances.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = typeof stockMovements.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type InsertPurchaseRequest = typeof purchaseRequests.$inferInsert;

export const purchaseRequestEvents = pgTable(
  "purchase_request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => purchaseRequests.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorRole: varchar("actor_role", { length: 64 }),
    signedName: varchar("signed_name", { length: 255 }),
    signedHash: varchar("signed_hash", { length: 128 }),
    signedAt: timestamp("signed_at"),
    reason: text("reason"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pr_events_request").on(t.requestId),
    index("idx_pr_events_created").on(t.createdAt),
  ],
);

export type PurchaseRequestEvent = typeof purchaseRequestEvents.$inferSelect;
export type InsertPurchaseRequestEvent = typeof purchaseRequestEvents.$inferInsert;
