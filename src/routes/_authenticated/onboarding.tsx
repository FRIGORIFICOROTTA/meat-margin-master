import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import { setEmpresaSelecionada } from "@/lib/app-state";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const schema = z.object({
  nomeUsuario: z.string().trim().min(2, "Informe seu nome").max(120),
  nomeGrupo: z.string().trim().min(2, "Nome do grupo obrigatório").max(120),
  nomeEmpresa: z.string().trim().min(2, "Nome da empresa obrigatório").max(160),
  cnpj: z.string().trim().max(20).optional().or(z.literal("")),
  uf: z.string().trim().max(2).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
});

function normalizeCnpj(v: string | null | undefined) {
  const digits = (v ?? "").replace(/\D+/g, "");
  return digits.length ? digits : null;
}

function friendlyDbError(err: unknown): string {
  const anyErr = err as { code?: string; message?: string } | null;
  const code = anyErr?.code;
  const msg = anyErr?.message ?? "";
  if (code === "23505" && msg.includes("empresas_cnpj_key")) {
    return "Já existe uma empresa cadastrada com este CNPJ. Peça acesso ao administrador do grupo ou use outro CNPJ.";
  }
  if (code === "23505") return "Registro duplicado. Verifique os dados e tente novamente.";
  if (code === "42501" || msg.toLowerCase().includes("row-level security")) {
    return "Sem permissão para criar. Faça login novamente e tente de novo.";
  }
  return msg || "Erro ao criar grupo/empresa";
}

function Onboarding() {
  const { user } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Gate: se o usuário já tem perfil OU vínculo com alguma empresa,
  // ele não deve ver o onboarding (é um usuário convidado, não o criador do grupo).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: perfil }, { data: vinculos }] = await Promise.all([
        supabase.from("usuarios_perfil").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("usuarios_empresas").select("empresa_id").eq("user_id", user.id).limit(1),
      ]);
      if (perfil || (vinculos && vinculos.length > 0)) {
        if (vinculos && vinculos[0]) setEmpresaSelecionada(vinculos[0].empresa_id);
        router.navigate({ to: "/dashboard" });
        return;
      }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function onSubmit(form: FormData) {
    if (!user) return;
    const parsed = schema.safeParse({
      nomeUsuario: form.get("nomeUsuario"),
      nomeGrupo: form.get("nomeGrupo"),
      nomeEmpresa: form.get("nomeEmpresa"),
      cnpj: form.get("cnpj"),
      uf: form.get("uf"),
      cidade: form.get("cidade"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setLoading(true);
    let createdGrupoId: string | null = null;
    try {
      // 1) grupo
      const { data: grupo, error: gErr } = await supabase
        .from("grupos")
        .insert({ nome: parsed.data.nomeGrupo, owner_id: user.id })
        .select()
        .single();
      if (gErr) throw gErr;
      createdGrupoId = grupo.id;

      // 2) perfil
      const { error: pErr } = await supabase
        .from("usuarios_perfil")
        .upsert(
          { user_id: user.id, nome: parsed.data.nomeUsuario, papel: "admin_grupo", grupo_id: grupo.id },
          { onConflict: "user_id" },
        );
      if (pErr) throw pErr;

      // 3) empresa matriz (regime_tributario usa default do banco = 'gerencial')
      const { data: emp, error: eErr } = await supabase
        .from("empresas")
        .insert({
          grupo_id: grupo.id,
          nome: parsed.data.nomeEmpresa,
          cnpj: normalizeCnpj(parsed.data.cnpj),
          uf: parsed.data.uf ? parsed.data.uf.toUpperCase() : null,
          cidade: parsed.data.cidade || null,
          tipo: "matriz",
        })
        .select()
        .single();
      if (eErr) throw eErr;

      // 4) vínculo
      const { error: vErr } = await supabase
        .from("usuarios_empresas")
        .insert({ user_id: user.id, empresa_id: emp.id });
      if (vErr) throw vErr;

      setEmpresaSelecionada(emp.id);
      toast.success("Setup concluído!");
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      // Rollback: se o grupo foi criado mas algo depois falhou, remove o grupo órfão.
      if (createdGrupoId) {
        await supabase.from("grupos").delete().eq("id", createdGrupoId);
      }
      toast.error(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="grid place-items-center py-16 text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="grid place-items-center py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Bem-vindo!</CardTitle>
          <CardDescription>
            Vamos criar seu grupo econômico e a empresa <strong>matriz</strong>. As demais filiais
            podem ser adicionadas depois em <strong>Configurações → Empresas</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(new FormData(e.currentTarget));
            }}
          >
            <Field name="nomeUsuario" label="Seu nome" />
            <Field name="nomeGrupo" label="Nome do grupo" placeholder="Ex: Grupo Rota das Carnes" />
            <div className="border-t pt-4 mt-4">
              <div className="text-sm font-semibold mb-1">Matriz do grupo</div>
              <p className="text-xs text-muted-foreground mb-3">
                Cadastre aqui a empresa matriz (CNPJ principal). As filiais serão cadastradas
                depois em Configurações.
              </p>
              <Field name="nomeEmpresa" label="Nome da matriz" placeholder="Ex: Rota das Carnes - Matriz - Brasília DF" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <Field name="cnpj" label="CNPJ da matriz" placeholder="00.000.000/0000-00" />
                <Field name="cidade" label="Cidade" />
                <Field name="uf" label="UF" maxLength={2} />
              </div>
            </div>
            <Button className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Concluir setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  name, label, placeholder, maxLength,
}: { name: string; label: string; placeholder?: string; maxLength?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} placeholder={placeholder} maxLength={maxLength} />
    </div>
  );
}
