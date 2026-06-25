import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sha256Hex, fmtBRL, mesNome } from "@/lib/finance";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

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

  const uploadMut = useMutation({
    mutationFn: async ({ file, tipo }: { file: File; tipo: TipoArquivo }) => {
      if (!empresaId) throw new Error("Empresa não selecionada");
      if (file.type !== "application/pdf") throw new Error("Apenas PDFs são aceitos");
      if (file.size > 20 * 1024 * 1024) throw new Error("Arquivo > 20MB");

      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);

      // Idempotência: já existe?
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arquivos"] });
      toast.success("Extração concluída — revise os dados abaixo.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na extração"),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error("Empresa não selecionada");
      const arquivos = arquivosQ.data ?? [];
      const dreArq = arquivos.find((a) => a.tipo_arquivo === "dre" && a.extracted_json);
      const iniArq = arquivos.find((a) => a.tipo_arquivo === "estoque_inicial" && a.extracted_json);
      const finArq = arquivos.find((a) => a.tipo_arquivo === "estoque_final" && a.extracted_json);
      if (!dreArq) throw new Error("Extraia a DRE primeiro");

      const dreData = dreArq.extracted_json as DreExtracted;
      const iniData = iniArq?.extracted_json as EstoqueExtracted | undefined;
      const finData = finArq?.extracted_json as EstoqueExtracted | undefined;

      const estoqueInicial = iniData?.total_valor ?? 0;
      const estoqueFinal = finData?.total_valor ?? 0;
      const variacao = estoqueInicial - estoqueFinal;
      const totalVendas = dreData.total_vendas ?? 0;
      const devolucoes = dreData.devolucoes ?? 0;
      const cmv = dreData.cmv ?? 0;
      const resultadoBruto = dreData.resultado_bruto ?? totalVendas - devolucoes - cmv;
      const totalDespesas = dreData.total_despesas ?? 0;
      const resultadoLiq = resultadoBruto - totalDespesas;

      // Upsert DRE
      const { data: dreRow, error: dreErr } = await supabase
        .from("dre_mensal")
        .upsert(
          {
            empresa_id: empresaId,
            mes: periodo.mes,
            ano: periodo.ano,
            total_vendas: totalVendas,
            devolucoes,
            cmv,
            resultado_bruto: resultadoBruto,
            total_despesas: totalDespesas,
            resultado_liquido_gerencial: resultadoLiq,
            estoque_inicial_valor: estoqueInicial,
            estoque_final_valor: estoqueFinal,
            variacao_estoque: variacao,
          },
          { onConflict: "empresa_id,mes,ano" },
        )
        .select()
        .single();
      if (dreErr) throw dreErr;

      // Despesas
      await supabase.from("despesas_detalhe").delete().eq("dre_id", dreRow.id);
      const despesas = (dreData.despesas ?? []).map((d) => ({
        dre_id: dreRow.id,
        categoria: d.categoria,
        subcategoria: d.subcategoria ?? null,
        valor: d.valor,
        percentual_venda: d.percentual_venda ?? null,
      }));
      if (despesas.length) {
        await supabase.from("despesas_detalhe").insert(despesas);
      }

      // Inventários
      for (const [tipo, data, arq] of [
        ["inicial", iniData, iniArq],
        ["final", finData, finArq],
      ] as const) {
        if (!data || !arq) continue;
        const { data: snap, error: sErr } = await supabase
          .from("inventario_snapshot")
          .upsert(
            {
              empresa_id: empresaId,
              data_referencia: data.data_referencia,
              tipo,
              total_valor: data.total_valor,
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
          // insere em lotes para evitar payload gigante
          for (let i = 0; i < itens.length; i += 500) {
            await supabase.from("inventario_itens").insert(itens.slice(i, i + 500));
          }
        }
        await supabase
          .from("arquivos_importados")
          .update({ status: "confirmado", snapshot_id: snap.id })
          .eq("id", arq.id);
      }

      await supabase
        .from("arquivos_importados")
        .update({ status: "confirmado", dre_id: dreRow.id })
        .eq("id", dreArq.id);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Período confirmado. Veja a DRE.");
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
          Período: {mesNome(periodo.mes)}/{periodo.ano}
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
                            <><RefreshCw className="h-3 w-3 mr-1" />Re-extrair</>
                          ) : (
                            <><Upload className="h-3 w-3 mr-1" />Extrair com IA</>
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
          <CardTitle>Revisão antes de confirmar</CardTitle>
          <CardDescription>
            Confira os números extraídos. Ao confirmar, a DRE é persistida no banco (idempotente).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Resumo arquivos={arquivos} />
          <Button
            onClick={() => confirmMut.mutate()}
            disabled={confirmMut.isPending || !arquivos.some((a) => a.tipo_arquivo === "dre" && a.extracted_json)}
          >
            {confirmMut.isPending ? "Salvando..." : "Confirmar e gerar DRE"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface DreExtracted {
  total_vendas?: number;
  devolucoes?: number;
  cmv?: number;
  resultado_bruto?: number;
  total_despesas?: number;
  resultado_liquido?: number;
  despesas?: Array<{ categoria: string; subcategoria?: string | null; valor: number; percentual_venda?: number }>;
}
interface EstoqueExtracted {
  data_referencia: string;
  total_itens?: number;
  total_valor: number;
  itens?: Array<{ codigo?: string; produto: string; unidade?: string; quantidade: number; valor_unitario: number; valor_total: number }>;
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

function Resumo({ arquivos }: { arquivos: Array<{ tipo_arquivo: TipoArquivo; extracted_json: unknown }> }) {
  const dre = arquivos.find((a) => a.tipo_arquivo === "dre")?.extracted_json as DreExtracted | undefined;
  const ini = arquivos.find((a) => a.tipo_arquivo === "estoque_inicial")?.extracted_json as EstoqueExtracted | undefined;
  const fin = arquivos.find((a) => a.tipo_arquivo === "estoque_final")?.extracted_json as EstoqueExtracted | undefined;
  const linhas: Array<[string, string]> = [
    ["Total de vendas", fmtBRL(dre?.total_vendas ?? null)],
    ["CMV", fmtBRL(dre?.cmv ?? null)],
    ["Resultado bruto", fmtBRL(dre?.resultado_bruto ?? null)],
    ["Total despesas", fmtBRL(dre?.total_despesas ?? null)],
    ["Estoque inicial", fmtBRL(ini?.total_valor ?? null)],
    ["Estoque final", fmtBRL(fin?.total_valor ?? null)],
    ["Variação de estoque", fmtBRL(ini && fin ? ini.total_valor - fin.total_valor : null)],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {linhas.map(([k, v]) => (
        <div key={k} className="rounded border p-3 bg-secondary/40">
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="text-sm font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}
