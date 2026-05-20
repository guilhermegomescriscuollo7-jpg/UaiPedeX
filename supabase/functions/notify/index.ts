// supabase/functions/notify/index.ts
// Triggered by Supabase Database Webhook on orders INSERT
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ONESIGNAL_APP_ID       = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY  = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

serve(async (req) => {
    let payload: any;
    try { payload = await req.json(); } catch {
        return new Response("Invalid payload", { status: 400 });
    }

    const record = payload.record;
    if (!record || payload.type !== "INSERT") {
        return new Response("Ignored", { status: 200 });
    }

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find available drivers (any city for now — filter by city if drivers table has city field)
    const { data: drivers } = await supabaseAdmin
        .from("drivers")
        .select("onesignal_player_id")
        .eq("available", true)
        .not("onesignal_player_id", "is", null);

    const playerIds = (drivers ?? [])
        .map((d: any) => d.onesignal_player_id)
        .filter(Boolean);

    if (playerIds.length === 0) {
        console.log("No available drivers with OneSignal player_id");
        return new Response("No drivers to notify", { status: 200 });
    }

    const orderTotal = Number(record.total || 0).toFixed(2);
    const customerName = record.customerName || record.customer_name || "Cliente";

    await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_player_ids: playerIds,
            headings: { pt: "Novo pedido disponível! 🛵" },
            contents: { pt: `Pedido de ${customerName} — R$ ${orderTotal}` },
            data: { order_id: record.id }
        })
    });

    return new Response("Notified", { status: 200 });
});
