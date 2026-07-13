import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtBRL, fmtPct, mesNome } from "@/lib/finance";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

import { RouteErrorCard } from "@/components/RouteErrorCard";

export const Route = createFileRoute("/_authenticated/despesas")({
  component: DespesasPage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorCard error={error} reset={reset} page="despesas" />
  ),
});

const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function DespesasPage() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();

  const q = useQuery({
    queryKey: ["despesas", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: dre, error: dreErr } = await supabase
        .from("dre_mensal")
        .select("id, total_vendas")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null)
        .maybeSingle();
      if (dreErr) throw dreErr;
      if (!dre) return null;
      const { data: despesas, error: despErr } = await supabase
        .from("despesas_detalhe")
        .select("*")
        .eq("dre_id", dre.id);
      if (despErr) throw despErr;
      return { receita: Number(dre.total_vendas), despesas: despesas ?? [] };
    },
  });

  if (!empresaId) return <p className="text-muted-foreground">Selecione uma empresa.</p>;
  if (q.isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!q.data) {
    return (
      <div className="rounded border bg-card p-8 text-center text-muted-foreground">
        Sem dados para {mesNome(periodo.mes)}/{periodo.ano}.
      </div>
    );
  }

  const { receita, despesas } = q.data;
  const agrupado = new Map<string, number>();
  for (const d of despesas) {
    const k = d.categoria ?? "Outros";
    agrupado.set(k, (agrupado.get(k) ?? 0) + Number(d.valor));
  }
  const ranking = Array.from(agrupado.entries())
    .map(([categoria, valor]) => ({ categoria, valor, pct: receita > 0 ? valor / receita : 0 }))
    .sort((a, b) => b.valor - a.valor);
  const total = ranking.reduce((s, r) => s + r.valor, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Despesas</h1>
        <p className="text-sm text-muted-foreground">
          {mesNome(periodo.mes)}/{periodo.ano} · Total {fmtBRL(total)} ({fmtPct(receita > 0 ? total / receita : 0)} da receita)
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {ranking.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ranking} dataKey="valor" nameKey="categoria" outerRadius={90} label>
                    {ranking.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem despesas.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ranking</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="text-left p-3">Categoria</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-right p-3 w-20">% Rec.</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.categoria} className="border-b">
                    <td className="p-3">{r.categoria}</td>
                    <td className="p-3 text-right tabular-nums">{fmtBRL(r.valor)}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">{fmtPct(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos detalhados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="text-left p-3">Categoria</th>
                <th className="text-left p-3">Subcategoria</th>
                <th className="text-left p-3">Descrição</th>
                <th className="text-right p-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {despesas.map((d: any) => (
                <tr key={d.id} className="border-b">
                  <td className="p-3">{d.categoria}</td>
                  <td className="p-3 text-muted-foreground">{d.subcategoria ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{d.descricao ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">{fmtBRL(Number(d.valor))}</td>
                </tr>
              ))}
              {despesas.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Nenhum lançamento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
