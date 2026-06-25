// Editor de DRE reutilizável: totais + lista editável de despesas.
// Usado em /importar (revisão antes de confirmar) e em /dre (botão "Editar").

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { fmtBRL } from "@/lib/finance";

export const CATEGORIAS_DESPESA = [
  "Folha de Pagamento",
  "Pró-labore",
  "Aluguel",
  "Energia",
  "Água",
  "Telefone/Internet",
  "Marketing",
  "Manutenção",
  "Impostos e Taxas",
  "Serviços de Terceiros",
  "Material de Consumo",
  "Combustível",
  "Despesas Financeiras",
  "Frete",
  "Outras",
] as const;

export interface DespesaItem {
  categoria: string;
  subcategoria: string | null;
  valor: number;
}

export interface DreFormValues {
  total_vendas: number;
  devolucoes: number;
  cmv: number;
  total_despesas: number;
  estoque_inicial: number;
  estoque_final: number;
  despesas: DespesaItem[];
}

export function emptyDreValues(): DreFormValues {
  return {
    total_vendas: 0,
    devolucoes: 0,
    cmv: 0,
    total_despesas: 0,
    estoque_inicial: 0,
    estoque_final: 0,
    despesas: [],
  };
}

interface Props {
  values: DreFormValues;
  onChange: (v: DreFormValues) => void;
  /** Se true, calcula total_despesas a partir da soma das linhas. */
  autoTotalDespesas?: boolean;
}

export function DreEditor({ values, onChange, autoTotalDespesas = true }: Props) {
  const somaDespesas = useMemo(
    () => values.despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0),
    [values.despesas],
  );

  const totalDespesasUsado = autoTotalDespesas ? somaDespesas : values.total_despesas;
  const resultadoBruto = values.total_vendas - values.devolucoes - values.cmv;
  const variacao = values.estoque_inicial - values.estoque_final;
  const resultadoLiq = resultadoBruto - totalDespesasUsado;

  const set = <K extends keyof DreFormValues>(k: K, v: DreFormValues[K]) =>
    onChange({ ...values, [k]: v });

  const updateDespesa = (i: number, patch: Partial<DespesaItem>) => {
    const next = values.despesas.slice();
    next[i] = { ...next[i], ...patch };
    onChange({
      ...values,
      despesas: next,
      total_despesas: autoTotalDespesas
        ? next.reduce((s, d) => s + (Number(d.valor) || 0), 0)
        : values.total_despesas,
    });
  };

  const addDespesa = () => {
    const next = [...values.despesas, { categoria: "Outras", subcategoria: "", valor: 0 }];
    onChange({ ...values, despesas: next });
  };

  const removeDespesa = (i: number) => {
    const next = values.despesas.filter((_, idx) => idx !== i);
    onChange({
      ...values,
      despesas: next,
      total_despesas: autoTotalDespesas
        ? next.reduce((s, d) => s + (Number(d.valor) || 0), 0)
        : values.total_despesas,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumField label="Total de vendas" value={values.total_vendas} onChange={(v) => set("total_vendas", v)} />
        <NumField label="Devoluções" value={values.devolucoes} onChange={(v) => set("devolucoes", v)} />
        <NumField label="CMV" value={values.cmv} onChange={(v) => set("cmv", v)} />
        <ReadField label="Resultado bruto" value={resultadoBruto} />
        <NumField label="Estoque inicial" value={values.estoque_inicial} onChange={(v) => set("estoque_inicial", v)} />
        <NumField label="Estoque final" value={values.estoque_final} onChange={(v) => set("estoque_final", v)} />
        <ReadField label="Variação de estoque" value={variacao} />
        <ReadField label="Resultado líquido" value={resultadoLiq} highlight />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Despesas detalhadas</Label>
            <p className="text-xs text-muted-foreground">
              Total: {fmtBRL(somaDespesas)}{" "}
              {!autoTotalDespesas && values.total_despesas !== somaDespesas && (
                <span className="text-destructive">
                  · diverge do total declarado ({fmtBRL(values.total_despesas)})
                </span>
              )}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addDespesa}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar despesa
          </Button>
        </div>

        <div className="rounded border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2 w-48">Categoria</th>
                <th className="text-left p-2">Descrição</th>
                <th className="text-right p-2 w-40">Valor</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {values.despesas.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground text-sm">
                    Nenhuma despesa cadastrada. Clique em "Adicionar despesa".
                  </td>
                </tr>
              )}
              {values.despesas.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1.5">
                    <Select value={d.categoria} onValueChange={(v) => updateDespesa(i, { categoria: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS_DESPESA.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      value={d.subcategoria ?? ""}
                      onChange={(e) => updateDespesa(i, { subcategoria: e.target.value })}
                      placeholder="Descrição da despesa"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={d.valor}
                      onChange={(e) => updateDespesa(i, { valor: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs text-right tabular-nums"
                    />
                  </td>
                  <td className="p-1.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeDespesa(i)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="tabular-nums"
      />
    </div>
  );
}

function ReadField({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div
        className={
          "h-10 px-3 flex items-center rounded-md border bg-secondary/40 text-sm tabular-nums " +
          (highlight ? (value >= 0 ? "text-success font-semibold" : "text-destructive font-semibold") : "")
        }
      >
        {fmtBRL(value)}
      </div>
    </div>
  );
}
