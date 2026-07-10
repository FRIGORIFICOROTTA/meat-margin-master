import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { BRAND_LOGO_URL } from "@/components/brand/BrandLogo";
import { checkEmailAllowed, getGoogleOAuthConfig } from "@/lib/auth-allowlist.functions";

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

const NOT_ALLOWED_MSG =
  "Este email não está autorizado a acessar o sistema. Peça ao administrador para liberar seu acesso.";

const LoginSignupForm = ({ nextPath }: LoginSignupFormProps) => {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const checkAllowedFn = useServerFn(checkEmailAllowed);
  const getGoogleCfgFn = useServerFn(getGoogleOAuthConfig);

  const googleCfgQ = useQuery({
    queryKey: ["google-oauth-config-public"],
    queryFn: () => getGoogleCfgFn(),
  });
  const googleEnabled = !!googleCfgQ.data?.enabled;

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const postLoginTarget =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";
  const absoluteTarget =
    typeof window !== "undefined" ? `${window.location.origin}${postLoginTarget}` : postLoginTarget;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (!email) return;
      const { allowed } = await checkAllowedFn({ data: { email } });
      if (!allowed) {
        await supabase.auth.signOut();
        toast.error(NOT_ALLOWED_MSG);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function assertAllowed(email: string): Promise<boolean> {
    try {
      const { allowed } = await checkAllowedFn({ data: { email } });
      return allowed;
    } catch {
      return false;
    }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const allowed = await assertAllowed(loginEmail);
    if (!allowed) {
      toast.error(NOT_ALLOWED_MSG);
      setLoading(false);
      return;
    }
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
    const allowed = await assertAllowed(regEmail);
    if (!allowed) {
      toast.error(NOT_ALLOWED_MSG);
      setLoading(false);
      return;
    }
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
  };

  const inputCls =
    "w-full bg-zinc-900/40 border border-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-[#c8102e]/60 focus:ring-1 focus:ring-[#c8102e]/60 transition-all placeholder:text-zinc-600 text-sm";
  const labelCls =
    "text-[11px] font-semibold text-zinc-400 ml-1 uppercase tracking-wider";

  return (
    <div className="relative min-h-screen w-full bg-[#050505] flex items-center justify-center p-6 overflow-hidden">
      {/* Marca d'água: logo real */}
      <div
        aria-hidden
        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src={BRAND_LOGO_URL}
          alt=""
          className="w-[min(80vw,720px)] h-auto opacity-[0.045]"
          style={{ mixBlendMode: "luminosity" }}
        />
      </div>

      {/* Glow radial vermelho */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c8102e] rounded-full blur-[160px] opacity-[0.05]"
      />

      {/* Vinheta escura nas bordas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[#c8102e] text-[10px] font-bold tracking-[0.3em] uppercase mb-3">
            DRE Inteligente
          </p>
          <h1 className="text-white font-bold tracking-tight text-2xl uppercase">
            Rota das Carnes
          </h1>
        </div>

        {/* Toggle Entrar / Cadastrar */}
        <div className="bg-zinc-900/50 p-1 rounded-full flex mb-8 border border-zinc-800/50">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 py-2 text-sm font-semibold rounded-full transition-all ${
              tab === "login"
                ? "bg-zinc-800 text-white shadow-lg"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`flex-1 py-2 text-sm font-semibold rounded-full transition-all ${
              tab === "register"
                ? "bg-zinc-800 text-white shadow-lg"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Cadastrar
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className={labelCls}>Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="nome@empresa.com"
                className={inputCls}
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-end">
                <label htmlFor="login-password" className={labelCls}>Senha</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-zinc-500 hover:text-[#c8102e] transition-colors"
                >
                  Esqueceu?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                placeholder="••••••••"
                className={inputCls}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c8102e] hover:bg-[#a60d26] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_24px_rgba(200,16,46,0.28)] active:scale-[0.98] mt-2 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Aguarde..." : "Acessar Painel"}
            </button>

            {googleEnabled && (
              <>
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#050505] px-2 text-zinc-600 tracking-widest font-medium">
                      Ou continue com
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full bg-transparent border border-zinc-800 hover:bg-zinc-900 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-3"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon className="h-4 w-4" />
                  )}
                  Google SSO
                </button>
              </>
            )}
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reg-name" className={labelCls}>Nome</label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                placeholder="Seu nome"
                className={inputCls}
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reg-email" className={labelCls}>Email</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                placeholder="nome@empresa.com"
                className={inputCls}
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reg-password" className={labelCls}>Senha</label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className={inputCls}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c8102e] hover:bg-[#a60d26] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_24px_rgba(200,16,46,0.28)] active:scale-[0.98] mt-2 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Aguarde..." : "Criar conta"}
            </button>

            {googleEnabled && (
              <>
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#050505] px-2 text-zinc-600 tracking-widest font-medium">
                      Ou continue com
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full bg-transparent border border-zinc-800 hover:bg-zinc-900 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-3"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon className="h-4 w-4" />
                  )}
                  Google SSO
                </button>
              </>
            )}
          </form>
        )}

        {/* Aviso de acesso restrito */}
        <div className="mt-12 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#c8102e]/5 rounded-full border border-[#c8102e]/15">
            <ShieldAlert className="w-3.5 h-3.5 text-[#c8102e]" />
            <span className="text-[10px] text-[#c8102e] font-bold uppercase tracking-widest">
              Acesso Restrito
            </span>
          </div>
          <p className="text-zinc-600 text-[11px] leading-relaxed max-w-[300px] text-center">
            Ambiente corporativo seguro. Uso exclusivo para colaboradores e parceiros
            previamente autorizados pelo administrador.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginSignupForm;
