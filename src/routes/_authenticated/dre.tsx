import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtBRL, fmtPct, mesNome } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dre")({
  component: DrePage,
});

function DrePage() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();

  const dreQ = useQuery({
    queryKey: ["dre-full", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: dre } = await supabase
        .from("dre_mensal")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null)
        .maybeSingle();
      if (!dre) return null;
      const { data: despesas } = await supabase
        .from("despesas_detalhe")
        .select("*")
        .eq("dre_id", dre.id);
      return { dre, despesas: despesas ?? [] };
    },
  });

  if (!empresaId) return <p className="text-muted-foreground">Selecione uma empresa.</p>;
  if (dreQ.isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!dreQ.data) {
    return (
      <div className="rounded border bg-card p-8 text-center text-muted-foreground">
        Nenhuma DRE para {mesNome(periodo.mes)}/{periodo.ano}. Vá em <strong>Importar</strong> para começar.
      </div>
    );
  }

  const { dre, despesas } = dreQ.data;
  const v = Number(dre.total_vendas);
  const pct = (n: number) => (v > 0 ? n / v : 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">DRE Gerencial</h1>
        <p className="text-sm text-muted-foreground">{mesNome(periodo.mes)}/{periodo.ano}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Demonstrativo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="text-left p-3">Descrição</th>
                <th className="text-right p-3">Valor</th>
                <th className="text-right p-3 w-24">% Vendas</th>
              </tr>
            </thead>
            <tbody>
              <Linha label="Receita Bruta (Vendas)" valor={Number(dre.total_vendas)} pct={1} section />
              <Linha label="(-) CMV do sistema" valor={-Number(dre.cmv)} pct={pct(-Number(dre.cmv))} />
              <Linha
                label="(±) Variação de Estoque"
                valor={-Number(dre.variacao_estoque)}
                pct={pct(-Number(dre.variacao_estoque))}
                accent={Number(dre.variacao_estoque) > 0 ? "danger" : Number(dre.variacao_estoque) < 0 ? "success" : undefined}
                hint={Number(dre.variacao_estoque) > 0 ? "Consumo > compras" : Number(dre.variacao_estoque) < 0 ? "Acúmulo de estoque" : undefined}
              />
              <Linha
                label="= Resultado Bruto Ajustado"
                valor={Number(dre.resultado_bruto) - Number(dre.variacao_estoque)}
                pct={pct(Number(dre.resultado_bruto) - Number(dre.variacao_estoque))}
                section
              />
              <tr><td colSpan={3} className="p-3 text-xs uppercase text-muted-foreground bg-secondary/40">Despesas operacionais</td></tr>
              {despesas.map((d) => (
                <Linha
                  key={d.id}
                  label={`${d.categoria}${d.subcategoria ? ` · ${d.subcategoria}` : ""}`}
                  valor={-Number(d.valor)}
                  pct={pct(-Number(d.valor))}
                  indent
                />
              ))}
              <Linha label="(-) Total Despesas" valor={-Number(dre.total_despesas)} pct={pct(-Number(dre.total_despesas))} />
              <Linha
                label="= Resultado Líquido Gerencial"
                valor={Number(dre.resultado_liquido_gerencial)}
                pct={pct(Number(dre.resultado_liquido_gerencial))}
                section
                accent={Number(dre.resultado_liquido_gerencial) >= 0 ? "success" : "danger"}
              />
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({
  label, valor, pct, section, accent, indent, hint,
}: {
  label: string; valor: number; pct: number;
  section?: boolean; accent?: "success" | "danger"; indent?: boolean; hint?: string;
}) {
  return (
    <tr className={cn("border-b", section && "bg-secondary/50 font-semibold")}>
      <td className={cn("p-3", indent && "pl-8")}>
        {label}
        {hint && <span className="ml-2 text-xs text-muted-foreground">({hint})</span>}
      </td>
      <td className={cn(
        "p-3 text-right tabular-nums",
        accent === "success" && "text-success",
        accent === "danger" && "text-destructive",
      )}>
        {fmtBRL(valor)}
      </td>
      <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">{fmtPct(pct)}</td>
    </tr>
  );
}
