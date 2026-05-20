// supabase/functions/apply-coupon/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return new Response(JSON.stringify({ valid: false, reason: "Não autorizado" }), {
            status: 401, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ valid: false, reason: "Não autorizado" }), {
            status: 401, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { coupon_code, store_id, subtotal } = await req.json();

    const { data: coupon } = await supabaseAdmin
        .from("coupons")
        .select("*")
        .eq("code", coupon_code)
        .eq("active", true)
        .single();

    if (!coupon) {
        return new Response(JSON.stringify({ valid: false, reason: "Cupom não encontrado" }), {
            headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    // camelCase column names as used in the project
    if (coupon.storeId && coupon.storeId !== store_id) {
        return new Response(JSON.stringify({ valid: false, reason: "Cupom não válido para esta loja" }), {
            headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return new Response(JSON.stringify({ valid: false, reason: "Cupom expirado" }), {
            headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
        return new Response(JSON.stringify({ valid: false, reason: "Cupom esgotado" }), {
            headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    let discount = 0;
    if (coupon.type === 'percent') {
        discount = Number((subtotal * (coupon.discount / 100.0)).toFixed(2));
    } else if (coupon.type === 'fixed') {
        discount = Math.min(coupon.discount, subtotal);
    }

    return new Response(JSON.stringify({
        valid: true,
        coupon_id: coupon.id,
        discount,
        final_total: Number((subtotal - discount).toFixed(2))
    }), {
        headers: { ...cors, "Content-Type": "application/json" }
    });
});
