// Yego — Postgres schema (Supabase). Ported 1:1 from the original SQLite
// schema; column names are identical so the business logic is unchanged.
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const membershipPlans = pgTable("membership_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  billingType: text("billing_type", { enum: ["mensual", "comision", "mixto"] }).notNull(),
  monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
  commissionBps: integer("commission_bps").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  ownerKey: text("owner_key").unique(),
  applicationToken: text("application_token").unique(),
  currency: text("currency").notNull(),
  category: text("category", { enum: ["pizza", "mariscos", "hamburguesas", "pollo", "comida_ecuatoriana", "postres", "otro"] }).notNull().default("otro"),
  membershipPlanId: integer("membership_plan_id").references(() => membershipPlans.id, { onDelete: "set null" }),
  membershipStatus: text("membership_status", { enum: ["pendiente", "activo", "suspendido"] }).notNull().default("pendiente"),
  applicationStatus: text("application_status", { enum: ["pendiente", "en_revision", "rechazado", "aprobado"] }).notNull().default("pendiente"),
  orderCommissionBps: integer("order_commission_bps").notNull().default(0),
  courierCommissionBps: integer("courier_commission_bps").notNull().default(0),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  locationUpdatedAt: timestamp("location_updated_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  code: text("code").notNull().unique(),
  discountBps: integer("discount_bps").notNull(),
  validUntil: timestamp("valid_until", { mode: "date" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  reviewerName: text("reviewer_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "restrict" }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  deliveryAddress: text("delivery_address").notNull(),
  notes: text("notes"),
  status: text("status", { enum: ["nuevo", "preparando", "en_camino", "entregado", "cancelado"] }).notNull().default("nuevo"),
  totalCents: integer("total_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  platformCommissionCents: integer("platform_commission_cents").notNull().default(0),
  promotionId: integer("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
  paymentMethod: text("payment_method", { enum: ["efectivo", "transferencia", "tarjeta"] }).notNull().default("efectivo"),
  scheduledFor: timestamp("scheduled_for", { mode: "date" }),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: integer("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull(),
});

export const locationUpdates = pgTable("location_updates", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  actor: text("actor", { enum: ["comprador", "repartidor"] }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"),
  capturedAt: timestamp("captured_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const claims = pgTable("claims", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  category: text("category", { enum: ["pedido_incompleto", "producto_incorrecto", "demora", "cobro", "trato", "otro"] }).notNull(),
  description: text("description").notNull(),
  contact: text("contact"),
  status: text("status", { enum: ["abierto", "en_revision", "resuelto"] }).notNull().default("abierto"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const couriers = pgTable("couriers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  applicationToken: text("application_token").unique(),
  active: boolean("active").notNull().default(false),
  applicationStatus: text("application_status", { enum: ["pendiente", "en_revision", "rechazado", "aprobado"] }).notNull().default("pendiente"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const deliveryRequests = pgTable("delivery_requests", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique().references(() => orders.id, { onDelete: "cascade" }),
  courierId: integer("courier_id").references(() => couriers.id, { onDelete: "set null" }),
  status: text("status", { enum: ["abierta", "aceptada", "cancelada"] }).notNull().default("abierta"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
});

export const courierEarnings = pgTable("courier_earnings", {
  id: serial("id").primaryKey(),
  courierId: integer("courier_id").notNull().references(() => couriers.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
  deliveryFeeCents: integer("delivery_fee_cents").notNull(),
  tipCents: integer("tip_cents").notNull().default(0),
  platformCommissionCents: integer("platform_commission_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  occurredAt: timestamp("occurred_at", { mode: "date" }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
});
