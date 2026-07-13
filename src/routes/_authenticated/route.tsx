import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MESES } from "@/lib/finance";
import { Toaster } from "sonner";
import { LayoutDashboard, Upload, FileBarChart2, Boxes, Settings, LogOut, Receipt, Landmark } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Watermark } from "@/components/brand/Watermark";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useSession();
  const [empresaId, setEmpresaId] = useEmpresaSelecionada();
  const [periodo, setPeriodo] = usePeriodo();
  const router = useRouter();
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  const empresasQ = useQuery({
    queryKey: ["empresas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, regime_tributario, grupo_id, tipo")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Redireciona para /auth se a sessão for perdida (ex.: refresh token inválido).
  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("usuarios_perfil")
      .select("id, grupo_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setHasProfile(!!data?.grupo_id));
  }, [user]);

  // Default seleção
  useEffect(() => {
    if (empresasQ.data && empresasQ.data.length > 0 && !empresaId) {
      setEmpresaId(empresasQ.data[0].id);
    }
  }, [empresasQ.data, empresaId, setEmpresaId]);

  // Redireciona para onboarding quando não há grupo/empresa
  useEffect(() => {
    if (loading || empresasQ.isLoading || hasProfile === null) return;
    const path = router.state.location.pathname;
    const needsOnboarding = !hasProfile || (empresasQ.data?.length ?? 0) === 0;
    if (needsOnboarding && path !== "/onboarding") {
      router.navigate({ to: "/onboarding" });
    }
  }, [loading, empresasQ.isLoading, empresasQ.data, hasProfile, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const anos = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="relative min-h-screen bg-background">
      <Watermark />
      <Toaster richColors position="top-right" />
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-black/30 p-1">
              <BrandLogo className="h-full w-full" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold leading-tight">Rota das Carnes</div>
              <div className="text-xs opacity-70 leading-tight">DRE Inteligente</div>
            </div>
          </Link>

          <nav className="ml-4 hidden md:flex items-center gap-1">
            <NavLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </NavLink>
            <NavLink to="/dre" icon={<FileBarChart2 className="h-4 w-4" />}>
              DRE
            </NavLink>
            <NavLink to="/despesas" icon={<Receipt className="h-4 w-4" />}>
              Despesas
            </NavLink>
            <NavLink to="/fiscal" icon={<Landmark className="h-4 w-4" />}>
              Fiscal
            </NavLink>
            <NavLink to="/estoque" icon={<Boxes className="h-4 w-4" />}>
              Estoque
            </NavLink>
            <NavLink to="/importar" icon={<Upload className="h-4 w-4" />}>
              Importar
            </NavLink>
            <NavLink to="/configuracoes" icon={<Settings className="h-4 w-4" />}>
              Configurações
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {empresasQ.data && empresasQ.data.length > 0 && (
              <>
                <Select value={empresaId ?? ""} onValueChange={(v) => setEmpresaId(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresasQ.data.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                        {e.tipo === "matriz" ? " · Matriz" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(periodo.mes)}
                  onValueChange={(v) => setPeriodo({ ...periodo, mes: Number(v) })}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(periodo.ano)}
                  onValueChange={(v) => setPeriodo({ ...periodo, ano: Number(v) })}
                >
                  <SelectTrigger className="w-[95px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-sidebar-accent text-sidebar-primary" }}
      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
    >
      {icon}
      {children}
    </Link>
  );
}
