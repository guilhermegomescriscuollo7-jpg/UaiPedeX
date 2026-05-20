-- UaiPedeX Security Hardening — RLS Policies
-- Apply this in Supabase Dashboard > SQL Editor AFTER schema_part1.sql

-- =============================================
-- 1. Enable RLS on all tables
-- =============================================
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_alerts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. CUSTOMERS: owner-only read/write
-- =============================================
CREATE POLICY "customers_select_own" ON customers
    FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "customers_update_own" ON customers
    FOR UPDATE USING (auth_id = auth.uid());
CREATE POLICY "customers_insert_own" ON customers
    FOR INSERT WITH CHECK (auth_id = auth.uid());
CREATE POLICY "admin_customers_all" ON customers
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- 3. STORES: public read, owner/admin write
-- =============================================
CREATE POLICY "stores_select_public" ON stores
    FOR SELECT USING (true);
CREATE POLICY "stores_update_own" ON stores
    FOR UPDATE USING (
        auth_id = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
CREATE POLICY "admin_stores_insert_delete" ON stores
    FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- 4. DRIVERS: owner or admin only
-- =============================================
CREATE POLICY "drivers_select_own_or_admin" ON drivers
    FOR SELECT USING (
        auth_id = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
CREATE POLICY "drivers_update_own" ON drivers
    FOR UPDATE USING (auth_id = auth.uid());
CREATE POLICY "admin_drivers_all" ON drivers
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- 5. ORDERS: customer/store/driver of the order
-- =============================================
CREATE POLICY "orders_select" ON orders
    FOR SELECT USING (
        customer_auth_id = auth.uid() OR
        store_auth_id    = auth.uid() OR
        driver_auth_id   = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
CREATE POLICY "orders_insert_authenticated" ON orders
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "orders_update_store_driver" ON orders
    FOR UPDATE USING (
        store_auth_id  = auth.uid() OR
        driver_auth_id = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- =============================================
-- 6. PRODUCTS: public read, store owner/admin write
-- =============================================
CREATE POLICY "products_select_public" ON products
    FOR SELECT USING (true);
CREATE POLICY "products_write_own_store" ON products
    FOR ALL USING (
        store_id IN (SELECT id FROM stores WHERE auth_id = auth.uid()) OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- =============================================
-- 7. COUPONS: authenticated read, admin write
-- =============================================
CREATE POLICY "coupons_select_authenticated" ON coupons
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_coupons_all" ON coupons
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- 8. PUBLIC TABLES: anyone reads, admin writes
-- =============================================
CREATE POLICY "global_alerts_read"   ON global_alerts   FOR SELECT USING (true);
CREATE POLICY "banners_read"         ON banners          FOR SELECT USING (true);
CREATE POLICY "sponsors_read"        ON sponsors         FOR SELECT USING (true);
CREATE POLICY "cities_read"          ON cities           FOR SELECT USING (true);
CREATE POLICY "settings_read"        ON global_settings  FOR SELECT USING (true);
CREATE POLICY "admin_alerts_write"   ON global_alerts    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_banners_write"  ON banners          FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_sponsors_write" ON sponsors         FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_cities_write"   ON cities           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_settings_write" ON global_settings  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- 9. Atomic coupon validation function (prevents race conditions)
-- =============================================
CREATE OR REPLACE FUNCTION validate_and_reserve_coupon(
    p_code     TEXT,
    p_store_id TEXT,
    p_subtotal NUMERIC
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_coupon  RECORD;
    v_discount NUMERIC := 0;
BEGIN
    SELECT * INTO v_coupon
    FROM coupons
    WHERE code = p_code
      AND active = true
      AND ("storeId" IS NULL OR "storeId" = p_store_id)
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cupom inválido ou expirado';
    END IF;

    IF v_coupon."usageLimit" IS NOT NULL AND COALESCE(v_coupon."usedCount", 0) >= v_coupon."usageLimit" THEN
        RAISE EXCEPTION 'Cupom esgotado';
    END IF;

    IF v_coupon.type = 'percent' THEN
        v_discount := ROUND(p_subtotal * (v_coupon.discount / 100.0), 2);
    ELSIF v_coupon.type = 'fixed' THEN
        v_discount := LEAST(v_coupon.discount, p_subtotal);
    END IF;

    UPDATE coupons SET "usedCount" = COALESCE("usedCount", 0) + 1 WHERE id = v_coupon.id;

    RETURN json_build_object('coupon_id', v_coupon.id, 'discount_amount', v_discount);
END;
$$;
