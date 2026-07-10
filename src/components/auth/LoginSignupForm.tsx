import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert, MailCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { BRAND_LOGO_URL } from "@/components/brand/BrandLogo";
import { checkEmailAllowed } from "@/lib/auth-allowlist.functions";

interface LoginSignupFormProps {
  nextPath?: string;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email ou senha incorretos.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Este email já está cadastrado. Use 'Entrar' ou 'Esqueceu a senha?'.";
  if (m.includes("email not confirmed"))
    return "Confirme seu email antes de entrar. Verifique sua caixa de entrada.";
  if (m.includes("provider is not enabled"))
    return "Login com Google ainda não está ativado no Supabase.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return message;
}

const NOT_ALLOWED_MSG =
  "Este email não está autorizado. Peça ao administrador para liberar seu acesso em Configurações → Acessos.";

type Status =
  | { kind: "idle" }
  | { kind: "error"; msg: string }
  | { kind: "success"; msg: string }
  | { kind: "info"; msg: string };

const LoginSignupForm = ({ nextPath }: LoginSignupFormProps) => {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);

  const checkAllowedFn = useServerFn(checkEmailAllowed);

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
        setStatus({ kind: "error", msg: NOT_ALLOWED_MSG });
        toast.error(NOT_ALLOWED_MSG);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showError(msg: string) {
    setStatus({ kind: "error", msg });
    toast.error(msg);
  }
  function showSuccess(msg: string) {
    setStatus({ kind: "success", msg });
    toast.success(msg);
  }
  function showInfo(msg: string) {
    setStatus({ kind: "info", msg });
    toast.info(msg);
  }

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
    setStatus({ kind: "idle" });
    setLoading(true);
    const allowed = await assertAllowed(loginEmail);
    if (!allowed) {
      showError(NOT_ALLOWED_MSG);
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      showError(friendlyAuthError(error.message));
      setLoading(false);
    } else {
      showSuccess("Login efetuado! Redirecionando...");
      router.navigate({ to: postLoginTarget });
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "idle" });
    setLoading(true);
    const allowed = await assertAllowed(regEmail);
    if (!allowed) {
      showError(NOT_ALLOWED_MSG);
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
    setLoading(false);
    if (error) {
      showError(friendlyAuthError(error.message));
      return;
    }
    if (data.session) {
      showSuccess("Conta criada! Vamos configurar sua empresa.");
      router.navigate({ to: "/onboarding" });
      return;
    }
    // Sem sessão = Supabase exige confirmação por email. Tentamos logar direto;
    // se a instância estiver com "Confirm email" desligado, funciona na hora.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: regEmail,
      password: regPassword,
    });
    if (!signInErr) {
      showSuccess("Conta criada! Vamos configurar sua empresa.");
      router.navigate({ to: "/onboarding" });
      return;
    }
    // Confirmação de email ainda está ativa no Supabase.
    showInfo(
      `Conta criada para ${regEmail}. A confirmação por email está ativa no Supabase — desative em Authentication → Providers → Email para liberar o acesso imediato, ou peça ao administrador.`,
    );
  };

  const handleResendConfirmation = async () => {
    if (!pendingConfirmEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingConfirmEmail,
      options: { emailRedirectTo: absoluteTarget },
    });
    setLoading(false);
    if (error) {
      showError(friendlyAuthError(error.message));
    } else {
      showSuccess("Novo link enviado. Verifique seu email (e a caixa de spam).");
    }
  };

  const handleForgotPassword = async () => {
    setStatus({ kind: "idle" });
    if (!loginEmail || !loginEmail.includes("@")) {
      showError("Digite seu email no campo acima para recuperar a senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/definir-senha`,
    });
    setLoading(false);
    if (error) {
      showError(friendlyAuthError(error.message));
    } else {
      showSuccess("Enviamos um link para redefinir sua senha. Verifique seu email.");
    }
  };

  const handleGoogleLogin = async () => {
    setStatus({ kind: "idle" });
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: absoluteTarget },
    });
    if (error) {
      showError(friendlyAuthError(error.message));
      setGoogleLoading(false);
    }
  };

  const inputCls =
    "w-full bg-zinc-900/40 border border-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-[#c8102e]/60 focus:ring-1 focus:ring-[#c8102e]/60 transition-all placeholder:text-zinc-600 text-sm";
  const labelCls =
    "text-[11px] font-semibold text-zinc-400 ml-1 uppercase tracking-wider";

  const statusBanner =
    status.kind === "idle" ? null : (
      <div
        role={status.kind === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed mb-4 ${
          status.kind === "error"
            ? "bg-[#c8102e]/10 border-[#c8102e]/40 text-red-200"
            : status.kind === "success"
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
            : "bg-sky-500/10 border-sky-500/40 text-sky-200"
        }`}
      >
        {status.kind === "error" ? (
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        ) : status.kind === "success" ? (
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        ) : (
          <MailCheck className="h-4 w-4 mt-0.5 shrink-0" />
        )}
        <span>{status.msg}</span>
      </div>
    );

  return (
    <div className="relative min-h-screen w-full bg-[#050505] flex items-center justify-center p-6 overflow-hidden">
      <Toaster richColors position="top-center" theme="dark" />

      {/* Marca d'água: logo real */}
      <div
        aria-hidden
        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src={BRAND_LOGO_URL}
          alt=""
          className="w-[min(110vw,1200px)] h-auto opacity-[0.05]"
          style={{ mixBlendMode: "luminosity" }}
        />
      </div>

      {/* Glow radial vermelho */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#c8102e] rounded-full blur-[180px] opacity-[0.06]"
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
        <div className="text-center mb-10 flex flex-col items-center">
          <div
            className="w-24 h-24 rounded-full bg-zinc-900/70 border border-[#c8102e]/30 shadow-[0_0_40px_rgba(200,16,46,0.28)] flex items-center justify-center overflow-hidden mb-5 backdrop-blur-sm"
          >
            <img
              src={BRAND_LOGO_URL}
              alt="Rota das Carnes"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <p className="text-[#c8102e] text-[10px] font-bold tracking-[0.3em] uppercase mb-2">
            DRE Inteligente
          </p>
          <h1 className="text-white font-bold tracking-tight text-2xl uppercase">
            Rota das Carnes
          </h1>
        </div>

        {pendingConfirmEmail ? (
          <div className="space-y-4">
            <div className="text-center space-y-3 py-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center">
                <MailCheck className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-white font-bold text-lg">Confirme seu email</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Enviamos um link de confirmação para
                <br />
                <strong className="text-white break-all">{pendingConfirmEmail}</strong>
              </p>
              <p className="text-zinc-500 text-xs">
                Clique no link do email para ativar sua conta. Verifique também a caixa de spam.
              </p>
            </div>
            {statusBanner}
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={loading}
              className="w-full bg-[#c8102e] hover:bg-[#a60d26] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_24px_rgba(200,16,46,0.28)] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Enviando..." : "Reenviar email de confirmação"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingConfirmEmail(null);
                setStatus({ kind: "idle" });
                setTab("login");
                setLoginEmail(regEmail);
              }}
              className="w-full bg-transparent border border-zinc-800 hover:bg-zinc-900 text-white font-medium py-3 rounded-xl transition-all"
            >
              Voltar para login
            </button>
          </div>
        ) : (
        <>
        {/* Toggle Entrar / Cadastrar */}
        <div className="bg-zinc-900/50 p-1 rounded-full flex mb-8 border border-zinc-800/50">
          <button
            type="button"
            onClick={() => { setTab("login"); setStatus({ kind: "idle" }); }}
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
            onClick={() => { setTab("register"); setStatus({ kind: "idle" }); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-full transition-all ${
              tab === "register"
                ? "bg-zinc-800 text-white shadow-lg"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Cadastrar
          </button>
        </div>

        {statusBanner}

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
              Continuar com Google
            </button>
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
              Continuar com Google
            </button>
          </form>
        )}
        </>
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
