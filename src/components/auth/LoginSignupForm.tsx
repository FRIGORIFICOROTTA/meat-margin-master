import { useState, FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { User, Lock, Mail, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GoogleIcon } from "@/components/auth/GoogleIcon";

interface LoginSignupFormProps {
  nextPath?: string;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email ou senha incorretos.";
  if (m.includes("user already registered")) return "Este email já está cadastrado. Faça login.";
  if (m.includes("email not confirmed")) return "Confirme seu email antes de entrar.";
  if (m.includes("provider is not enabled"))
    return "Login com Google ainda não está ativado no Supabase.";
  return message;
}

const LoginSignupForm = ({ nextPath }: LoginSignupFormProps) => {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const postLoginTarget = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : "/dashboard";
  const absoluteTarget = typeof window !== "undefined"
    ? `${window.location.origin}${postLoginTarget}`
    : postLoginTarget;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      toast.error(friendlyAuthError(error.message));
      setLoading(false);
    } else {
      router.navigate({ to: postLoginTarget });
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: {
        emailRedirectTo: absoluteTarget,
        data: regName ? { full_name: regName } : undefined,
      },
    });
    if (error) {
      toast.error(friendlyAuthError(error.message));
      setLoading(false);
      return;
    }
    if (data.session) {
      toast.success("Conta criada com sucesso!");
      router.navigate({ to: "/onboarding" });
    } else {
      toast.success("Verifique seu email para confirmar o cadastro.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail || !loginEmail.includes("@")) {
      toast.error("Digite seu email no campo acima para recuperar a senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/definir-senha`,
    });
    if (error) {
      toast.error(friendlyAuthError(error.message));
    } else {
      toast.success("Enviamos um link para você redefinir sua senha. Verifique seu email.");
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: absoluteTarget },
    });
    if (error) {
      toast.error(friendlyAuthError(error.message));
      setGoogleLoading(false);
    }
    // Em caso de sucesso, o navegador é redirecionado para o Google.
  };

  const googleButton = (
    <div className="mt-5">
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">ou</span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
      >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon className="h-4 w-4" />
        )}
        Continuar com Google
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl space-y-5">
        <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-lg lg:grid-cols-2">
          {/* Brand panel */}
          <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                background:
                  "radial-gradient(120% 120% at 0% 0%, hsl(var(--primary) / 0.35) 0%, transparent 55%), radial-gradient(120% 120% at 100% 100%, hsl(var(--warning, var(--primary)) / 0.22) 0%, transparent 55%)",
              }}
            />
            <div className="relative z-10 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground text-lg font-bold shadow">
                R
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Rota das Carnes</p>
                <p className="text-xs opacity-80">DRE Inteligente</p>
              </div>
            </div>

            <div className="relative z-10 space-y-4">
              <h2 className="text-3xl font-semibold leading-tight">
                Gestão financeira completa para o seu negócio.
              </h2>
              <p className="max-w-sm text-sm opacity-80">
                DRE Gerencial, Fiscal, controle de estoque e análise por período — em um só lugar,
                com a inteligência do seu CFO Digital.
              </p>
            </div>

            <div className="relative z-10 flex items-center gap-2 text-xs opacity-80">
              <ShieldCheck className="h-4 w-4" />
              Acesso protegido e dados criptografados
            </div>
          </div>

          {/* Form panel */}
          <div className="flex flex-col justify-center p-8 sm:p-10">
            {/* Mobile brand */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
                R
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-foreground">Rota das Carnes</p>
                <p className="text-xs text-muted-foreground">DRE Inteligente</p>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="register">Cadastrar</TabsTrigger>
              </TabsList>

              {/* Login */}
              <TabsContent value="login" className="mt-6">
                <div className="mb-6 space-y-1">
                  <h1 className="text-2xl font-semibold text-foreground">Bem-vindo de volta</h1>
                  <p className="text-sm text-muted-foreground">
                    Acesse sua conta para continuar.
                  </p>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="voce@empresa.com"
                        required
                        className="pl-9"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Senha</Label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Esqueceu a senha?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        required
                        minLength={6}
                        className="pl-9"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading ? "Aguarde..." : "Entrar"}
                  </Button>
                </form>
                {googleButton}
              </TabsContent>

              {/* Register */}
              <TabsContent value="register" className="mt-6">
                <div className="mb-6 space-y-1">
                  <h1 className="text-2xl font-semibold text-foreground">Criar conta</h1>
                  <p className="text-sm text-muted-foreground">
                    Preencha seus dados para começar.
                  </p>
                </div>
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Nome</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Seu nome"
                        className="pl-9"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        placeholder="voce@empresa.com"
                        required
                        className="pl-9"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Senha</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reg-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Mínimo 6 caracteres"
                        required
                        minLength={6}
                        className="pl-9"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading ? "Aguarde..." : "Cadastrar"}
                  </Button>
                </form>
                {googleButton}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Disclaimer */}
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl border-l-4 border-amber-500 bg-card/80 p-4 text-xs leading-relaxed text-muted-foreground shadow-sm backdrop-blur"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">
              Uso consciente e responsabilidade
            </p>
            <p>
              Esta plataforma processa dados financeiros sensíveis. Recomendamos o acompanhamento
              por{" "}
              <strong className="font-semibold text-foreground">
                auditorias de segurança regulares
              </strong>{" "}
              e a adoção de boas práticas de proteção de credenciais e acessos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginSignupForm;
