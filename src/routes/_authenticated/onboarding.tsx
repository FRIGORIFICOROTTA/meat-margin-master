import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "@/lib/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  regime: z.enum(["gerencial", "lucro_real"]),
});

function Onboarding() {
  const { user } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(form: FormData) {
    if (!user) return;
    const parsed = schema.safeParse({
      nomeUsuario: form.get("nomeUsuario"),
      nomeGrupo: form.get("nomeGrupo"),
      nomeEmpresa: form.get("nomeEmpresa"),
      cnpj: form.get("cnpj"),
      uf: form.get("uf"),
      cidade: form.get("cidade"),
      regime: form.get("regime"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setLoading(true);
    try {
      // 1) cria grupo
      const { data: grupo, error: gErr } = await supabase
        .from("grupos")
        .insert({ nome: parsed.data.nomeGrupo, owner_id: user.id })
        .select()
        .single();
      if (gErr) throw gErr;

      // 2) perfil
      const { error: pErr } = await supabase
        .from("usuarios_perfil")
        .upsert(
          { user_id: user.id, nome: parsed.data.nomeUsuario, papel: "admin_grupo", grupo_id: grupo.id },
          { onConflict: "user_id" },
        );
      if (pErr) throw pErr;

      // 3) empresa (matriz)
      const { data: emp, error: eErr } = await supabase
        .from("empresas")
        .insert({
          grupo_id: grupo.id,
          nome: parsed.data.nomeEmpresa,
          cnpj: parsed.data.cnpj || null,
          uf: parsed.data.uf || null,
          cidade: parsed.data.cidade || null,
          regime_tributario: parsed.data.regime,
          tipo: "matriz",
        })
        .select()
        .single();
      if (eErr) throw eErr;

      // 4) vínculo
      await supabase.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: emp.id });

      setEmpresaSelecionada(emp.id);
      toast.success("Setup concluído!");
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar grupo/empresa");
    } finally {
      setLoading(false);
    }
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
              <div className="mt-3 space-y-1.5">
                <Label>Regime de DRE</Label>
                <Select name="regime" defaultValue="gerencial">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gerencial">Gerencial</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real (fiscal)</SelectItem>
                  </SelectContent>
                </Select>
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
