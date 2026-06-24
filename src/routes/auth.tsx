import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

const credSchema = z.object({
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup" | "reset">("login");

  async function handleLogin(form: FormData) {
    const parsed = credSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error(error.message);
    router.navigate({ to: "/dashboard" });
  }

  async function handleSignup(form: FormData) {
    const parsed = credSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Cadastro criado. Verifique seu email se a confirmação estiver ativada.");
    // tenta login imediato (se confirmação desativada)
    await supabase.auth.signInWithPassword(parsed.data);
    router.navigate({ to: "/onboarding" });
  }

  async function handleReset(form: FormData) {
    const email = String(form.get("email") ?? "");
    if (!email) return toast.error("Informe o email");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Email de recuperação enviado");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground text-xl font-bold">
            R
          </div>
          <CardTitle className="text-2xl">Rota das Carnes</CardTitle>
          <CardDescription>Sistema DRE Inteligente</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              <TabsTrigger value="reset">Recuperar</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form
                className="space-y-3 mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin(new FormData(e.currentTarget));
                }}
              >
                <Field name="email" label="Email" type="email" />
                <Field name="password" label="Senha" type="password" />
                <Button className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form
                className="space-y-3 mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSignup(new FormData(e.currentTarget));
                }}
              >
                <Field name="email" label="Email" type="email" />
                <Field name="password" label="Senha" type="password" minLength={6} />
                <Button className="w-full" disabled={loading}>
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="reset">
              <form
                className="space-y-3 mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleReset(new FormData(e.currentTarget));
                }}
              >
                <Field name="email" label="Email" type="email" />
                <Button className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar link"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required minLength={minLength} />
    </div>
  );
}
