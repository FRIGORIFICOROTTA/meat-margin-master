import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtBRL, fmtPct, mesNome } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { calcularDREFiscal, calcularDREFiscalReal, normalizeRegime, REGIME_LABEL, type RegimeTributario } from "@/lib/fiscal";
import { exportDREPdf, exportDREExcel, type LinhaExport } from "@/lib/export-utils";
import { exportMemorialCalculoPdf } from "@/lib/memorial-export";
import { FileDown, FileSpreadsheet, Pencil, ScrollText } from "lucide-react";
import { DreEditor, type DreFormValues, emptyDreValues } from "@/components/DreEditor";
import { toast } from "sonner";

import { RouteErrorCard } from "@/components/RouteErrorCard";

export const Route = createFileRoute("/_authenticated/dre")({
  component: DrePage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorCard error={error} reset={reset} page="dre" />
  ),
});


function DrePage() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();
  const [modo, setModo] = useState<"gerencial" | "fiscal">("gerencial");
  const [fiscalSrc, setFiscalSrc] = useState<"estimado" | "real">("real");
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();


  const dreQ = useQuery({
    queryKey: ["dre-full", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: empresa, error: empErr } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, regime_tributario, config_tributaria")
        .eq("id", empresaId!)
        .maybeSingle();
      if (empErr) throw empErr;
      const { data: dre, error: dreErr } = await supabase
        .from("dre_mensal")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null)
        .maybeSingle();
      if (dreErr) throw dreErr;
      if (!dre) return { empresa, dre: null, despesas: [] as any[], lancamentos: [] as any[] };
      const { data: despesas, error: despErr } = await supabase
        .from("despesas_detalhe")
        .select("*")
        .eq("dre_id", dre.id);
      if (despErr) throw despErr;
      const { data: lancamentos, error: lancErr } = await supabase
        .from("lancamentos_fiscais")
        .select("tipo, label, valor_real, sinal")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .is("deleted_at", null);
      if (lancErr) throw lancErr;
      return { empresa, dre, despesas: despesas ?? [], lancamentos: lancamentos ?? [] };
    },
  });

  if (!empresaId) return <p className="text-muted-foreground">Selecione uma empresa.</p>;
  if (dreQ.isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!dreQ.data?.dre) {
    return (
      <div className="rounded border bg-card p-8 text-center text-muted-foreground">
        Nenhuma DRE para {mesNome(periodo.mes)}/{periodo.ano}. Vá em <strong>Importar</strong> para começar.
      </div>
    );
  }

  const { empresa, dre, despesas, lancamentos } = dreQ.data;
  const regime: RegimeTributario = normalizeRegime(empresa?.regime_tributario);
  const dreInput = {
    total_vendas: Number(dre.total_vendas),
    cmv: Number(dre.cmv),
    variacao_estoque: Number(dre.variacao_estoque),
    total_despesas: Number(dre.total_despesas),
    devolucoes: Number(dre.devolucoes ?? 0),
  };
  const cfg = (empresa?.config_tributaria as Record<string, unknown> | null) ?? null;
  const fiscalEstimado = calcularDREFiscal(dreInput, regime, cfg);
  const fiscalReal = calcularDREFiscalReal(dreInput, regime, cfg, lancamentos as any);
  const fiscal = fiscalSrc === "real" ? fiscalReal : fiscalEstimado;

  const v = Number(dre.total_vendas);
  const pct = (n: number) => (v > 0 ? n / v : 0);

  const linhasGerencial: LinhaExport[] = [
    { label: "Receita Bruta (Vendas)", valor: v, pct: 1, bold: true },
    { label: "(-) CMV do sistema", valor: -Number(dre.cmv), pct: pct(-Number(dre.cmv)) },
    { label: "(±) Variação de Estoque", valor: -Number(dre.variacao_estoque), pct: pct(-Number(dre.variacao_estoque)) },
    {
      label: "= Resultado Bruto Ajustado",
      valor: Number(dre.resultado_bruto) - Number(dre.variacao_estoque),
      pct: pct(Number(dre.resultado_bruto) - Number(dre.variacao_estoque)),
      bold: true,
    },
    ...despesas.map((d: any) => ({
      label: `${d.categoria}${d.subcategoria ? ` · ${d.subcategoria}` : ""}`,
      valor: -Number(d.valor),
      pct: pct(-Number(d.valor)),
    })),
    { label: "(-) Total Despesas", valor: -Number(dre.total_despesas), pct: pct(-Number(dre.total_despesas)) },
    {
      label: "= Resultado Líquido Gerencial",
      valor: Number(dre.resultado_bruto) - Number(dre.variacao_estoque) - Number(dre.total_despesas),
      pct: pct(Number(dre.resultado_bruto) - Number(dre.variacao_estoque) - Number(dre.total_despesas)),
      bold: true,
    },
  ];

  const linhasFiscal: LinhaExport[] = [
    { label: "Receita Bruta", valor: fiscal.receita_bruta, pct: 1, bold: true },
    ...(fiscal.devolucoes ? [{ label: "(-) Devoluções", valor: -fiscal.devolucoes, pct: pct(-fiscal.devolucoes) }] : []),
    ...fiscal.impostos_breakdown.map((i) => ({ label: `(-) ${i.label}`, valor: -i.valor, pct: pct(-i.valor) })),
    { label: "= Receita Líquida", valor: fiscal.receita_liquida, pct: pct(fiscal.receita_liquida), bold: true },
    { label: "(-) CMV do sistema", valor: -fiscal.cmv, pct: pct(-fiscal.cmv) },
    { label: "(±) Variação de Estoque", valor: -fiscal.variacao_estoque, pct: pct(-fiscal.variacao_estoque) },
    { label: "= Lucro Bruto", valor: fiscal.lucro_bruto, pct: pct(fiscal.lucro_bruto), bold: true },
    { label: "(-) Despesas Operacionais", valor: -fiscal.despesas_operacionais, pct: pct(-fiscal.despesas_operacionais) },
    { label: "= Lucro antes IR/CSLL", valor: fiscal.lucro_antes_ir, pct: pct(fiscal.lucro_antes_ir), bold: true },
    ...(fiscal.irpj ? [{ label: "(-) IRPJ", valor: -fiscal.irpj, pct: pct(-fiscal.irpj) }] : []),
    ...(fiscal.csll ? [{ label: "(-) CSLL", valor: -fiscal.csll, pct: pct(-fiscal.csll) }] : []),
    {
      label: "= Resultado Líquido Fiscal",
      valor: fiscal.resultado_liquido_fiscal,
      pct: pct(fiscal.resultado_liquido_fiscal),
      bold: true,
    },
  ];


  const linhas = modo === "gerencial" ? linhasGerencial : linhasFiscal;
  const modoLabel = modo === "gerencial" ? "Gerencial" : "Fiscal";

  function onPdf() {
    exportDREPdf({
      empresa: empresa?.nome ?? "Empresa",
      cnpj: empresa?.cnpj ?? null,
      mes: periodo.mes,
      ano: periodo.ano,
      modo: modoLabel,
      linhas,
    });
  }
  function onXlsx() {
    exportDREExcel({
      empresa: empresa?.nome ?? "Empresa",
      mes: periodo.mes,
      ano: periodo.ano,
      modo: modoLabel,
      dre: linhas,
      despesas: despesas.map((d: any) => ({
        categoria: d.categoria,
        subcategoria: d.subcategoria,
        valor: Number(d.valor),
      })),
    });
  }
  function onMemorial() {
    exportMemorialCalculoPdf({
      empresa: empresa?.nome ?? "Empresa",
      cnpj: empresa?.cnpj ?? null,
      regime,
      config: cfg,
      mes: periodo.mes,
      ano: periodo.ano,
      dre: {
        total_vendas: Number(dre.total_vendas) || 0,
        devolucoes: Number(dre.devolucoes ?? 0) || 0,
        cmv: Number(dre.cmv) || 0,
        variacao_estoque: Number(dre.variacao_estoque) || 0,
        total_despesas: Number(dre.total_despesas) || 0,
        estoque_inicial: Number(dre.estoque_inicial_valor ?? 0) || 0,
        estoque_final: Number(dre.estoque_final_valor ?? 0) || 0,
        resultado_bruto: Number(dre.resultado_bruto) || 0,
        resultado_liquido_gerencial:
          Number(dre.resultado_bruto) - Number(dre.variacao_estoque) - Number(dre.total_despesas),
      },
      fiscalEstimado,
      fiscalReal,
      temLancamentosReais: (lancamentos?.length ?? 0) > 0,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">DRE {modoLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {empresa?.nome} · {mesNome(periodo.mes)}/{periodo.ano} · {REGIME_LABEL[regime]}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={modo} onValueChange={(v) => setModo(v as any)}>
            <TabsList>
              <TabsTrigger value="gerencial">Gerencial</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
            </TabsList>
          </Tabs>
          {modo === "fiscal" && (
            <Tabs value={fiscalSrc} onValueChange={(v) => setFiscalSrc(v as any)}>
              <TabsList>
                <TabsTrigger value="estimado">Estimado</TabsTrigger>
                <TabsTrigger value="real">Real</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Button variant="default" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={onPdf}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={onXlsx}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={onMemorial} title="Relatório técnico das fórmulas para o contador validar">
            <ScrollText className="h-4 w-4 mr-1" /> Memorial p/ Contador
          </Button>
        </div>

      </div>

      {modo === "fiscal" && fiscalSrc === "real" && fiscalReal.faltando.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          <strong>{fiscalReal.faltando.length}</strong> tributo(s) sem lançamento real ({fiscalReal.faltando.join(", ").toUpperCase()}) — usando estimativa para esses. <a href="/fiscal" className="underline">Lançar agora</a>.
        </div>
      )}

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
              {linhas.map((l, i) => (
                <tr key={i} className={cn("border-b", l.bold && "bg-secondary/50 font-semibold")}>
                  <td className="p-3">{l.label}</td>
                  <td
                    className={cn(
                      "p-3 text-right tabular-nums",
                      l.bold && l.label.startsWith("=") && l.valor >= 0 && "text-success",
                      l.bold && l.label.startsWith("=") && l.valor < 0 && "text-destructive",
                    )}
                  >
                    {fmtBRL(l.valor)}
                  </td>
                  <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">
                    {l.pct != null ? fmtPct(l.pct) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {modo === "fiscal" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Comparativo Gerencial × Fiscal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <Comp label="Gerencial" valor={Number(dre.resultado_bruto) - Number(dre.variacao_estoque) - Number(dre.total_despesas)} />
              <Comp label="Fiscal" valor={fiscal.resultado_liquido_fiscal} />
              <Comp
                label="Diferença (tributos)"
                valor={fiscal.resultado_liquido_fiscal - (Number(dre.resultado_bruto) - Number(dre.variacao_estoque) - Number(dre.total_despesas))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ambas as visões usam a mesma base operacional (Receita − CMV − Variação de Estoque − Despesas).
              A diferença corresponde exclusivamente aos tributos (PIS/COFINS/ICMS/ISS/DAS + IRPJ + CSLL).
            </p>
          </CardContent>
        </Card>
      )}




      <EditDreDialog
        open={editing}
        onOpenChange={setEditing}
        empresaId={empresaId}
        mes={periodo.mes}
        ano={periodo.ano}
        initial={{
          total_vendas: Number(dre.total_vendas) || 0,
          devolucoes: Number(dre.devolucoes ?? 0) || 0,
          cmv: Number(dre.cmv) || 0,
          total_despesas: Number(dre.total_despesas) || 0,
          estoque_inicial: Number(dre.estoque_inicial_valor ?? 0) || 0,
          estoque_final: Number(dre.estoque_final_valor ?? 0) || 0,
          despesas: despesas.map((d: any) => ({
            categoria: d.categoria,
            subcategoria: d.subcategoria,
            valor: Number(d.valor) || 0,
          })),
        }}
        onSaved={() => {
          setEditing(false);
          qc.invalidateQueries({ queryKey: ["dre-full"] });
          qc.invalidateQueries();
        }}
      />
    </div>
  );
}

function EditDreDialog({
  open,
  onOpenChange,
  empresaId,
  mes,
  ano,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string;
  mes: number;
  ano: number;
  initial: DreFormValues;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DreFormValues>(initial);
  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const totalDespesas = form.despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0);
      const resultadoBruto = form.total_vendas - form.devolucoes - form.cmv;
      const variacao = form.estoque_inicial - form.estoque_final;
      const resultadoLiq = resultadoBruto - variacao - totalDespesas;
      const { data: dreRow, error } = await supabase
        .from("dre_mensal")
        .upsert(
          {
            empresa_id: empresaId,
            mes,
            ano,
            total_vendas: form.total_vendas,
            devolucoes: form.devolucoes,
            cmv: form.cmv,
            resultado_bruto: resultadoBruto,
            total_despesas: totalDespesas,
            resultado_liquido_gerencial: resultadoLiq,
            estoque_inicial_valor: form.estoque_inicial,
            estoque_final_valor: form.estoque_final,
            variacao_estoque: variacao,
          },
          { onConflict: "empresa_id,mes,ano" },
        )
        .select()
        .single();
      if (error) throw error;
      await supabase.from("despesas_detalhe").delete().eq("dre_id", dreRow.id);
      const despesas = form.despesas
        .filter((d) => (Number(d.valor) || 0) > 0)
        .map((d) => ({
          dre_id: dreRow.id,
          categoria: d.categoria,
          subcategoria: d.subcategoria || null,
          valor: Number(d.valor),
          percentual_venda: form.total_vendas > 0 ? Number(d.valor) / form.total_vendas : null,
        }));
      if (despesas.length) await supabase.from("despesas_detalhe").insert(despesas);
    },
    onSuccess: () => {
      toast.success("DRE atualizada.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar DRE — {mes}/{ano}</DialogTitle>
        </DialogHeader>
        <DreEditor values={form} onChange={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper para evitar warning sobre uso de emptyDreValues — disponível para futuros lançamentos manuais.
void emptyDreValues;

function Comp({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          valor >= 0 ? "text-success" : "text-destructive",
        )}
      >
        {fmtBRL(valor)}
      </div>
    </div>
  );
}

