// supabase/functions/place-order/index.ts
// NOTE: This project uses camelCase columns (storeId, isActive, deliveryFee, orderType, etc.)
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
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any;
    try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: "Corpo da requisição inválido" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    const { store_id, items, delivery_method, address, coupon_code } = body;
    if (!store_id || !Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({ error: "Dados do pedido inválidos" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    // Fetch store — real delivery fee from DB (camelCase columns)
    const { data: store } = await supabaseAdmin
        .from("stores")
        .select("id, name, deliveryFee, minOrder, isActive, status, pixKey, auth_id")
        .eq("id", store_id)
        .single();

    if (!store || store.isActive === false) {
        return new Response(JSON.stringify({ error: "Loja indisponível" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    // Fetch product prices from DB — NEVER trust prices from client
    // Products table uses camelCase: storeId (text), isActive (boolean), price (text)
    const productIds = items.map((i: any) => i.product_id);
    const { data: products } = await supabaseAdmin
        .from("products")
        .select("id, name, price, isActive")
        .in("id", productIds)
        .eq("storeId", store_id);

    if (!products || products.length !== productIds.length) {
        return new Response(JSON.stringify({ error: "Um ou mais produtos não encontrados" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    // Calculate subtotal — price is stored as text, parse to float
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
        const product = products.find((p: any) => p.id === item.product_id);
        if (!product || product.isActive === false) {
            return new Response(JSON.stringify({ error: `Produto ${item.product_id} indisponível` }), {
                status: 400, headers: { ...cors, "Content-Type": "application/json" }
            });
        }
        const qty = Math.max(1, Math.floor(Number(item.qty)));
        const price = parseFloat(String(product.price)) || 0;
        subtotal += price * qty;
        orderItems.push({ product_id: product.id, name: product.name, price, qty, lineTotal: price * qty });
    }

    const deliveryFee = delivery_method === "retirada"
        ? 0
        : parseFloat(String(store.deliveryFee || "0")) || 0;

    // Validate coupon atomically via PL/pgSQL function
    let discountAmount = 0;
    let couponId = null;
    if (coupon_code) {
        const { data: couponResult, error: couponErr } = await supabaseAdmin
            .rpc("validate_and_reserve_coupon", {
                p_code: coupon_code,
                p_store_id: store_id,
                p_subtotal: subtotal
            });
        if (couponErr) {
            return new Response(JSON.stringify({ error: couponErr.message || "Cupom inválido" }), {
                status: 400, headers: { ...cors, "Content-Type": "application/json" }
            });
        }
        discountAmount = couponResult.discount_amount;
        couponId = couponResult.coupon_id;
    }

    const total = Math.max(0, Number((subtotal + deliveryFee - discountAmount).toFixed(2)));

    // Fetch customer profile
    const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("id, name, phone")
        .eq("auth_id", user.id)
        .single();

    // Insert order with service_role (bypasses RLS), using camelCase column names
    const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .insert([{
            storeId: store_id,
            customer_auth_id: user.id,
            store_auth_id: store.auth_id,
            items: orderItems,
            subtotal,
            deliveryFee,
            discount: discountAmount,
            total,
            orderType: delivery_method || "entrega",
            address,
            status: "Pendente",
            customerName: customer?.name || user.email,
            timestamp: Date.now(),
            date: new Date().toLocaleString('pt-BR'),
            customer: {
                id: customer?.id,
                name: customer?.name || user.email,
                phone: customer?.phone || "",
                address
            }
        }])
        .select()
        .single();

    if (orderErr) {
        console.error("order insert error:", orderErr);
        return new Response(JSON.stringify({ error: "Erro ao registrar pedido" }), {
            status: 500, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    return new Response(
        JSON.stringify({ success: true, order_id: order.id, total, items: orderItems }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
});
