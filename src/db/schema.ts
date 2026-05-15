import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ─────

export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",
  "confirmed",
  "released",
]);

// ─── Warehouses ────

export const warehouses = pgTable("warehouses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Products ─────

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Inventory (stock per product per warehouse) ──────

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    warehouseId: uuid("warehouse_id")
      .references(() => warehouses.id, { onDelete: "cascade" })
      .notNull(),
    totalQuantity: integer("total_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inventory_product_warehouse_idx").on(
      table.productId,
      table.warehouseId
    ),
  ]
);

// ─── Reservations ─────

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    warehouseId: uuid("warehouse_id")
      .references(() => warehouses.id, { onDelete: "cascade" })
      .notNull(),
    quantity: integer("quantity").notNull(),
    status: reservationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
    releasedAt: timestamp("released_at"),
  },
  (table) => [
    index("reservations_status_idx").on(table.status),
    index("reservations_expires_idx").on(table.expiresAt),
  ]
);