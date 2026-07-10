import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/use-session";
import { z } from "zod";
import { Plus, Trash2, Building2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { AccessTab } from "@/components/settings/AccessTab";
import { GoogleAuthTab } from "@/components/settings/GoogleAuthTab";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfigPage,
});

const empresaSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  cnpj: z.string().trim().max(20).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().max(2).optional().or(z.literal("")),
  regime: z.enum(["gerencial", "lucro_real"]),
});

function ConfigPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);

  const grupoQ = useQuery({
    queryKey: ["meu-grupo", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupos")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const isAdmin = !!grupoQ.data;

  const empresasQ = useQuery({
    queryKey: ["empresas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async (form: FormData) => {
      if (!grupoQ.data) throw new Error("Sem grupo");
      const parsed = empresaSchema.safeParse({
        nome: form.get("nome"), cnpj: form.get("cnpj"), cidade: form.get("cidade"),
        uf: form.get("uf"), regime: form.get("regime"),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Inválido");
      const { data, error } = await supabase
        .from("empresas")
        .insert({
          grupo_id: grupoQ.data.id,
          nome: parsed.data.nome,
          cnpj: parsed.data.cnpj || null,
          cidade: parsed.data.cidade || null,
          uf: parsed.data.uf || null,
          regime_tributario: parsed.data.regime,
          tipo: "filial",
        })
        .select()
        .single();
      if (error) throw error;
      if (user) await supabase.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: data.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas"] });
      qc.invalidateQueries({ queryKey: ["empresas-config"] });
      setOpenNew(false);
      toast.success("Empresa criada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const deleteMut = useMutation({
    mutationFn: async (emp: { id: string; tipo: string }) => {
      if (emp.tipo === "matriz") {
        throw new Error("A matriz não pode ser removida. Edite os dados ou contate o suporte.");
      }
      const { error } = await supabase
        .from("empresas")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", emp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Empresa removida");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const updRegime = useMutation({
    mutationFn: async ({ id, regime }: { id: string; regime: "gerencial" | "lucro_real" }) => {
      const { error } = await supabase.from("empresas").update({ regime_tributario: regime }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["empresas-config"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Grupo: <strong>{grupoQ.data?.nome ?? "—"}</strong>
        </p>
      </div>

      <Tabs defaultValue="empresas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="empresas" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            Empresas
          </TabsTrigger>
          <TabsTrigger value="acessos" className="gap-1.5" disabled={!isAdmin}>
            <ShieldCheck className="h-4 w-4" />
            Acessos
          </TabsTrigger>
          <TabsTrigger value="google" className="gap-1.5" disabled={!isAdmin}>
            <GoogleIcon className="h-4 w-4" />
            Google Login
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empresas" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" />Nova filial</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova filial</DialogTitle></DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createMut.mutate(new FormData(e.currentTarget));
                  }}
                >
                  <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" required /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label>CNPJ</Label><Input name="cnpj" /></div>
                    <div className="space-y-1.5"><Label>Cidade</Label><Input name="cidade" /></div>
                    <div className="space-y-1.5"><Label>UF</Label><Input name="uf" maxLength={2} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Regime</Label>
                    <Select name="regime" defaultValue="gerencial">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gerencial">Gerencial</SelectItem>
                        <SelectItem value="lucro_real">Lucro Real</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" disabled={createMut.isPending}>
                    {createMut.isPending ? "Criando..." : "Criar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Empresas / Filiais</CardTitle>
              <CardDescription>Gerencie suas filiais e regime de DRE.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="text-left p-3">Nome</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-left p-3">CNPJ</th>
                    <th className="text-left p-3">Cidade/UF</th>
                    <th className="text-left p-3">Regime DRE</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(empresasQ.data ?? []).map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="p-3 font-medium">{e.nome}</td>
                      <td className="p-3">
                        {e.tipo === "matriz" ? (
                          <Badge className="bg-primary text-primary-foreground">Matriz</Badge>
                        ) : (
                          <Badge variant="secondary">Filial</Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{e.cnpj ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{[e.cidade, e.uf].filter(Boolean).join("/") || "—"}</td>
                      <td className="p-3">
                        <Select
                          value={e.regime_tributario}
                          onValueChange={(v) => updRegime.mutate({ id: e.id, regime: v as "gerencial" | "lucro_real" })}
                        >
                          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gerencial">Gerencial</SelectItem>
                            <SelectItem value="lucro_real">Lucro Real</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={e.tipo === "matriz"}
                          title={e.tipo === "matriz" ? "A matriz não pode ser removida" : "Remover"}
                          onClick={() => {
                            if (confirm(`Remover "${e.nome}"?`)) deleteMut.mutate({ id: e.id, tipo: e.tipo });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acessos">
          {isAdmin ? (
            <AccessTab />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Somente administradores (donos de grupo) podem gerenciar acessos.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="google">
          {isAdmin ? (
            <GoogleAuthTab />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Somente administradores podem configurar o login com Google.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
