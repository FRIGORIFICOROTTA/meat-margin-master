import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtBRL, fmtPct, mesNome } from "@/lib/finance";
import { TrendingUp, TrendingDown, Wallet, Boxes } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { RouteErrorCard } from "@/components/RouteErrorCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  errorComponent: ({ error, reset }) => (
    <RouteErrorCard error={error} reset={reset} page="dashboard" />
  ),
});

function Dashboard() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();

  const q = useQuery({
    queryKey: ["dash", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_mensal")
        .select("mes, ano, total_vendas, cmv, resultado_liquido_gerencial, variacao_estoque, total_despesas")
        .eq("empresa_id", empresaId!)
        .is("deleted_at", null)
        .order("ano", { ascending: true })
        .order("mes", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!empresaId) return <div className="grid place-items-center py-16 text-muted-foreground">Selecione uma empresa.</div>;
  if (q.isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  const todos = q.data ?? [];
  const find = (m: number, a: number) => todos.find((r) => r.mes === m && r.ano === a);
  const atual = find(periodo.mes, periodo.ano);
  const mesAnt = periodo.mes === 1 ? { m: 12, a: periodo.ano - 1 } : { m: periodo.mes - 1, a: periodo.ano };
  const anterior = find(mesAnt.m, mesAnt.a);
  const yoy = find(periodo.mes, periodo.ano - 1);

  const vendas = Number(atual?.total_vendas ?? 0);
  const cmv = Number(atual?.cmv ?? 0);
  const margem = vendas > 0 ? (vendas - cmv) / vendas : 0;
  const varEstoque = Number(atual?.variacao_estoque ?? 0);
  const resultadoLiq = Number(atual?.resultado_liquido_gerencial ?? 0);

  const delta = (cur: number, prev: number | undefined) => {
    if (prev == null || prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  };

  // últimos 12 meses até o período selecionado
  const ultimos12 = (() => {
    const out: typeof todos = [];
    let m = periodo.mes;
    let a = periodo.ano;
    for (let i = 0; i < 12; i++) {
      const r = find(m, a);
      if (r) out.unshift(r);
      m--;
      if (m === 0) { m = 12; a--; }
    }
    return out.map((r) => ({
      label: `${mesNome(r.mes).slice(0, 3)}/${String(r.ano).slice(2)}`,
      Receita: Number(r.total_vendas),
      CMV: Number(r.cmv),
      Resultado: Number(r.resultado_liquido_gerencial),
    }));
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{mesNome(periodo.mes)}/{periodo.ano}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          title="Receita"
          value={fmtBRL(vendas)}
          delta={delta(vendas, Number(anterior?.total_vendas ?? 0) || undefined)}
          deltaLabel="vs mês ant."
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <Kpi
          title="Margem Bruta"
          value={fmtPct(margem)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <Kpi
          title="Variação de Estoque"
          value={fmtBRL(varEstoque)}
          accent={varEstoque > 0 ? "danger" : varEstoque < 0 ? "success" : undefined}
          icon={<Boxes className="h-4 w-4 text-muted-foreground" />}
        />
        <Kpi
          title="Resultado Líquido"
          value={fmtBRL(resultadoLiq)}
          accent={resultadoLiq >= 0 ? "success" : "danger"}
          delta={delta(resultadoLiq, Number(anterior?.resultado_liquido_gerencial ?? 0) || undefined)}
          deltaLabel="vs mês ant."
          icon={resultadoLiq >= 0 ? <TrendingUp className="h-4 w-4 text-muted-foreground" /> : <TrendingDown className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comparativos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <CompBox titulo="Mês atual" valor={vendas} sub="Receita" />
          <CompBox titulo={`${mesNome(mesAnt.m)}/${mesAnt.a}`} valor={Number(anterior?.total_vendas ?? 0)} sub="Mês anterior" />
          <CompBox titulo={`${mesNome(periodo.mes)}/${periodo.ano - 1}`} valor={Number(yoy?.total_vendas ?? 0)} sub="Mesmo mês ano anterior" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evolução (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {ultimos12.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ultimos12}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Line type="monotone" dataKey="Receita" stroke="hsl(var(--chart-1))" strokeWidth={2} />
                <Line type="monotone" dataKey="CMV" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                <Line type="monotone" dataKey="Resultado" stroke="hsl(var(--chart-3))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Sem dados ainda. Importe PDFs para começar.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title, value, icon, accent, delta, deltaLabel,
}: {
  title: string; value: string; icon?: React.ReactNode;
  accent?: "success" | "danger"; delta?: number | null; deltaLabel?: string;
}) {
  const color = accent === "success" ? "text-success" : accent === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {delta != null && (
          <div className={`text-xs mt-1 ${delta >= 0 ? "text-success" : "text-destructive"}`}>
            {delta >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(delta))} {deltaLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompBox({ titulo, valor, sub }: { titulo: string; valor: number; sub: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{sub}</div>
      <div className="text-sm font-medium">{titulo}</div>
      <div className="text-lg font-semibold tabular-nums">{fmtBRL(valor)}</div>
    </div>
  );
}
