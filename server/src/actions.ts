// Yego — standalone action definitions (ported from the private runtime).
// Each action has zod request/response schemas plus a handler that receives a
// drizzle Postgres db and an ActionContext ({ isOwner }). The HTTP layer in
// server.ts validates the request, injects isOwner from the admin token, and
// returns the handler result as JSON.
import { z } from "zod";
import { asc, desc, eq, or } from "drizzle-orm";
import * as schema from "./schema";
import type { Db } from "./db";

export interface ActionContext {
  /** True when the caller presented the ADMIN_TOKEN. Replaces ctx.viewer?.isOwner. */
  isOwner: boolean;
}

const locationSchema = z.object({ actor: z.enum(["comprador", "repartidor"]), lat: z.number(), lng: z.number(), accuracy: z.number().nullable(), captured_at: z.string() });
const mutationResponse = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), id: z.number() }), z.object({ ok: z.literal(false), error: z.string() })]);
const applicationMutationResponse = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), id: z.number(), token: z.string() }), z.object({ ok: z.literal(false), error: z.string() })]);
const applicationStatusSchema = z.enum(["pendiente", "en_revision", "rechazado", "aprobado"]);
const applicationLookupResponse = z.object({
  restaurant: z.object({ id: z.number(), name: z.string(), status: applicationStatusSchema }).nullable(),
  courier: z.object({ id: z.number(), name: z.string(), status: applicationStatusSchema }).nullable(),
});
const adminApplicationsResponse = z.discriminatedUnion("authorized", [
  z.object({ authorized: z.literal(false) }),
  z.object({
    authorized: z.literal(true),
    restaurants: z.array(z.object({ id: z.number(), name: z.string(), address: z.string(), phone: z.string().nullable(), category: z.string(), status: applicationStatusSchema, created_at: z.string() })),
    couriers: z.array(z.object({ id: z.number(), name: z.string(), phone: z.string().nullable(), status: applicationStatusSchema, created_at: z.string() })),
  }),
]);
const categorySchema = z.enum(["pizza", "mariscos", "hamburguesas", "pollo", "comida_ecuatoriana", "postres", "otro"]);
const dashboardResponse = z.object({
  plans: z.array(z.object({ id: z.number(), name: z.string(), billing_type: z.enum(["mensual", "comision", "mixto"]), monthly_fee_cents: z.number(), commission_bps: z.number(), currency: z.string(), active: z.boolean() })),
  restaurants: z.array(z.object({
    id: z.number(), name: z.string(), address: z.string(), phone: z.string().nullable(), currency: z.string(), category: categorySchema,
    membership_plan_id: z.number().nullable(), membership_status: z.enum(["pendiente", "activo", "suspendido"]), application_status: z.enum(["pendiente", "en_revision", "rechazado", "aprobado"]), order_commission_bps: z.number(), courier_commission_bps: z.number(),
    lat: z.number().nullable(), lng: z.number().nullable(), location_updated_at: z.string().nullable(), rating_average: z.number().nullable(), review_count: z.number(),
    menu: z.array(z.object({ id: z.number(), name: z.string(), price_cents: z.number(), active: z.boolean() })),
    promotions: z.array(z.object({ id: z.number(), title: z.string(), code: z.string(), discount_bps: z.number(), valid_until: z.string().nullable(), active: z.boolean() })),
    reviews: z.array(z.object({ id: z.number(), reviewer_name: z.string(), rating: z.number(), comment: z.string(), created_at: z.string() })),
  })),
  orders: z.array(z.object({ id: z.number(), restaurant_id: z.number(), restaurant_name: z.string(), customer_name: z.string(), customer_phone: z.string().nullable(), delivery_address: z.string(), notes: z.string().nullable(), status: z.enum(["nuevo", "preparando", "en_camino", "entregado", "cancelado"]), total_cents: z.number(), discount_cents: z.number(), platform_commission_cents: z.number(), payment_method: z.enum(["efectivo", "transferencia", "tarjeta"]), scheduled_for: z.string().nullable(), currency: z.string(), created_at: z.string(), updated_at: z.string(), items: z.array(z.object({ id: z.number(), name: z.string(), unit_price_cents: z.number(), quantity: z.number() })), locations: z.array(locationSchema) })),
  claims: z.array(z.object({ id: z.number(), order_id: z.number(), order_customer: z.string(), category: z.enum(["pedido_incompleto", "producto_incorrecto", "demora", "cobro", "trato", "otro"]), description: z.string(), contact: z.string().nullable(), status: z.enum(["abierto", "en_revision", "resuelto"]), resolution: z.string().nullable(), created_at: z.string(), updated_at: z.string() })),
  couriers: z.array(z.object({ id: z.number(), name: z.string(), phone: z.string().nullable(), active: z.boolean(), application_status: z.enum(["pendiente", "en_revision", "rechazado", "aprobado"]) })),
  earnings: z.array(z.object({ id: z.number(), courier_id: z.number(), courier_name: z.string(), order_id: z.number().nullable(), restaurant_id: z.number().nullable(), restaurant_name: z.string().nullable(), delivery_fee_cents: z.number(), tip_cents: z.number(), platform_commission_cents: z.number(), currency: z.string(), occurred_at: z.string(), note: z.string().nullable() })),
  delivery_requests: z.array(z.object({ id: z.number(), order_id: z.number(), courier_id: z.number().nullable(), courier_name: z.string().nullable(), status: z.enum(["abierta", "aceptada", "cancelada"]), created_at: z.string(), accepted_at: z.string().nullable() })),
});

export const actionSchemas = {
  getDashboard: { request: z.object({}), response: dashboardResponse },
  getApplicationStatus: {
    request: z.object({ restaurant_token: z.string().uuid().nullable(), courier_token: z.string().uuid().nullable() }),
    response: applicationLookupResponse,
  },
  getAdminApplications: { request: z.object({}), response: adminApplicationsResponse },
  createMembershipPlan: {
    request: z.object({ name: z.string().trim().min(2).max(60), billing_type: z.enum(["mensual", "comision", "mixto"]), monthly_fee_cents: z.number().int().min(0).max(100000000), commission_bps: z.number().int().min(0).max(10000), currency: z.string().trim().length(3).transform((v) => v.toUpperCase()) }),
    response: mutationResponse,
  },
  createRestaurant: {
    request: z.object({ name: z.string().trim().min(2).max(80), address: z.string().trim().min(4).max(180), phone: z.string().trim().min(7).max(30), currency: z.string().trim().length(3).transform((v) => v.toUpperCase()), category: categorySchema }),
    response: applicationMutationResponse,
  },
  updateRestaurantMembership: {
    request: z.object({ restaurant_id: z.number().int().positive(), membership_plan_id: z.number().int().positive().nullable(), membership_status: z.enum(["pendiente", "activo", "suspendido"]) }),
    response: mutationResponse,
  },
  updateRestaurantApplication: {
    request: z.object({ restaurant_id: z.number().int().positive(), status: z.enum(["pendiente", "en_revision", "rechazado", "aprobado"]) }),
    response: mutationResponse,
  },
  updateCourierApplication: {
    request: z.object({ courier_id: z.number().int().positive(), status: z.enum(["pendiente", "en_revision", "rechazado", "aprobado"]) }),
    response: mutationResponse,
  },
  updateRestaurantCommissions: {
    request: z.object({ restaurant_id: z.number().int().positive(), order_commission_bps: z.number().int().min(0).max(10000), courier_commission_bps: z.number().int().min(0).max(10000) }),
    response: mutationResponse,
  },
  addMenuItem: {
    request: z.object({ restaurant_id: z.number().int().positive(), name: z.string().trim().min(2).max(100), price_cents: z.number().int().positive().max(100000000) }),
    response: mutationResponse,
  },
  createPromotion: {
    request: z.object({ restaurant_id: z.number().int().positive(), title: z.string().trim().min(2).max(100), code: z.string().trim().min(3).max(24).transform((v) => v.toUpperCase()), discount_bps: z.number().int().min(100).max(9000), valid_until: z.string().datetime().nullable() }),
    response: mutationResponse,
  },
  createReview: {
    request: z.object({ restaurant_id: z.number().int().positive(), reviewer_name: z.string().trim().min(2).max(80), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(4).max(600) }),
    response: mutationResponse,
  },
  createOrder: {
    request: z.object({ restaurant_id: z.number().int().positive(), menu_item_id: z.number().int().positive(), quantity: z.number().int().min(1).max(99), customer_name: z.string().trim().min(2).max(100), customer_phone: z.string().trim().max(30).optional(), delivery_address: z.string().trim().min(4).max(180), notes: z.string().trim().max(500).optional(), promo_code: z.string().trim().max(24).optional(), payment_method: z.enum(["efectivo", "transferencia", "tarjeta"]), scheduled_for: z.string().datetime().nullable() }),
    response: mutationResponse,
  },
  updateOrderStatus: {
    request: z.object({ order_id: z.number().int().positive(), status: z.enum(["nuevo", "preparando", "en_camino", "entregado", "cancelado"]) }),
    response: mutationResponse,
  },
  saveOrderLocation: {
    request: z.object({ order_id: z.number().int().positive(), actor: z.enum(["comprador", "repartidor"]), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().nonnegative().nullable(), captured_at: z.string().datetime() }),
    response: mutationResponse,
  },
  saveRestaurantLocation: {
    request: z.object({ restaurant_id: z.number().int().positive(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    response: mutationResponse,
  },
  createClaim: {
    request: z.object({ order_id: z.number().int().positive(), category: z.enum(["pedido_incompleto", "producto_incorrecto", "demora", "cobro", "trato", "otro"]), description: z.string().trim().min(10).max(1200), contact: z.string().trim().max(120).optional() }),
    response: mutationResponse,
  },
  updateClaim: {
    request: z.object({ claim_id: z.number().int().positive(), status: z.enum(["abierto", "en_revision", "resuelto"]), resolution: z.string().trim().max(1200).optional() }),
    response: mutationResponse,
  },
  createCourier: {
    request: z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().min(7).max(30) }),
    response: applicationMutationResponse,
  },
  requestCourier: {
    request: z.object({ order_id: z.number().int().positive() }),
    response: mutationResponse,
  },
  acceptDeliveryRequest: {
    request: z.object({ request_id: z.number().int().positive(), courier_id: z.number().int().positive() }),
    response: mutationResponse,
  },
  addCourierEarning: {
    request: z.object({ courier_id: z.number().int().positive(), order_id: z.number().int().positive().nullable(), restaurant_id: z.number().int().positive().nullable(), delivery_fee_cents: z.number().int().min(0).max(100000000), tip_cents: z.number().int().min(0).max(100000000), currency: z.string().trim().length(3).transform((v) => v.toUpperCase()), occurred_at: z.string().datetime(), note: z.string().trim().max(300).optional() }),
    response: mutationResponse,
  },
};

export type ActionName = keyof typeof actionSchemas;
export type ActionInputs = { [K in ActionName]: z.input<(typeof actionSchemas)[K]["request"]> };
export type ActionOutputs = { [K in ActionName]: z.output<(typeof actionSchemas)[K]["response"]> };

const ownerOnly = { ok: false as const, error: "Acceso exclusivo para administración." };

export const actionHandlers: {
  [K in ActionName]: (db: Db, args: ActionInputs[K], ctx: ActionContext) => Promise<ActionOutputs[K]>;
} = {
  getDashboard: async (db) => {
    const [planRows, restaurantRows, menuRows, promoRows, reviewRows, orderRows, itemRows, locationRows, claimRows, courierRows, earningRows, deliveryRequestRows] = await Promise.all([
      db.select().from(schema.membershipPlans).orderBy(asc(schema.membershipPlans.name)),
      db.select().from(schema.restaurants).orderBy(asc(schema.restaurants.name)),
      db.select().from(schema.menuItems).orderBy(asc(schema.menuItems.name)),
      db.select().from(schema.promotions).orderBy(desc(schema.promotions.createdAt)),
      db.select().from(schema.reviews).orderBy(desc(schema.reviews.createdAt)).limit(500),
      db.select().from(schema.orders).orderBy(desc(schema.orders.updatedAt)).limit(200),
      db.select().from(schema.orderItems).orderBy(asc(schema.orderItems.id)),
      db.select().from(schema.locationUpdates).orderBy(desc(schema.locationUpdates.capturedAt)).limit(500),
      db.select().from(schema.claims).orderBy(desc(schema.claims.updatedAt)).limit(200),
      db.select().from(schema.couriers).orderBy(asc(schema.couriers.name)),
      db.select().from(schema.courierEarnings).orderBy(desc(schema.courierEarnings.occurredAt)).limit(500),
      db.select().from(schema.deliveryRequests).orderBy(desc(schema.deliveryRequests.createdAt)).limit(200),
    ]);
    const restaurantName = new Map(restaurantRows.map((row) => [row.id, row.name]));
    const orderCustomer = new Map(orderRows.map((row) => [row.id, row.customerName]));
    const courierName = new Map(courierRows.map((row) => [row.id, row.name]));
    return {
      plans: planRows.map((row) => ({ id: row.id, name: row.name, billing_type: row.billingType, monthly_fee_cents: row.monthlyFeeCents, commission_bps: row.commissionBps, currency: row.currency, active: row.active })),
      restaurants: restaurantRows.map((row) => {
        const ownReviews = reviewRows.filter((item) => item.restaurantId === row.id);
        const rating = ownReviews.length ? ownReviews.reduce((sum, item) => sum + item.rating, 0) / ownReviews.length : null;
        return { id: row.id, name: row.name, address: row.address, phone: row.phone, currency: row.currency, category: row.category, membership_plan_id: row.membershipPlanId, membership_status: row.membershipStatus, application_status: row.applicationStatus, order_commission_bps: row.orderCommissionBps, courier_commission_bps: row.courierCommissionBps, lat: row.lat, lng: row.lng, location_updated_at: row.locationUpdatedAt?.toISOString() ?? null, rating_average: rating, review_count: ownReviews.length, menu: menuRows.filter((item) => item.restaurantId === row.id).map((item) => ({ id: item.id, name: item.name, price_cents: item.priceCents, active: item.active })), promotions: promoRows.filter((item) => item.restaurantId === row.id).map((item) => ({ id: item.id, title: item.title, code: item.code, discount_bps: item.discountBps, valid_until: item.validUntil?.toISOString() ?? null, active: item.active })), reviews: ownReviews.slice(0, 20).map((item) => ({ id: item.id, reviewer_name: item.reviewerName, rating: item.rating, comment: item.comment, created_at: item.createdAt.toISOString() })) };
      }),
      orders: orderRows.map((row) => ({ id: row.id, restaurant_id: row.restaurantId, restaurant_name: restaurantName.get(row.restaurantId) ?? "Local eliminado", customer_name: row.customerName, customer_phone: row.customerPhone, delivery_address: row.deliveryAddress, notes: row.notes, status: row.status, total_cents: row.totalCents, discount_cents: row.discountCents, platform_commission_cents: row.platformCommissionCents, payment_method: row.paymentMethod, scheduled_for: row.scheduledFor?.toISOString() ?? null, currency: row.currency, created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(), items: itemRows.filter((item) => item.orderId === row.id).map((item) => ({ id: item.id, name: item.name, unit_price_cents: item.unitPriceCents, quantity: item.quantity })), locations: locationRows.filter((point) => point.orderId === row.id).map((point) => ({ actor: point.actor, lat: point.lat, lng: point.lng, accuracy: point.accuracy, captured_at: point.capturedAt.toISOString() })) })),
      claims: claimRows.map((row) => ({ id: row.id, order_id: row.orderId, order_customer: orderCustomer.get(row.orderId) ?? "Pedido", category: row.category, description: row.description, contact: row.contact, status: row.status, resolution: row.resolution, created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString() })),
      couriers: courierRows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, active: row.active, application_status: row.applicationStatus })),
      earnings: earningRows.map((row) => ({ id: row.id, courier_id: row.courierId, courier_name: courierName.get(row.courierId) ?? "Repartidor", order_id: row.orderId, restaurant_id: row.restaurantId, restaurant_name: row.restaurantId ? restaurantName.get(row.restaurantId) ?? "Local" : null, delivery_fee_cents: row.deliveryFeeCents, tip_cents: row.tipCents, platform_commission_cents: row.platformCommissionCents, currency: row.currency, occurred_at: row.occurredAt.toISOString(), note: row.note })),
      delivery_requests: deliveryRequestRows.map((row) => ({ id: row.id, order_id: row.orderId, courier_id: row.courierId, courier_name: row.courierId ? courierName.get(row.courierId) ?? "Repartidor" : null, status: row.status, created_at: row.createdAt.toISOString(), accepted_at: row.acceptedAt?.toISOString() ?? null })),
    };
  },

  getApplicationStatus: async (db, args) => {
    const restaurantRows = args.restaurant_token
      ? await db.select({ id: schema.restaurants.id, name: schema.restaurants.name, status: schema.restaurants.applicationStatus }).from(schema.restaurants).where(eq(schema.restaurants.applicationToken, args.restaurant_token)).limit(1)
      : [];
    const courierRows = args.courier_token
      ? await db.select({ id: schema.couriers.id, name: schema.couriers.name, status: schema.couriers.applicationStatus }).from(schema.couriers).where(eq(schema.couriers.applicationToken, args.courier_token)).limit(1)
      : [];
    const restaurant = restaurantRows[0];
    const courier = courierRows[0];
    return {
      restaurant: restaurant ? { id: restaurant.id, name: restaurant.name, status: restaurant.status } : null,
      courier: courier ? { id: courier.id, name: courier.name, status: courier.status } : null,
    };
  },

  getAdminApplications: async (db, _args, ctx) => {
    if (!ctx.isOwner) return { authorized: false as const };
    const [restaurants, couriers] = await Promise.all([
      db.select().from(schema.restaurants).orderBy(desc(schema.restaurants.createdAt)),
      db.select().from(schema.couriers).orderBy(desc(schema.couriers.createdAt)),
    ]);
    return {
      authorized: true as const,
      restaurants: restaurants.map((row) => ({ id: row.id, name: row.name, address: row.address, phone: row.phone, category: row.category, status: row.applicationStatus, created_at: row.createdAt.toISOString() })),
      couriers: couriers.map((row) => ({ id: row.id, name: row.name, phone: row.phone, status: row.applicationStatus, created_at: row.createdAt.toISOString() })),
    };
  },

  createMembershipPlan: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.insert(schema.membershipPlans).values({ name: args.name, billingType: args.billing_type, monthlyFeeCents: args.monthly_fee_cents, commissionBps: args.commission_bps, currency: args.currency }).returning({ id: schema.membershipPlans.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo guardar el plan." };
    return { ok: true as const, id: row.id };
  },

  createRestaurant: async (db, args) => {
    const ownerKey = args.phone.toLowerCase().replace(/[^0-9a-z]/g, "");
    const existing = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(or(eq(schema.restaurants.ownerKey, ownerKey), eq(schema.restaurants.phone, args.phone))).limit(1);
    if (existing[0]) return { ok: false as const, error: "Esta persona ya tiene una solicitud de local. Solo se permite un local por persona." };
    const now = new Date();
    const token = crypto.randomUUID();
    const rows = await db.insert(schema.restaurants).values({ name: args.name, address: args.address, phone: args.phone, ownerKey, applicationToken: token, currency: args.currency, category: args.category, membershipStatus: "pendiente", applicationStatus: "pendiente", createdAt: now, updatedAt: now }).returning({ id: schema.restaurants.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo enviar la solicitud." };
    return { ok: true as const, id: row.id, token };
  },

  updateRestaurantMembership: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.update(schema.restaurants).set({ membershipPlanId: args.membership_plan_id, membershipStatus: args.membership_status, updatedAt: new Date() }).where(eq(schema.restaurants.id, args.restaurant_id)).returning({ id: schema.restaurants.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "El local ya no existe." };
    return { ok: true as const, id: row.id };
  },

  updateRestaurantApplication: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.update(schema.restaurants).set({ applicationStatus: args.status, membershipStatus: args.status === "aprobado" ? "activo" : args.status === "rechazado" ? "suspendido" : "pendiente", updatedAt: new Date() }).where(eq(schema.restaurants.id, args.restaurant_id)).returning({ id: schema.restaurants.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "La solicitud ya no existe." };
    return { ok: true as const, id: row.id };
  },

  updateCourierApplication: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.update(schema.couriers).set({ applicationStatus: args.status, active: args.status === "aprobado" }).where(eq(schema.couriers.id, args.courier_id)).returning({ id: schema.couriers.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "La solicitud ya no existe." };
    return { ok: true as const, id: row.id };
  },

  updateRestaurantCommissions: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.update(schema.restaurants).set({ orderCommissionBps: args.order_commission_bps, courierCommissionBps: args.courier_commission_bps, updatedAt: new Date() }).where(eq(schema.restaurants.id, args.restaurant_id)).returning({ id: schema.restaurants.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "El local ya no existe." };
    return { ok: true as const, id: row.id };
  },

  addMenuItem: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const restaurant = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.id, args.restaurant_id)).limit(1);
    if (!restaurant[0]) return { ok: false as const, error: "El local ya no existe." };
    const rows = await db.insert(schema.menuItems).values({ restaurantId: args.restaurant_id, name: args.name, priceCents: args.price_cents }).returning({ id: schema.menuItems.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo guardar el producto." };
    return { ok: true as const, id: row.id };
  },

  createPromotion: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const existing = await db.select({ id: schema.promotions.id }).from(schema.promotions).where(eq(schema.promotions.code, args.code)).limit(1);
    if (existing[0]) return { ok: false as const, error: "Ese código ya está en uso." };
    const rows = await db.insert(schema.promotions).values({ restaurantId: args.restaurant_id, title: args.title, code: args.code, discountBps: args.discount_bps, validUntil: args.valid_until ? new Date(args.valid_until) : null }).returning({ id: schema.promotions.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo guardar la promoción." };
    return { ok: true as const, id: row.id };
  },

  createReview: async (db, args) => {
    const rows = await db.insert(schema.reviews).values({ restaurantId: args.restaurant_id, reviewerName: args.reviewer_name, rating: args.rating, comment: args.comment }).returning({ id: schema.reviews.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo guardar la reseña." };
    return { ok: true as const, id: row.id };
  },

  createOrder: async (db, args) => {
    const items = await db.select().from(schema.menuItems).where(eq(schema.menuItems.id, args.menu_item_id)).limit(1);
    const item = items[0];
    if (!item || item.restaurantId !== args.restaurant_id || !item.active) return { ok: false as const, error: "Ese producto no está disponible en el local." };
    const rs = await db.select().from(schema.restaurants).where(eq(schema.restaurants.id, args.restaurant_id)).limit(1);
    const restaurant = rs[0];
    if (!restaurant) return { ok: false as const, error: "El local ya no existe." };
    if (restaurant.applicationStatus !== "aprobado") return { ok: false as const, error: "Este local todavía no está aprobado para recibir pedidos." };
    const subtotal = item.priceCents * args.quantity;
    let promotionId: number | null = null;
    let discount = 0;
    if (args.promo_code) {
      const promos = await db.select().from(schema.promotions).where(eq(schema.promotions.code, args.promo_code.toUpperCase())).limit(1);
      const promo = promos[0];
      if (!promo || promo.restaurantId !== args.restaurant_id || !promo.active || (promo.validUntil && promo.validUntil.getTime() < Date.now())) return { ok: false as const, error: "El cupón no es válido para este local." };
      promotionId = promo.id;
      discount = Math.round(subtotal * promo.discountBps / 10000);
    }
    const total = Math.max(0, subtotal - discount);
    const commission = Math.round(total * restaurant.orderCommissionBps / 10000);
    const now = new Date();
    const rows = await db.insert(schema.orders).values({ restaurantId: args.restaurant_id, customerName: args.customer_name, customerPhone: args.customer_phone || null, deliveryAddress: args.delivery_address, notes: args.notes || null, status: "nuevo", totalCents: total, discountCents: discount, platformCommissionCents: commission, promotionId, paymentMethod: args.payment_method, scheduledFor: args.scheduled_for ? new Date(args.scheduled_for) : null, currency: restaurant.currency, createdAt: now, updatedAt: now }).returning({ id: schema.orders.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo crear el pedido." };
    await db.insert(schema.orderItems).values({ orderId: row.id, menuItemId: item.id, name: item.name, unitPriceCents: item.priceCents, quantity: args.quantity });
    return { ok: true as const, id: row.id };
  },

  updateOrderStatus: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.update(schema.orders).set({ status: args.status, updatedAt: new Date() }).where(eq(schema.orders.id, args.order_id)).returning({ id: schema.orders.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "El pedido ya no existe." };
    return { ok: true as const, id: row.id };
  },

  saveOrderLocation: async (db, args) => {
    const rows = await db.insert(schema.locationUpdates).values({ orderId: args.order_id, actor: args.actor, lat: args.lat, lng: args.lng, accuracy: args.accuracy, capturedAt: new Date(args.captured_at) }).returning({ id: schema.locationUpdates.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo guardar la ubicación." };
    return { ok: true as const, id: row.id };
  },

  saveRestaurantLocation: async (db, args) => {
    const now = new Date();
    const rows = await db.update(schema.restaurants).set({ lat: args.lat, lng: args.lng, locationUpdatedAt: now, updatedAt: now }).where(eq(schema.restaurants.id, args.restaurant_id)).returning({ id: schema.restaurants.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "El local ya no existe." };
    return { ok: true as const, id: row.id };
  },

  createClaim: async (db, args) => {
    const now = new Date();
    const rows = await db.insert(schema.claims).values({ orderId: args.order_id, category: args.category, description: args.description, contact: args.contact || null, createdAt: now, updatedAt: now }).returning({ id: schema.claims.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo enviar el reclamo." };
    return { ok: true as const, id: row.id };
  },

  updateClaim: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    const rows = await db.update(schema.claims).set({ status: args.status, resolution: args.resolution || null, updatedAt: new Date() }).where(eq(schema.claims.id, args.claim_id)).returning({ id: schema.claims.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "El reclamo ya no existe." };
    return { ok: true as const, id: row.id };
  },

  createCourier: async (db, args) => {
    const existing = await db.select({ id: schema.couriers.id }).from(schema.couriers).where(eq(schema.couriers.phone, args.phone)).limit(1);
    if (existing[0]) return { ok: false as const, error: "Este teléfono ya tiene una solicitud de repartidor." };
    const token = crypto.randomUUID();
    const rows = await db.insert(schema.couriers).values({ name: args.name, phone: args.phone, applicationToken: token, active: false, applicationStatus: "pendiente" }).returning({ id: schema.couriers.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo enviar la solicitud." };
    return { ok: true as const, id: row.id, token };
  },

  requestCourier: async (db, args) => {
    const existing = await db.select().from(schema.deliveryRequests).where(eq(schema.deliveryRequests.orderId, args.order_id)).limit(1);
    if (existing[0]) return { ok: false as const, error: existing[0].status === "abierta" ? "Ya hay una alerta activa para este pedido." : "Este pedido ya fue tomado por un repartidor." };
    const rows = await db.insert(schema.deliveryRequests).values({ orderId: args.order_id, status: "abierta" }).returning({ id: schema.deliveryRequests.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo solicitar repartidor." };
    return { ok: true as const, id: row.id };
  },

  acceptDeliveryRequest: async (db, args) => {
    const openRows = await db.select().from(schema.deliveryRequests).where(eq(schema.deliveryRequests.id, args.request_id)).limit(1);
    const request = openRows[0];
    if (!request || request.status !== "abierta") return { ok: false as const, error: "Esta entrega ya no está disponible." };
    const rows = await db.update(schema.deliveryRequests).set({ courierId: args.courier_id, status: "aceptada", acceptedAt: new Date() }).where(eq(schema.deliveryRequests.id, args.request_id)).returning({ id: schema.deliveryRequests.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo aceptar la entrega." };
    await db.update(schema.orders).set({ status: "en_camino", updatedAt: new Date() }).where(eq(schema.orders.id, request.orderId));
    return { ok: true as const, id: row.id };
  },

  addCourierEarning: async (db, args, ctx) => {
    if (!ctx.isOwner) return ownerOnly;
    let restaurantId = args.restaurant_id;
    if (args.order_id) {
      const rows = await db.select({ restaurantId: schema.orders.restaurantId }).from(schema.orders).where(eq(schema.orders.id, args.order_id)).limit(1);
      const linkedOrder = rows[0];
      if (!linkedOrder) return { ok: false as const, error: "El pedido ya no existe." };
      restaurantId = linkedOrder.restaurantId;
    }
    let commission = 0;
    if (restaurantId) {
      const rows = await db.select({ rate: schema.restaurants.courierCommissionBps }).from(schema.restaurants).where(eq(schema.restaurants.id, restaurantId)).limit(1);
      const restaurant = rows[0];
      if (!restaurant) return { ok: false as const, error: "El local ya no existe." };
      commission = Math.round(args.delivery_fee_cents * restaurant.rate / 10000);
    }
    const rows = await db.insert(schema.courierEarnings).values({ courierId: args.courier_id, orderId: args.order_id, restaurantId, deliveryFeeCents: args.delivery_fee_cents, tipCents: args.tip_cents, platformCommissionCents: commission, currency: args.currency, occurredAt: new Date(args.occurred_at), note: args.note || null }).returning({ id: schema.courierEarnings.id });
    const row = rows[0];
    if (!row) return { ok: false as const, error: "No se pudo registrar la ganancia." };
    return { ok: true as const, id: row.id };
  },
};
