import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PapelUsuario = "admin_grupo" | "gestor_empresa" | "visualizador";

export type GrupoUsuario = {
  user_id: string;
  nome: string | null;
  email: string;
  papel: PapelUsuario;
  grupo_id: string;
  created_at: string;
  is_owner: boolean;
};

export const listGrupoUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GrupoUsuario[]> => {
    const { data, error } = await context.supabase.rpc("list_grupo_usuarios");
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      user_id: string;
      nome: string | null;
      email: string;
      papel: PapelUsuario;
      grupo_id: string;
      created_at: string;
    }>;
    if (rows.length === 0) return [];
    const { data: grupo } = await context.supabase
      .from("grupos")
      .select("owner_id")
      .eq("id", rows[0].grupo_id)
      .maybeSingle();
    const owner = grupo?.owner_id ?? null;
    return rows.map((r) => ({ ...r, is_owner: r.user_id === owner }));
  });

export const updateUsuarioPapel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; papel: PapelUsuario }) =>
    z.object({
      user_id: z.string().uuid(),
      papel: z.enum(["admin_grupo", "gestor_empresa", "visualizador"]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_usuario_papel", {
      _user_id: data.user_id,
      _papel: data.papel,
    });
    if (error) throw error;
    return { ok: true };
  });
