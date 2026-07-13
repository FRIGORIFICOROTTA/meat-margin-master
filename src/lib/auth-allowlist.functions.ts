import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/** Público: verifica se um email está na allowlist. Usado no gate de login. */
export const checkEmailAllowed = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) =>
    z.object({ email: z.string().trim().toLowerCase().email() }).parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    // RPC boolean: não expõe a lista de e-mails (correção de segurança 13/07/2026).
    const { data: allowed, error } = await supabase.rpc("email_is_allowed", {
      p_email: data.email,
    });
    if (error) throw error;
    return { allowed: !!allowed };
  });

/** Admin: lista todos os emails autorizados. */
export const listAllowedEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("allowed_emails")
      .select("id, email, note, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const addAllowedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; note?: string }) =>
    z.object({
      email: z.string().trim().toLowerCase().email().max(255),
      note: z.string().trim().max(200).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("allowed_emails")
      .insert({ email: data.email, note: data.note ?? null, added_by: context.userId });
    if (error) throw error;
    return { ok: true };
  });

export const removeAllowedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("allowed_emails").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Público (leitura): frontend usa para decidir se mostra o botão Google. */
export const getGoogleOAuthConfig = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("google_oauth_config")
    .select("client_id, enabled, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data ?? { client_id: null, enabled: false, updated_at: null };
});

export const updateGoogleOAuthConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { client_id: string; enabled: boolean }) =>
    z.object({
      client_id: z.string().trim().max(255),
      enabled: z.boolean(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("google_oauth_config")
      .upsert({
        id: 1,
        client_id: data.client_id || null,
        enabled: data.enabled,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
    return { ok: true };
  });
