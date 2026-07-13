import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ShieldCheck, Plus, Users } from "lucide-react";
import {
  listAllowedEmails,
  addAllowedEmail,
  removeAllowedEmail,
} from "@/lib/auth-allowlist.functions";
import {
  listGrupoUsuarios,
  updateUsuarioPapel,
  type PapelUsuario,
} from "@/lib/users.functions";

export function AccessTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllowedEmails);
  const addFn = useServerFn(addAllowedEmail);
  const removeFn = useServerFn(removeAllowedEmail);
  const listUsersFn = useServerFn(listGrupoUsuarios);
  const updatePapelFn = useServerFn(updateUsuarioPapel);

  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const listQ = useQuery({
    queryKey: ["allowed-emails"],
    queryFn: () => listFn(),
  });

  const usersQ = useQuery({
    queryKey: ["grupo-usuarios"],
    queryFn: () => listUsersFn(),
  });

  const updatePapelMut = useMutation({
    mutationFn: (payload: { user_id: string; papel: PapelUsuario }) =>
      updatePapelFn({ data: payload }),
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["grupo-usuarios"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar papel"),
  });

  const addMut = useMutation({
    mutationFn: (payload: { email: string; note?: string }) =>
      addFn({ data: payload }),
    onSuccess: () => {
      setEmail("");
      setNote("");
      toast.success("Email autorizado");
      qc.invalidateQueries({ queryKey: ["allowed-emails"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao autorizar"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Acesso removido");
      qc.invalidateQueries({ queryKey: ["allowed-emails"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao remover"),
  });

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Acessos ao sistema
        </CardTitle>
        <CardDescription>
          Somente emails cadastrados aqui podem fazer login (senha ou Google).
          Novos cadastros de emails fora da lista serão bloqueados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            addMut.mutate({ email, note: note || undefined });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-allowed-email">Email</Label>
            <Input
              id="new-allowed-email"
              type="email"
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-allowed-note">Observação (opcional)</Label>
            <Input
              id="new-allowed-note"
              type="text"
              placeholder="Ex: Gerente financeiro"
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={addMut.isPending} className="gap-1">
              <Plus className="h-4 w-4" />
              Autorizar
            </Button>
          </div>
        </form>

        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Observação</th>
                <th className="text-left p-3">Adicionado em</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading && (
                <tr>
                  <td className="p-4 text-muted-foreground" colSpan={4}>
                    Carregando...
                  </td>
                </tr>
              )}
              {listQ.data?.length === 0 && (
                <tr>
                  <td className="p-4 text-muted-foreground" colSpan={4}>
                    Nenhum email autorizado ainda.
                  </td>
                </tr>
              )}
              {listQ.data?.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="p-3 font-medium">{row.email}</td>
                  <td className="p-3 text-muted-foreground">{row.note ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Remover acesso de "${row.email}"?`))
                          removeMut.mutate(row.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Usuários vinculados
        </CardTitle>
        <CardDescription>
          Gerencie o papel dos usuários que já se cadastraram no seu grupo.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground">
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Papel</th>
              <th className="text-left p-3">Vinculado em</th>
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading && (
              <tr><td className="p-4 text-muted-foreground" colSpan={4}>Carregando...</td></tr>
            )}
            {usersQ.data?.length === 0 && (
              <tr><td className="p-4 text-muted-foreground" colSpan={4}>Nenhum usuário vinculado ainda.</td></tr>
            )}
            {usersQ.data?.map((u) => (
              <tr key={u.user_id} className="border-b last:border-b-0">
                <td className="p-3 font-medium">
                  {u.nome ?? "—"}
                  {u.is_owner && <Badge className="ml-2" variant="secondary">Dono</Badge>}
                </td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3">
                  <Select
                    value={u.papel}
                    disabled={u.is_owner || updatePapelMut.isPending}
                    onValueChange={(v) =>
                      updatePapelMut.mutate({ user_id: u.user_id, papel: v as PapelUsuario })
                    }
                  >
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin_grupo">Admin</SelectItem>
                      <SelectItem value="gestor_empresa">Operador</SelectItem>
                      <SelectItem value="visualizador">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
    </div>
  );
}
