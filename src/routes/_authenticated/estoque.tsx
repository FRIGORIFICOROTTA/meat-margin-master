import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaSelecionada, usePeriodo } from "@/lib/app-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtBRL, fmtNum, mesNome, categorizarProduto } from "@/lib/finance";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

import { RouteErrorCard } from "@/components/RouteErrorCard";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: EstoquePage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorCard error={error} reset={reset} page="estoque" />
  ),
});

function EstoquePage() {
  const [empresaId] = useEmpresaSelecionada();
  const [periodo] = usePeriodo();
  const [filtro, setFiltro] = useState("");

  const dataQ = useQuery({
    queryKey: ["estoque", empresaId, periodo.mes, periodo.ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: snaps, error: snapErr } = await supabase
        .from("inventario_snapshot")
        .select("*")
        .eq("empresa_id", empresaId!)
        .is("deleted_at", null)
        .order("data_referencia");
      if (snapErr) throw snapErr;
      const snapList = snaps ?? [];
      const all = await Promise.all(
        snapList.map(async (s) => {
          const { data: itens, error: itErr } = await supabase
            .from("inventario_itens")
            .select("*")
            .eq("snapshot_id", s.id);
          if (itErr) throw itErr;
          return { snap: s, itens: itens ?? [] };
        }),
      );
      // Encontra inicial e final mais relevantes ao período
      const inicial = all.find((x) => x.snap.tipo === "inicial");
      const final = all.find((x) => x.snap.tipo === "final");
      return { inicial, final };
    },
  });

  const linhas = useMemo(() => {
    if (!dataQ.data) return [];
    const ini = dataQ.data.inicial?.itens ?? [];
    const fin = dataQ.data.final?.itens ?? [];
    const mapa = new Map<string, {
      produto: string;
      categoria: string;
      unidade: string;
      qtdIni: number;
      qtdFin: number;
      valIni: number;
      valFin: number;
    }>();
    for (const i of ini) {
      const key = (i.codigo || i.produto).trim();
      const row = mapa.get(key) ?? {
        produto: i.produto,
        categoria: categorizarProduto(i.produto),
        unidade: i.unidade ?? "",
        qtdIni: 0, qtdFin: 0, valIni: 0, valFin: 0,
      };
      row.qtdIni += Number(i.quantidade);
      row.valIni += Number(i.valor_total);
      mapa.set(key, row);
    }
    for (const i of fin) {
      const key = (i.codigo || i.produto).trim();
      const row = mapa.get(key) ?? {
        produto: i.produto,
        categoria: categorizarProduto(i.produto),
        unidade: i.unidade ?? "",
        qtdIni: 0, qtdFin: 0, valIni: 0, valFin: 0,
      };
      row.qtdFin += Number(i.quantidade);
      row.valFin += Number(i.valor_total);
      mapa.set(key, row);
    }
    return Array.from(mapa.values()).sort((a, b) =>
      Math.abs(b.valFin - b.valIni) - Math.abs(a.valFin - a.valIni),
    );
  }, [dataQ.data]);

  const filtradas = useMemo(() => {
    const q = filtro.toLowerCase();
    return q ? linhas.filter((l) => l.produto.toLowerCase().includes(q) || l.categoria.toLowerCase().includes(q)) : linhas;
  }, [linhas, filtro]);

  if (!empresaId) return <p className="text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Estoque</h1>
        <p className="text-sm text-muted-foreground">Comparativo {mesNome(periodo.mes)}/{periodo.ano}</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Itens</CardTitle>
          <Input
            placeholder="Buscar produto ou categoria..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          {linhas.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">Sem inventários importados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="text-left p-2 pl-4">Produto</th>
                  <th className="text-left p-2">Categoria</th>
                  <th className="text-right p-2">Qtd Inicial</th>
                  <th className="text-right p-2">Qtd Final</th>
                  <th className="text-right p-2">Δ Qtd</th>
                  <th className="text-right p-2">R$ Inicial</th>
                  <th className="text-right p-2">R$ Final</th>
                  <th className="text-right p-2 pr-4">Δ R$</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, 500).map((l) => {
                  const dq = l.qtdFin - l.qtdIni;
                  const dv = l.valFin - l.valIni;
                  return (
                    <tr key={l.produto} className="border-b hover:bg-secondary/30">
                      <td className="p-2 pl-4">{l.produto}</td>
                      <td className="p-2 text-muted-foreground">{l.categoria}</td>
                      <td className="p-2 text-right tabular-nums">{fmtNum(l.qtdIni)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtNum(l.qtdFin)}</td>
                      <td className={cn("p-2 text-right tabular-nums", dq > 0 && "text-success", dq < 0 && "text-destructive")}>{fmtNum(dq)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBRL(l.valIni)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBRL(l.valFin)}</td>
                      <td className={cn("p-2 pr-4 text-right tabular-nums font-medium", dv > 0 && "text-success", dv < 0 && "text-destructive")}>{fmtBRL(dv)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {filtradas.length > 500 && (
            <div className="p-3 text-xs text-center text-muted-foreground">
              Mostrando 500 de {filtradas.length} itens. Use o filtro para refinar.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
