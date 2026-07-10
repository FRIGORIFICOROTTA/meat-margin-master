import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect, FormEvent } from "react";
import { Lock, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/definir-senha")({
  ssr: false,
  component: DefinirSenhaPage,
});

function DefinirSenhaPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    let active = true;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        if (graceTimer) clearTimeout(graceTimer);
        setHasSession(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        if (graceTimer) clearTimeout(graceTimer);
        setHasSession(true);
        setChecking(false);
        return;
      }
      graceTimer = setTimeout(() => {
        if (!active) return;
        setHasSession(false);
        setChecking(false);
      }, 1800);
    });

    return () => {
      active = false;
      if (graceTimer) clearTimeout(graceTimer);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    toast.success("Senha definida com sucesso! Bem-vindo(a).");
    setLoading(false);
    router.navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen w-full grid place-items-center bg-gradient-to-br from-background to-secondary p-5">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Definir senha de acesso</CardTitle>
          <CardDescription>Crie a senha que você usará para entrar no sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando seu acesso...
            </div>
          ) : !hasSession ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-muted-foreground">
                Link inválido ou expirado. Use a opção "Esqueceu a senha?" na tela de login para
                receber um novo.
              </p>
              <Button
                variant="outline"
                onClick={() => router.navigate({ to: "/auth", replace: true })}
              >
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="sp-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="sp-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    minLength={6}
                    required
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-9"
                  />
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-confirm">Confirmar senha</Label>
                <div className="relative">
                  <Input
                    id="sp-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    value={confirm}
                    minLength={6}
                    required
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pr-9"
                  />
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : "Definir senha e entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
