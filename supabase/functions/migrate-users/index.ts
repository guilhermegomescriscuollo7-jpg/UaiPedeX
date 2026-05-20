// supabase/functions/migrate-users/index.ts
// ONE-TIME USE: Execute once then disable this function.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MIGRATION_SECRET = Deno.env.get("MIGRATION_SECRET") ?? "";

serve(async (req) => {
    if (req.headers.get("x-migration-secret") !== MIGRATION_SECRET) {
        return new Response("Forbidden", { status: 403 });
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results = { customers: [], stores: [], drivers: [], errors: [] };

    // Migrate customers
    const { data: customers } = await supabase.from("customers").select("id, email, name");
    for (const c of customers ?? []) {
        if (!c.email) continue;
        const { data, error } = await supabase.auth.admin.createUser({
            email: c.email,
            email_confirm: true,
            password: crypto.randomUUID(),
            app_metadata: { role: "customer", must_reset_password: true }
        });
        if (error) { results.errors.push({ email: c.email, error: error.message }); continue; }
        await supabase.from("customers").update({ auth_id: data.user.id }).eq("id", c.id);
        results.customers.push(c.email);
    }

    // Migrate stores
    const { data: stores } = await supabase.from("stores").select("id, email, name");
    for (const s of stores ?? []) {
        if (!s.email) continue;
        const { data, error } = await supabase.auth.admin.createUser({
            email: s.email,
            email_confirm: true,
            password: crypto.randomUUID(),
            app_metadata: { role: "store", must_reset_password: true }
        });
        if (error) { results.errors.push({ email: s.email, error: error.message }); continue; }
        await supabase.from("stores").update({ auth_id: data.user.id }).eq("id", s.id);
        results.stores.push(s.email);
    }

    // Migrate drivers (those already in Supabase drivers table)
    const { data: drivers } = await supabase.from("drivers").select("id, email, name");
    for (const d of drivers ?? []) {
        if (!d.email) continue;
        const { data, error } = await supabase.auth.admin.createUser({
            email: d.email,
            email_confirm: true,
            password: crypto.randomUUID(),
            app_metadata: { role: "driver", must_reset_password: true }
        });
        if (error) { results.errors.push({ email: d.email, error: error.message }); continue; }
        await supabase.from("drivers").update({ auth_id: data.user.id }).eq("id", d.id);
        results.drivers.push(d.email);
    }

    return new Response(JSON.stringify(results, null, 2), {
        headers: { "Content-Type": "application/json" }
    });
});
