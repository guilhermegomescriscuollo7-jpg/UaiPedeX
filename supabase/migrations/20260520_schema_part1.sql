-- UaiPedeX Security Hardening — Schema Migration Part 1
-- Apply this in Supabase Dashboard > SQL Editor

-- =============================================
-- 1. Add auth_id columns to profile tables
-- =============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE stores    ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE drivers   ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- =============================================
-- 2. Add OneSignal player_id to drivers
-- =============================================
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS onesignal_player_id TEXT;

-- =============================================
-- 3. Add auth reference columns to orders (required for RLS)
-- =============================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_auth_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_auth_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- =============================================
-- 4. Create products table (migrating from Firebase)
-- =============================================
CREATE TABLE IF NOT EXISTS products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    price       NUMERIC(10,2) NOT NULL,
    category    TEXT,
    image_url   TEXT,
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(store_id, active);
