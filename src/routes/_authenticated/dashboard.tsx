import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtBRL, fmtPct, mesNome } from "@/lib/finance";
import { TrendingUp, TrendingDown, Wallet, Boxes } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();

  const dreAtualQ = useQuery({
    queryKey: ["dre", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dre_mensal")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null)
        .maybeSingle();
      return data;
    },
  });

  const historicoQ = useQuery({
    queryKey: ["dre-historico", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dre_mensal")
        .select("mes, ano, total_vendas, cmv, resultado_liquido_gerencial, variacao_estoque")
        .eq("empresa_id", empresaId!)
        .is("deleted_at", null)
        .order("ano", { ascending: true })
        .order("mes", { ascending: true })
        .limit(12);
      return (data ?? []).map((r) => ({
        label: `${mesNome(r.mes).slice(0, 3)}/${String(r.ano).slice(2)}`,
        Receita: Number(r.total_vendas),
        CMV: Number(r.cmv),
        Resultado: Number(r.resultado_liquido_gerencial),
        VarEstoque: Number(r.variacao_estoque),
      }));
    },
  });

  if (!empresaId) {
    return <EmptyState message="Selecione uma empresa." />;
  }

  const dre = dreAtualQ.data;
  const vendas = Number(dre?.total_vendas ?? 0);
  const cmv = Number(dre?.cmv ?? 0);
  const margem = vendas > 0 ? (vendas - cmv) / vendas : 0;
  const varEstoque = Number(dre?.variacao_estoque ?? 0);
  const resultadoLiq = Number(dre?.resultado_liquido_gerencial ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {mesNome(periodo.mes)}/{periodo.ano}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          title="Receita"
          value={fmtBRL(vendas)}
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
          icon={
            resultadoLiq >= 0 ? (
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            )
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução (últimos meses)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {historicoQ.data && historicoQ.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicoQ.data}>
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
  title, value, icon, accent,
}: { title: string; value: string; icon?: React.ReactNode; accent?: "success" | "danger" }) {
  const color =
    accent === "success" ? "text-success" : accent === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid place-items-center py-16 text-muted-foreground">{message}</div>
  );
}
