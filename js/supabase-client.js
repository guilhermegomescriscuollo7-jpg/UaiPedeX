// js/supabase-client.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";

export const SUPABASE_URL = 'https://mvhqsiyalupodrtsfncj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
