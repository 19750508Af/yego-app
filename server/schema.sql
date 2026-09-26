-- Yego — Postgres DDL (Supabase). Idempotent: safe to run on every boot.
-- Mirrors server/src/schema.ts exactly.

CREATE TABLE IF NOT EXISTS membership_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  billing_type TEXT NOT NULL,
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
  commission_bps INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  owner_key TEXT UNIQUE,
  application_token TEXT UNIQUE,
  currency TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'otro',
  membership_plan_id INTEGER REFERENCES membership_plans(id) ON DELETE SET NULL,
  membership_status TEXT NOT NULL DEFAULT 'pendiente',
  application_status TEXT NOT NULL DEFAULT 'pendiente',
  order_commission_bps INTEGER NOT NULL DEFAULT 0,
  courier_commission_bps INTEGER NOT NULL DEFAULT 0,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  discount_bps INTEGER NOT NULL,
  valid_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  delivery_address TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo',
  total_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  platform_commission_cents INTEGER NOT NULL DEFAULT 0,
  promotion_id INTEGER REFERENCES promotions(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  scheduled_for TIMESTAMPTZ,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS location_updates (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'abierto',
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS couriers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  application_token TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  application_status TEXT NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_requests (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  courier_id INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'abierta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS courier_earnings (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  delivery_fee_cents INTEGER NOT NULL,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  platform_commission_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
