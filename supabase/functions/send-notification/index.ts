// supabase/functions/send-notification/index.ts
// Envia notificações push via OneSignal — restrito a admins
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ONESIGNAL_APP_ID      = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    // Verificar autenticação
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

    // Verificar se é admin
    const role = user.app_metadata?.role;
    if (role !== "admin") {
        return new Response(JSON.stringify({ error: "Acesso restrito a administradores" }), {
            status: 403, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    // Parsear body
    let body: any;
    try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: "Corpo da requisição inválido" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    const { title, body: message, audience = "all", url, image } = body;

    if (!title?.trim() || !message?.trim()) {
        return new Response(JSON.stringify({ error: "Título e mensagem são obrigatórios" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    // Montar filtro de público-alvo
    let filters: any[] | undefined;
    if (audience === "customer") {
        filters = [{ field: "tag", key: "role", relation: "=", value: "customer" }];
    } else if (audience === "driver") {
        filters = [{ field: "tag", key: "role", relation: "=", value: "driver" }];
    }
    // audience === "all" → sem filtro, envia para todos

    // Montar payload OneSignal
    const oneSignalPayload: Record<string, any> = {
        app_id:   ONESIGNAL_APP_ID,
        headings: { pt: title.trim(), en: title.trim() },
        contents: { pt: message.trim(), en: message.trim() },
    };

    if (filters) {
        oneSignalPayload.filters = filters;
    } else {
        oneSignalPayload.included_segments = ["All"];
    }

    if (url?.trim())   oneSignalPayload.url         = url.trim();
    if (image?.trim()) oneSignalPayload.big_picture  = image.trim();

    // Chamar API do OneSignal
    const osRes = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify(oneSignalPayload),
    });

    const osData = await osRes.json();

    if (!osRes.ok) {
        console.error("OneSignal error:", osData);
        return new Response(JSON.stringify({ error: osData.errors?.[0] || "Erro ao enviar notificação" }), {
            status: 500, headers: { ...cors, "Content-Type": "application/json" }
        });
    }

    return new Response(
        JSON.stringify({ success: true, notification_id: osData.id, recipients: osData.recipients }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
});
