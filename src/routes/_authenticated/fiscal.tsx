import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtBRL, mesNome } from "@/lib/finance";
import { cn } from "@/lib/utils";
import {
  TRIBUTO_LABEL,
  estimativaPorTributo,
  tributosDoRegime,
  REGIME_LABEL,
  type ConfigTributaria,
  type RegimeTributario,
  type TipoLancamentoFiscal,
} from "@/lib/fiscal";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fiscal")({
  component: FiscalPage,
});

type LancRow = {
  id?: string;
  tipo: TipoLancamentoFiscal;
  label: string;
  valor_real: number;
  sinal: number;
  data_pagamento: string | null;
  observacao: string | null;
};

function FiscalPage() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();
  const qc = useQueryClient();

  const ctx = useQuery({
    queryKey: ["fiscal-ctx", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: empresa } = await supabase
        .from("empresas")
        .select("id, nome, regime_tributario, config_tributaria")
        .eq("id", empresaId!)
        .maybeSingle();
      const { data: dre } = await supabase
        .from("dre_mensal")
        .select("total_vendas, devolucoes, cmv, variacao_estoque, total_despesas")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null)
        .maybeSingle();
      const { data: lanc } = await supabase
        .from("lancamentos_fiscais")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null)
        .order("tipo");
      return { empresa, dre, lancamentos: lanc ?? [] };
    },
  });

  const regime: RegimeTributario = (ctx.data?.empresa?.regime_tributario as RegimeTributario) ?? "simples";
  const cfg = (ctx.data?.empresa?.config_tributaria as ConfigTributaria | null) ?? null;
  const dre = ctx.data?.dre;

  const estimativas = dre
    ? estimativaPorTributo(
        {
          total_vendas: Number(dre.total_vendas),
          cmv: Number(dre.cmv),
          variacao_estoque: Number(dre.variacao_estoque),
          total_despesas: Number(dre.total_despesas),
          devolucoes: Number(dre.devolucoes ?? 0),
        },
        regime,
        cfg,
      )
    : ({} as Record<TipoLancamentoFiscal, number>);

  const [rows, setRows] = useState<LancRow[]>([]);

  useEffect(() => {
    if (!ctx.data) return;
    const tributos = tributosDoRegime(regime);
    const existentes: Record<string, LancRow> = {};
    for (const l of ctx.data.lancamentos) {
      const k = `${l.tipo}::${l.label ?? ""}`;
      existentes[k] = {
        id: l.id,
        tipo: l.tipo as TipoLancamentoFiscal,
        label: l.label ?? "",
        valor_real: Number(l.valor_real) || 0,
        sinal: Number(l.sinal) || 1,
        data_pagamento: l.data_pagamento,
        observacao: l.observacao,
      };
    }
    const novo: LancRow[] = tributos.map((t) => {
      const k = `${t}::`;
      if (existentes[k]) return existentes[k];
      return {
        tipo: t,
        label: "",
        valor_real: 0,
        sinal: 1,
        data_pagamento: null,
        observacao: null,
      };
    });
    // Extras (outros e duplicados com label)
    for (const l of ctx.data.lancamentos) {
      if (l.tipo === "outros" || (l.label && l.label.length > 0)) {
        novo.push({
          id: l.id,
          tipo: l.tipo as TipoLancamentoFiscal,
          label: l.label ?? "",
          valor_real: Number(l.valor_real) || 0,
          sinal: Number(l.sinal) || 1,
          data_pagamento: l.data_pagamento,
          observacao: l.observacao,
        });
      }
    }
    setRows(novo);
  }, [ctx.data, regime]);

  const saveMut = useMutation({
    mutationFn: async (row: LancRow) => {
      if (!empresaId) throw new Error("Sem empresa");
      const est = estimativas[row.tipo] ?? 0;
      const payload = {
        empresa_id: empresaId,
        mes: periodo.mes,
        ano: periodo.ano,
        tipo: row.tipo,
        label: row.label || null,
        valor_real: row.valor_real,
        valor_estimado: est,
        sinal: row.sinal,
        data_pagamento: row.data_pagamento,
        observacao: row.observacao,
      };
      if (row.id) {
        const { error } = await supabase.from("lancamentos_fiscais").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lancamentos_fiscais").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Lançamento salvo.");
      qc.invalidateQueries({ queryKey: ["fiscal-ctx"] });
      qc.invalidateQueries({ queryKey: ["dre-full"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lancamentos_fiscais")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido.");
      qc.invalidateQueries({ queryKey: ["fiscal-ctx"] });
      qc.invalidateQueries({ queryKey: ["dre-full"] });
    },
  });

  function setRow(idx: number, patch: Partial<LancRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addOutro() {
    setRows((rs) => [
      ...rs,
      { tipo: "outros", label: "", valor_real: 0, sinal: 1, data_pagamento: null, observacao: null },
    ]);
  }
  function usarEstimativa(idx: number) {
    const r = rows[idx];
    const est = estimativas[r.tipo] ?? 0;
    setRow(idx, { valor_real: Number(est.toFixed(2)) });
  }

  if (!empresaId) return <p className="text-muted-foreground">Selecione uma empresa.</p>;
  if (ctx.isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!dre) {
    return (
      <div className="rounded border bg-card p-8 text-center text-muted-foreground">
        Importe a DRE de {mesNome(periodo.mes)}/{periodo.ano} antes de lançar os tributos.
      </div>
    );
  }

  const totalEst = rows.reduce((s, r) => s + (estimativas[r.tipo] ?? 0), 0);
  const totalReal = rows.reduce((s, r) => s + r.sinal * (r.valor_real || 0), 0);
  const diff = totalReal - totalEst;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lançamentos Fiscais</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.data?.empresa?.nome} · {mesNome(periodo.mes)}/{periodo.ano} · {REGIME_LABEL[regime]}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Total Estimado" valor={totalEst} />
        <Stat label="Total Real" valor={totalReal} accent />
        <Stat label="Diferença" valor={diff} sign />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tributos do período</CardTitle>
          <Button size="sm" variant="outline" onClick={addOutro}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar ajuste/outro
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="text-left p-3">Tributo</th>
                <th className="text-right p-3 w-32">Estimado</th>
                <th className="text-right p-3 w-40">Valor Real</th>
                <th className="text-right p-3 w-28">Diferença</th>
                <th className="text-left p-3 w-36">Pagamento</th>
                <th className="text-left p-3">Observação</th>
                <th className="text-right p-3 w-32">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const est = estimativas[r.tipo] ?? 0;
                const dif = r.sinal * (r.valor_real || 0) - est;
                const isOutro = r.tipo === "outros";
                return (
                  <tr key={`${r.tipo}-${i}`} className="border-b align-top">
                    <td className="p-3">
                      <div className="font-medium">{TRIBUTO_LABEL[r.tipo]}</div>
                      {isOutro && (
                        <Input
                          className="mt-1 h-8 text-xs"
                          placeholder="Descrição (ex.: Retenção INSS)"
                          value={r.label}
                          onChange={(e) => setRow(i, { label: e.target.value })}
                        />
                      )}
                      {isOutro && (
                        <select
                          className="mt-1 text-xs rounded border bg-background px-1 py-0.5"
                          value={r.sinal}
                          onChange={(e) => setRow(i, { sinal: Number(e.target.value) })}
                        >
                          <option value={1}>Despesa (+)</option>
                          <option value={-1}>Crédito (−)</option>
                        </select>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {isOutro ? "—" : fmtBRL(est)}
                    </td>
                    <td className="p-3 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="text-right h-9"
                        value={r.valor_real}
                        onChange={(e) => setRow(i, { valor_real: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td
                      className={cn(
                        "p-3 text-right tabular-nums text-xs",
                        dif > 0 && "text-destructive",
                        dif < 0 && "text-success",
                      )}
                    >
                      {isOutro ? "—" : fmtBRL(dif)}
                    </td>
                    <td className="p-3">
                      <Input
                        type="date"
                        className="h-9"
                        value={r.data_pagamento ?? ""}
                        onChange={(e) => setRow(i, { data_pagamento: e.target.value || null })}
                      />
                    </td>
                    <td className="p-3">
                      <Textarea
                        rows={1}
                        className="min-h-9"
                        value={r.observacao ?? ""}
                        onChange={(e) => setRow(i, { observacao: e.target.value || null })}
                      />
                    </td>
                    <td className="p-3 text-right space-y-1">
                      <div className="flex gap-1 justify-end">
                        {!isOutro && (
                          <Button size="sm" variant="ghost" onClick={() => usarEstimativa(i)} title="Usar estimativa">
                            =
                          </Button>
                        )}
                        <Button size="sm" onClick={() => saveMut.mutate(r)} disabled={saveMut.isPending}>
                          <Save className="h-4 w-4" />
                        </Button>
                        {r.id && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMut.mutate(r.id!)}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Dica: clique em <strong>=</strong> para copiar o valor estimado, ajuste se preciso e salve. Os valores reais
        passam a alimentar a DRE Fiscal (modo <strong>Real</strong>).
      </p>
    </div>
  );
}

function Stat({ label, valor, accent, sign }: { label: string; valor: number; accent?: boolean; sign?: boolean }) {
  return (
    <div className={cn("rounded border p-3", accent && "bg-secondary/50")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          sign && valor > 0 && "text-destructive",
          sign && valor < 0 && "text-success",
        )}
      >
        {fmtBRL(valor)}
      </div>
    </div>
  );
}
