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
  normalizeRegime,
  normalizeConfig,
  mergeConfig,
  REGIME_LABEL,
  type ConfigTributaria,
  type RegimeTributario,
  type TipoLancamentoFiscal,
} from "@/lib/fiscal";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Save, Info, ChevronDown, Percent } from "lucide-react";

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

  const regime: RegimeTributario = normalizeRegime(ctx.data?.empresa?.regime_tributario);
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
        return row.id;
      }
      // Novo lançamento: devolve o id para o estado local, evitando duplicata
      // ao salvar a mesma linha uma segunda vez.
      const { data, error } = await supabase
        .from("lancamentos_fiscais")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo.");
      qc.invalidateQueries({ queryKey: ["fiscal-ctx"] });
      qc.invalidateQueries({ queryKey: ["dre-full"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  /** Salva de uma vez todas as linhas com valor lançado (ou já salvas). */
  const salvarTudoMut = useMutation({
    mutationFn: async () => {
      const alvos = rows.filter((r) => r.id || (r.valor_real ?? 0) !== 0);
      if (alvos.length === 0) throw new Error("Nenhum valor lançado para salvar.");
      for (const r of alvos) await saveMut.mutateAsync(r);
      return alvos.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} lançamento(s) salvo(s).`);
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
  function removeRow(idx: number) {
    const r = rows[idx];
    if (r.id) {
      if (!confirm("Excluir este lançamento salvo? Esta ação não pode ser desfeita.")) return;
      deleteMut.mutate(r.id);
    }
    setRows((rs) => rs.filter((_, i) => i !== idx));
  }
  function limparTributo(idx: number) {
    const r = rows[idx];
    if (r.id) {
      if (!confirm("Limpar este tributo? O lançamento salvo será removido.")) return;
      deleteMut.mutate(r.id);
    }
    setRow(idx, { id: undefined, valor_real: 0, data_pagamento: null, observacao: null });
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

      <HelpCard />

      <ConfigTributariaCard
        empresaId={empresaId}
        regime={regime}
        cfgRaw={ctx.data?.empresa?.config_tributaria as Record<string, unknown> | null}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["fiscal-ctx"] });
          qc.invalidateQueries({ queryKey: ["dre-full"] });
        }}
      />


      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Total Estimado" valor={totalEst} />
        <Stat label="Total Real" valor={totalReal} accent />
        <Stat label="Diferença" valor={diff} sign />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tributos do período</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Digite o <strong>Valor Real</strong> pago e clique em <strong>Salvar tudo</strong>. Só
              lançamentos salvos entram na DRE Fiscal (aba "Real").
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addOutro}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar ajuste/outro
            </Button>
            <Button
              size="sm"
              onClick={() => salvarTudoMut.mutate()}
              disabled={salvarTudoMut.isPending || saveMut.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {salvarTudoMut.isPending ? "Salvando..." : "Salvar tudo"}
            </Button>
          </div>
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
                      {!r.id && (r.valor_real ?? 0) !== 0 && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          não salvo
                        </span>
                      )}
                      {r.id && (
                        <span className="mt-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          salvo · na DRE
                        </span>
                      )}
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
                        <Button size="sm" onClick={() => saveMut.mutate(r)} disabled={saveMut.isPending} title="Salvar esta linha">
                          <Save className="h-4 w-4 mr-1" /> Salvar
                        </Button>
                        {isOutro ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeRow(i)}
                            disabled={deleteMut.isPending}
                            title="Excluir ajuste"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          r.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => limparTributo(i)}
                              disabled={deleteMut.isPending}
                              title="Limpar valor lançado"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )
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

    </div>
  );
}

// --- Editor de alíquotas e parâmetros tributários (empresas.config_tributaria) ---

type CfgField = {
  key: keyof ConfigTributaria;
  label: string;
  hint?: string;
  kind: "pct" | "brl";
};

const CFG_FIELDS: CfgField[] = [
  { key: "pis", label: "PIS", kind: "pct" },
  { key: "cofins", label: "COFINS", kind: "pct" },
  { key: "icms", label: "ICMS", kind: "pct" },
  { key: "irpj", label: "IRPJ", kind: "pct" },
  { key: "adicional_irpj", label: "Adicional IRPJ", hint: "Sobre o lucro acima do limite mensal", kind: "pct" },
  { key: "adicional_irpj_limite", label: "Limite do adicional (R$/mês)", hint: "Lei 9.249/95: R$ 20.000", kind: "brl" },
  { key: "csll", label: "CSLL", kind: "pct" },
  {
    key: "pis_cofins_pct_receita_tributada",
    label: "% da receita tributada por PIS/COFINS",
    hint: "Carnes têm alíquota zero (Lei 12.839/2013) — definir com o contador",
    kind: "pct",
  },
  {
    key: "pis_cofins_pct_base_credito",
    label: "% das compras com crédito PIS/COFINS",
    hint: "Insumos com direito a crédito — definir com o contador",
    kind: "pct",
  },
];

function ConfigTributariaCard({
  empresaId,
  regime,
  cfgRaw,
  onSaved,
}: {
  empresaId: string;
  regime: RegimeTributario;
  cfgRaw: Record<string, unknown> | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const efetiva = mergeConfig(regime, cfgRaw); // defaults + config da empresa
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [estimativas, setEstimativas] = useState<boolean>(efetiva.estimativas_habilitadas !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEstimativas(mergeConfig(regime, cfgRaw).estimativas_habilitadas !== false);
    setDraft({});
  }, [cfgRaw, regime, empresaId]);

  function shown(f: CfgField): string {
    if (draft[f.key] !== undefined) return draft[f.key];
    const v = efetiva[f.key];
    if (typeof v !== "number") return "";
    return f.kind === "pct" ? String(+(v * 100).toFixed(4)) : String(v);
  }

  async function salvar() {
    setSaving(true);
    try {
      // Parte da config já normalizada da empresa (preserva o que não está no formulário)
      const atual = normalizeConfig(cfgRaw);
      const novo: Record<string, number | boolean> = { ...atual } as Record<string, number | boolean>;
      for (const f of CFG_FIELDS) {
        const raw = draft[f.key] !== undefined ? draft[f.key] : shown(f);
        if (raw === "") continue;
        const n = Number(String(raw).replace(",", "."));
        if (!isFinite(n) || n < 0) {
          toast.error(`Valor inválido em "${f.label}".`);
          setSaving(false);
          return;
        }
        novo[f.key] = f.kind === "pct" ? n / 100 : n;
      }
      novo.estimativas_habilitadas = estimativas;
      const { error } = await supabase
        .from("empresas")
        .update({ config_tributaria: novo })
        .eq("id", empresaId);
      if (error) throw error;
      toast.success("Alíquotas salvas.");
      setDraft({});
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alíquotas");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between cursor-pointer select-none py-3"
        onClick={() => setOpen((o) => !o)}
      >
        <CardTitle className="text-base flex items-center gap-2">
          <Percent className="h-4 w-4" /> Alíquotas e parâmetros do cálculo
        </CardTitle>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Estimativas {estimativas ? "ativadas" : "desativadas"}
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label htmlFor="sw-estimativas" className="font-medium">
                Usar estimativas automáticas no cálculo fiscal
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Desativado: apenas os lançamentos manuais compõem a DRE Fiscal; as estimativas
                permanecem visíveis como referência na coluna "Estimado".
              </p>
            </div>
            <Switch id="sw-estimativas" checked={estimativas} onCheckedChange={setEstimativas} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CFG_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`cfg-${f.key}`} className="text-xs">
                  {f.label} {f.kind === "pct" ? "(%)" : ""}
                </Label>
                <Input
                  id={`cfg-${f.key}`}
                  inputMode="decimal"
                  value={shown(f)}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
                {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Valores em % (ex.: 1,65). Estimativas são provisão gerencial — a apuração
              definitiva de IRPJ/CSLL (LALUR) é do contador.
            </p>
            <Button size="sm" onClick={salvar} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar alíquotas"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function HelpCard() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("fiscal-help-open");
    return v === null ? true : v === "1";
  });
  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("fiscal-help-open", next ? "1" : "0");
      }
      return next;
    });
  }
  return (
    <Card className="border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Como preencher esta tela</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm space-y-3 text-muted-foreground">
          <section>
            <p className="font-medium text-foreground">Para que serve</p>
            <p>
              Registrar o valor <strong>real</strong> dos impostos pagos no mês, para que a DRE Fiscal mostre o
              resultado verdadeiro — e não apenas uma estimativa.
            </p>
          </section>

          <section>
            <p className="font-medium text-foreground">De onde vem a coluna “Estimado”</p>
            <p>
              É um cálculo automático com base no regime tributário da empresa (Simples / Presumido / Real), aplicado
              sobre a Receita ou o Lucro do período. Serve só como referência: quem manda é o <strong>Valor Real</strong>.
            </p>
          </section>

          <section>
            <p className="font-medium text-foreground">Como lançar cada tributo (passo a passo)</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Pegue a guia paga no mês (DAS, DARF, GNRE etc.).</li>
              <li>
                Digite o valor pago em <strong>Valor Real</strong>. Para começar a partir da estimativa, clique no
                botão <strong>=</strong>.
              </li>
              <li>Opcional: informe a data de pagamento e uma observação (nº da guia, parcelamento, etc.).</li>
              <li>
                Clique em <strong>Salvar</strong> (ícone de disquete).
              </li>
            </ol>
            <p className="mt-1">
              Se um tributo não foi devido no mês, deixe o Valor Real em <strong>0</strong> e salve — ou use o botão
              de lixeira ao lado para limpar um lançamento salvo.
            </p>
          </section>

          <section>
            <p className="font-medium text-foreground">Ajustes / Outros</p>
            <p>
              Use <strong>Adicionar ajuste/outro</strong> para itens fora do regime: retenções (INSS, IRRF, ISS),
              créditos tributários, multas, parcelamentos. Escolha o sinal:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Despesa (+)</strong>: soma aos tributos e reduz o lucro.
              </li>
              <li>
                <strong>Crédito (−)</strong>: abate dos tributos e aumenta o lucro.
              </li>
            </ul>
            <p>Cada ajuste pode ser excluído pela lixeira da própria linha.</p>
          </section>

          <section>
            <p className="font-medium text-foreground">Coluna “Diferença”</p>
            <p>
              Mostra <code>Real − Estimado</code>. <span className="text-destructive">Vermelho</span> = pagou mais
              que o estimado; <span className="text-success">verde</span> = pagou menos. Serve de alerta para revisar.
            </p>
          </section>

          <section>
            <p className="font-medium text-foreground">Impacto na DRE</p>
            <p>
              No modo <strong>Fiscal Real</strong>, a DRE usa exatamente os valores lançados aqui. No modo
              <strong> Fiscal Estimado</strong>, continua usando o cálculo automático do regime.
            </p>
            <p>
              A diferença entre <strong>Gerencial</strong> e <strong>Fiscal</strong> corresponde apenas aos tributos
              — a base operacional (Receita − CMV − Variação de Estoque − Despesas) é a mesma nas duas visões.
            </p>
          </section>
        </div>
      )}
    </Card>
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
