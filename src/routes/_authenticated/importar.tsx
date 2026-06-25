import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sha256Hex, mesNome } from "@/lib/finance";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, RefreshCw, ScanLine,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { DreEditor, emptyDreValues, type DreFormValues } from "@/components/DreEditor";

type TipoArquivo = Database["public"]["Enums"]["tipo_arquivo"];
type StatusArquivo = Database["public"]["Enums"]["status_arquivo"];

const TIPOS: { key: TipoArquivo; label: string; desc: string }[] = [
  { key: "dre", label: "DRE", desc: "Demonstrativo de Resultado do mês" },
  { key: "estoque_inicial", label: "Estoque Inicial", desc: "Inventário no início do período" },
  { key: "estoque_final", label: "Estoque Final", desc: "Inventário no fim do período" },
];

export const Route = createFileRoute("/_authenticated/importar")({
  component: Importar,
});

interface DreExtracted {
  total_vendas?: number | null;
  devolucoes?: number | null;
  cmv?: number | null;
  resultado_bruto?: number | null;
  total_despesas?: number | null;
  resultado_liquido?: number | null;
  despesas?: Array<{ categoria: string; subcategoria?: string | null; valor: number; percentual_venda?: number | null }>;
  __warnings?: string[];
}
interface EstoqueExtracted {
  data_referencia?: string | null;
  total_itens?: number | null;
  total_valor?: number | null;
  itens?: Array<{ codigo?: string | null; produto: string; unidade?: string | null; quantidade: number; valor_unitario: number; valor_total: number }>;
}

function Importar() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();
  const qc = useQueryClient();

  const arquivosQ = useQuery({
    queryKey: ["arquivos", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arquivos_importados")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("mes", periodo.mes)
        .eq("ano", periodo.ano)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // DRE existente (para preencher o formulário se já houver dados salvos).
  const dreExistenteQ = useQuery({
    queryKey: ["dre-existente", empresaId, periodo.mes, periodo.ano],
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

  const [form, setForm] = useState<DreFormValues>(() => emptyDreValues());
  const [formInit, setFormInit] = useState(false);

  // Preenche o formulário automaticamente quando dados aparecerem
  // (DRE já salva > extração de PDF > vazio).
  const autoValues = useMemo<DreFormValues | null>(() => {
    const arquivos = arquivosQ.data ?? [];
    const dre = dreExistenteQ.data?.dre;
    const despesasDB = dreExistenteQ.data?.despesas ?? [];
    if (dre) {
      return {
        total_vendas: Number(dre.total_vendas) || 0,
        devolucoes: Number(dre.devolucoes ?? 0) || 0,
        cmv: Number(dre.cmv) || 0,
        total_despesas: Number(dre.total_despesas) || 0,
        estoque_inicial: Number(dre.estoque_inicial_valor ?? 0) || 0,
        estoque_final: Number(dre.estoque_final_valor ?? 0) || 0,
        despesas: despesasDB.map((d) => ({
          categoria: d.categoria,
          subcategoria: d.subcategoria,
          valor: Number(d.valor) || 0,
        })),
      };
    }
    const dreArq = arquivos.find((a) => a.tipo_arquivo === "dre")?.extracted_json as DreExtracted | undefined;
    const iniArq = arquivos.find((a) => a.tipo_arquivo === "estoque_inicial")?.extracted_json as EstoqueExtracted | undefined;
    const finArq = arquivos.find((a) => a.tipo_arquivo === "estoque_final")?.extracted_json as EstoqueExtracted | undefined;
    if (!dreArq && !iniArq && !finArq) return null;
    return {
      total_vendas: Number(dreArq?.total_vendas ?? 0) || 0,
      devolucoes: Number(dreArq?.devolucoes ?? 0) || 0,
      cmv: Number(dreArq?.cmv ?? 0) || 0,
      total_despesas: Number(dreArq?.total_despesas ?? 0) || 0,
      estoque_inicial: Number(iniArq?.total_valor ?? 0) || 0,
      estoque_final: Number(finArq?.total_valor ?? 0) || 0,
      despesas: (dreArq?.despesas ?? []).map((d) => ({
        categoria: d.categoria,
        subcategoria: d.subcategoria ?? "",
        valor: Number(d.valor) || 0,
      })),
    };
  }, [arquivosQ.data, dreExistenteQ.data]);

  useEffect(() => {
    if (!formInit && autoValues) {
      setForm(autoValues);
      setFormInit(true);
    }
  }, [autoValues, formInit]);

  // Sempre que mudar empresa/período, resetar form
  useEffect(() => {
    setFormInit(false);
    setForm(emptyDreValues());
  }, [empresaId, periodo.mes, periodo.ano]);

  const uploadMut = useMutation({
    mutationFn: async ({ file, tipo }: { file: File; tipo: TipoArquivo }) => {
      if (!empresaId) throw new Error("Empresa não selecionada");
      if (file.type !== "application/pdf") throw new Error("Apenas PDFs são aceitos");
      if (file.size > 20 * 1024 * 1024) throw new Error("Arquivo > 20MB");

      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);

      const { data: existing } = await supabase
        .from("arquivos_importados")
        .select("id, status")
        .eq("empresa_id", empresaId)
        .eq("hash_sha256", hash)
        .maybeSingle();
      if (existing) {
        toast.info("Arquivo já importado anteriormente — reusando registro.");
        return existing.id;
      }

      const path = `${empresaId}/${periodo.ano}-${String(periodo.mes).padStart(2, "0")}/${tipo}-${hash.slice(0, 12)}.pdf`;
      const { error: upErr } = await supabase.storage.from("financial-pdfs").upload(path, file, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from("arquivos_importados")
        .insert({
          empresa_id: empresaId,
          tipo_arquivo: tipo,
          nome_arquivo: file.name,
          storage_path: path,
          hash_sha256: hash,
          mes: periodo.mes,
          ano: periodo.ano,
          idempotency_key: `${empresaId}-${hash}`,
        })
        .select()
        .single();
      if (insErr) throw insErr;
      return inserted.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arquivos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no upload"),
  });

  const extractMut = useMutation({
    mutationFn: async ({ arquivo_id, force }: { arquivo_id: string; force?: boolean }) => {
      const { data: sessionRes } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("extract-financial-data", {
        body: { arquivo_id, idempotency_key: arquivo_id, force: !!force },
        headers: sessionRes.session
          ? { Authorization: `Bearer ${sessionRes.session.access_token}` }
          : undefined,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["arquivos"] });
      setFormInit(false); // permite repopular do extrato novo
      const warnings: string[] = data?.data?.__warnings ?? [];
      if (warnings.length) {
        toast.warning(`Extraído com observações: ${warnings[0]}`);
      } else {
        toast.success("Extração concluída — revise e edite abaixo.");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na extração"),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Empresa não selecionada");
      const arquivos = arquivosQ.data ?? [];
      const iniArq = arquivos.find((a) => a.tipo_arquivo === "estoque_inicial" && a.extracted_json);
      const finArq = arquivos.find((a) => a.tipo_arquivo === "estoque_final" && a.extracted_json);
      const dreArq = arquivos.find((a) => a.tipo_arquivo === "dre");

      const totalDespesas = form.despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0);
      const resultadoBruto = form.total_vendas - form.devolucoes - form.cmv;
      const variacao = form.estoque_inicial - form.estoque_final;
      const resultadoLiq = resultadoBruto - totalDespesas;

      const { data: dreRow, error: dreErr } = await supabase
        .from("dre_mensal")
        .upsert(
          {
            empresa_id: empresaId,
            mes: periodo.mes,
            ano: periodo.ano,
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
      if (dreErr) throw dreErr;

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
      if (despesas.length) {
        await supabase.from("despesas_detalhe").insert(despesas);
      }

      // Inventários (a partir dos PDFs extraídos, sem edição aqui — edita em /estoque).
      for (const [tipo, arq] of [
        ["inicial", iniArq],
        ["final", finArq],
      ] as const) {
        if (!arq?.extracted_json) continue;
        const data = arq.extracted_json as EstoqueExtracted;
        if (!data.data_referencia) continue;
        const { data: snap, error: sErr } = await supabase
          .from("inventario_snapshot")
          .upsert(
            {
              empresa_id: empresaId,
              data_referencia: data.data_referencia,
              tipo,
              total_valor: data.total_valor ?? 0,
              total_itens: data.total_itens ?? data.itens?.length ?? 0,
            },
            { onConflict: "empresa_id,data_referencia,tipo" },
          )
          .select()
          .single();
        if (sErr) throw sErr;
        await supabase.from("inventario_itens").delete().eq("snapshot_id", snap.id);
        const itens = (data.itens ?? []).map((i) => ({
          snapshot_id: snap.id,
          codigo: i.codigo ?? null,
          produto: i.produto,
          unidade: i.unidade ?? null,
          quantidade: i.quantidade ?? 0,
          valor_unitario: i.valor_unitario ?? 0,
          valor_total: i.valor_total ?? 0,
        }));
        if (itens.length) {
          for (let i = 0; i < itens.length; i += 500) {
            await supabase.from("inventario_itens").insert(itens.slice(i, i + 500));
          }
        }
        await supabase
          .from("arquivos_importados")
          .update({ status: "confirmado", snapshot_id: snap.id })
          .eq("id", arq.id);
      }

      if (dreArq) {
        await supabase
          .from("arquivos_importados")
          .update({ status: "confirmado", dre_id: dreRow.id })
          .eq("id", dreArq.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("DRE salva. Veja em DRE.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao confirmar"),
  });

  if (!empresaId) {
    return <p className="text-muted-foreground">Selecione uma empresa.</p>;
  }

  const arquivos = arquivosQ.data ?? [];
  const arquivoPorTipo = (t: TipoArquivo) => arquivos.find((a) => a.tipo_arquivo === t);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar PDFs</h1>
        <p className="text-sm text-muted-foreground">
          Período: {mesNome(periodo.mes)}/{periodo.ano} · Extração via scanner (sem IA) · Edite os valores antes de salvar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIPOS.map((t) => {
          const arq = arquivoPorTipo(t.key);
          return (
            <Card key={t.key}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t.label}
                </CardTitle>
                <CardDescription>{t.desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor={`f-${t.key}`} className="sr-only">PDF</Label>
                  <Input
                    id={`f-${t.key}`}
                    type="file"
                    accept="application/pdf"
                    disabled={uploadMut.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadMut.mutate({ file: f, tipo: t.key });
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                {arq && (
                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <div className="font-medium truncate">{arq.nome_arquivo}</div>
                    <StatusBadge status={arq.status} />
                    {arq.erro_mensagem && (
                      <div className="text-xs text-destructive">{arq.erro_mensagem}</div>
                    )}
                    {arq.status !== "confirmado" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => extractMut.mutate({ arquivo_id: arq.id })}
                          disabled={extractMut.isPending}
                        >
                          {arq.status === "extraido" ? (
                            <><RefreshCw className="h-3 w-3 mr-1" />Re-escanear</>
                          ) : (
                            <><ScanLine className="h-3 w-3 mr-1" />Escanear PDF</>
                          )}
                        </Button>
                        {(arq.status === "erro" || arq.status === "extraido") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => extractMut.mutate({ arquivo_id: arq.id, force: true })}
                            disabled={extractMut.isPending}
                            title="Ignora cache e reprocessa o PDF do zero"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />Forçar reprocessar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle>Lançamento manual / Revisão</CardTitle>
              <CardDescription>
                Edite os números, adicione despesas e clique em salvar. Você não precisa de PDF: pode lançar diretamente.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setForm(emptyDreValues());
                setFormInit(true);
              }}
            >
              Limpar formulário
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DreEditor values={form} onChange={setForm} />
          <Button onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
            {confirmMut.isPending ? "Salvando..." : "Salvar DRE do período"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusArquivo }) {
  const map: Record<StatusArquivo, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" }> = {
    pendente: { label: "Pendente", icon: <FileText className="h-3 w-3" />, variant: "secondary" },
    processando: { label: "Processando", icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "secondary" },
    extraido: { label: "Extraído", icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
    confirmado: { label: "Confirmado", icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
    erro: { label: "Erro", icon: <AlertCircle className="h-3 w-3" />, variant: "destructive" },
  };
  const cur = map[status];
  return <Badge variant={cur.variant} className="gap-1">{cur.icon}{cur.label}</Badge>;
}
